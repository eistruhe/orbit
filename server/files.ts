import { stat, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"

import { getUniqueSiblingPath } from "./util.ts"

/** Matches the Bun default body limit headroom; images stay well below it. */
const MAX_WRITE_BYTES = 64 * 1024 * 1024

export type WriteDerivedResult =
  | { ok: true; outputPath: string }
  | { ok: false; status: number; error: string }

export type WriteBatchResult =
  | { ok: true; written: { name: string; outputPath: string }[] }
  | { ok: false; status: number; error: string }

function decodeBase64(dataBase64: string): Buffer | null {
  try {
    const bytes = Buffer.from(dataBase64, "base64")
    return bytes.length > 0 ? bytes : null
  } catch {
    return null
  }
}

function sanitizeExtension(extension: string): string | null {
  const cleaned = extension.startsWith(".") ? extension : `.${extension}`
  return /^\.[a-z0-9]{1,12}$/i.test(cleaned) ? cleaned.toLowerCase() : null
}

function sanitizeSuffix(suffix: string): string | null {
  return /^[a-z0-9._@-]{0,40}$/i.test(suffix) ? suffix : null
}

/**
 * Writes derived bytes (e.g. a converted image) next to a user-picked
 * original, never overwriting existing files. Follows the Tinify precedent:
 * the original path came from an explicit user pick, so no root check.
 */
export async function writeDerivedFile(input: {
  originalPath: string
  suffix: string
  extension: string
  dataBase64: string
}): Promise<WriteDerivedResult> {
  const originalPath = resolve(input.originalPath)
  try {
    const st = await stat(originalPath)
    if (!st.isFile()) {
      return { ok: false, status: 400, error: "Original path is not a file" }
    }
  } catch {
    return { ok: false, status: 400, error: "Original file does not exist" }
  }

  const extension = sanitizeExtension(input.extension)
  if (!extension) {
    return { ok: false, status: 400, error: "Invalid output extension" }
  }
  const suffix = sanitizeSuffix(input.suffix)
  if (suffix === null) {
    return { ok: false, status: 400, error: "Invalid output suffix" }
  }

  const bytes = decodeBase64(input.dataBase64)
  if (!bytes) {
    return { ok: false, status: 400, error: "Missing or invalid file data" }
  }
  if (bytes.length > MAX_WRITE_BYTES) {
    return { ok: false, status: 413, error: "Output file is too large" }
  }

  try {
    const outputPath = await getUniqueSiblingPath(originalPath, suffix, extension)
    await writeFile(outputPath, bytes)
    return { ok: true, outputPath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 500, error: message }
  }
}

/**
 * Writes a set of named files into a user-picked directory. File names are
 * reduced to their basename so payloads cannot traverse out of the target.
 */
export async function writeBatchFiles(input: {
  dirPath: string
  files: { name: string; dataBase64: string }[]
}): Promise<WriteBatchResult> {
  const dirPath = resolve(input.dirPath)
  try {
    const st = await stat(dirPath)
    if (!st.isDirectory()) {
      return { ok: false, status: 400, error: "Target path is not a directory" }
    }
  } catch {
    return { ok: false, status: 400, error: "Target directory does not exist" }
  }

  if (input.files.length === 0) {
    return { ok: false, status: 400, error: "No files were provided" }
  }
  if (input.files.length > 50) {
    return { ok: false, status: 400, error: "Too many files in one batch" }
  }

  const written: { name: string; outputPath: string }[] = []
  for (const file of input.files) {
    const name = basename(file.name).trim()
    if (!name || name.startsWith(".") || name.includes("/") || name.includes("\\")) {
      return { ok: false, status: 400, error: `Invalid file name: ${file.name}` }
    }
    const bytes = decodeBase64(file.dataBase64)
    if (!bytes) {
      return { ok: false, status: 400, error: `Missing data for ${name}` }
    }
    if (bytes.length > MAX_WRITE_BYTES) {
      return { ok: false, status: 413, error: `${name} is too large` }
    }

    try {
      const outputPath = await getUniqueSiblingPath(
        resolve(dirPath, name),
        "",
      )
      await writeFile(outputPath, bytes)
      written.push({ name, outputPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, status: 500, error: `${name}: ${message}` }
    }
  }

  return { ok: true, written }
}
