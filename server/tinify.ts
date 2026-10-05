import { readFile, rename, stat, writeFile } from "node:fs/promises"
import { dirname, extname, join, parse, resolve } from "node:path"

import { getUniqueSiblingPath, mapLimit } from "./util.ts"

const TINIFY_SHRINK_URL = "https://api.tinify.com/shrink"
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"])
const MAX_CONCURRENCY = 3

export type TinifyResult = {
  path: string
  outputPath?: string
  inputSize?: number
  outputSize?: number
  /** Compressions used this month on the API key, from the response header. */
  compressionCount?: number
  error?: string
}

export type TinifyKeyValidation = {
  valid: boolean
  message: string
  compressionCount?: number
}

type TinifyShrinkResponse = {
  error?: string
  message?: string
  output?: {
    size?: number
    url?: string
  }
}

function toBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`
}

function readCompressionCountHeader(response: Response): number | undefined {
  const headerValue =
    response.headers.get("compression-count") ??
    response.headers.get("Compression-Count")
  if (!headerValue) return undefined
  const parsed = Number(headerValue)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeOutputFile(
  outputBytes: Uint8Array<ArrayBuffer>,
  originalPath: string,
  replaceOriginal: boolean,
): Promise<string> {
  if (!replaceOriginal) {
    const outputPath = await getUniqueSiblingPath(originalPath, "-tinified")
    await writeFile(outputPath, outputBytes)
    return outputPath
  }

  const tempPath = join(
    dirname(originalPath),
    `.${parse(originalPath).name}.tinify-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}${parse(originalPath).ext}`,
  )
  await writeFile(tempPath, outputBytes)
  await rename(tempPath, originalPath)
  return originalPath
}

async function tinifySinglePath(
  apiKey: string,
  path: string,
  replaceOriginal: boolean,
): Promise<TinifyResult> {
  try {
    const resolvedPath = resolve(path)
    const extension = extname(resolvedPath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return { path, error: "Only PNG and JPG images are supported." }
    }

    const fileStats = await stat(resolvedPath)
    if (!fileStats.isFile()) {
      return { path, error: "Path is not a file." }
    }

    const inputBytes = await readFile(resolvedPath)

    const shrinkResponse = await fetch(TINIFY_SHRINK_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(apiKey),
      },
      body: inputBytes,
    })

    if (!shrinkResponse.ok) {
      const errorPayload = await parseJsonSafe<TinifyShrinkResponse>(shrinkResponse)
      const errorMessage =
        errorPayload?.message ??
        errorPayload?.error ??
        `Tinify request failed with ${shrinkResponse.status}.`
      return { path, error: errorMessage }
    }

    const compressionCount = readCompressionCountHeader(shrinkResponse)
    const shrinkPayload = await parseJsonSafe<TinifyShrinkResponse>(shrinkResponse)
    const outputUrl =
      shrinkResponse.headers.get("location") ?? shrinkPayload?.output?.url ?? null
    if (!outputUrl) {
      return { path, error: "Tinify did not return an output URL." }
    }

    const downloadResponse = await fetch(outputUrl, {
      headers: { Authorization: toBasicAuthHeader(apiKey) },
    })
    if (!downloadResponse.ok) {
      return {
        path,
        error: `Could not download compressed image (${downloadResponse.status}).`,
      }
    }
    const outputBytes = new Uint8Array(await downloadResponse.arrayBuffer())
    const outputPath = await writeOutputFile(outputBytes, resolvedPath, replaceOriginal)
    const outputSize = shrinkPayload?.output?.size ?? outputBytes.byteLength

    return {
      path: resolvedPath,
      outputPath,
      inputSize: fileStats.size,
      outputSize,
      compressionCount,
    }
  } catch (error) {
    return {
      path,
      error: error instanceof Error ? error.message : "Unexpected Tinify error.",
    }
  }
}

export async function tinifyPaths(
  apiKey: string,
  paths: string[],
  replaceOriginal: boolean,
): Promise<TinifyResult[]> {
  return mapLimit(paths, MAX_CONCURRENCY, (path) =>
    tinifySinglePath(apiKey, path, replaceOriginal),
  )
}

export async function validateTinifyApiKey(
  apiKey: string,
): Promise<TinifyKeyValidation> {
  try {
    const response = await fetch(TINIFY_SHRINK_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(apiKey),
      },
    })
    const compressionCount = readCompressionCountHeader(response)
    const payload = await parseJsonSafe<TinifyShrinkResponse>(response)

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        message: payload?.message ?? "Invalid API key.",
        compressionCount,
      }
    }

    if (response.status === 429) {
      return {
        valid: true,
        message:
          payload?.message ??
          "API key is valid, but usage or rate limit has been reached.",
        compressionCount,
      }
    }

    if (response.ok || (response.status >= 400 && response.status < 500)) {
      return {
        valid: true,
        message: "API key looks valid.",
        compressionCount,
      }
    }

    return {
      valid: false,
      message:
        payload?.message ??
        `Tinify validation failed with status ${response.status}.`,
      compressionCount,
    }
  } catch (error) {
    return {
      valid: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not validate API key right now.",
    }
  }
}
