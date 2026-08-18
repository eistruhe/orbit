export type OutputFormat = "webp" | "avif"

export const MAX_SOURCE_DIMENSION = 8000

/**
 * Decodes an image file honoring EXIF orientation.
 */
export async function decodeImageFile(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  if (
    bitmap.width > MAX_SOURCE_DIMENSION ||
    bitmap.height > MAX_SOURCE_DIMENSION
  ) {
    bitmap.close()
    throw new Error(
      `Image is larger than ${MAX_SOURCE_DIMENSION}px — resize it first.`,
    )
  }
  return bitmap
}

/**
 * Draws `bitmap` scaled to `targetWidth` (aspect preserved; never upscales).
 */
export function drawResized(
  bitmap: ImageBitmap,
  targetWidth: number | null,
): OffscreenCanvas {
  const width = Math.min(targetWidth ?? bitmap.width, bitmap.width)
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas 2D context unavailable")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

/**
 * Encodes a canvas as WebP (native) or AVIF (WASM codec, lazily imported).
 * `quality` is 0–100.
 */
export async function encodeCanvas(
  canvas: OffscreenCanvas,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  if (format === "webp") {
    return canvas.convertToBlob({ type: "image/webp", quality: quality / 100 })
  }

  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas 2D context unavailable")
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { encode } = await import("@jsquash/avif")
  const encoded = await encode(imageData, { quality })
  return new Blob([encoded], { type: "image/avif" })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
