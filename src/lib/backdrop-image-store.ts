const DB_NAME = "orbit"
const DB_VERSION = 1
const STORE = "backdrop"
const IMAGE_KEY = "image"

/** Longest edge kept on disk; larger images add memory, not detail. */
const MAX_EDGE = 2560

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"))
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
    })
  } finally {
    db.close()
  }
}

/**
 * Downscales the picked image to MAX_EDGE and re-encodes it as WebP so the
 * stored copy stays small regardless of the source file.
 */
async function normalizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas is not available")
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/webp",
        0.9,
      )
    })
  } finally {
    bitmap.close()
  }
}

export async function saveBackdropImage(file: Blob): Promise<void> {
  const blob = await normalizeImage(file)
  await withStore("readwrite", (store) => store.put(blob, IMAGE_KEY))
}

export async function loadBackdropImage(): Promise<Blob | null> {
  const result = await withStore<unknown>("readonly", (store) => store.get(IMAGE_KEY))
  return result instanceof Blob ? result : null
}

export async function deleteBackdropImage(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(IMAGE_KEY))
}
