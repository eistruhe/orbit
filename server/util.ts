import { stat } from "node:fs/promises"
import { join, parse } from "node:path"

/**
 * Runs `run` over `items` with at most `limit` concurrent workers, preserving
 * input order in the results.
 */
export async function mapLimit<TInput, TOutput>(
  items: TInput[],
  limit: number,
  run: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await run(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

/**
 * Returns a sibling path `name<suffix><ext>` that does not exist yet,
 * appending `-1`, `-2`, … before the extension until a free name is found.
 * `extension` (with leading dot) overrides the input file's extension.
 */
export async function getUniqueSiblingPath(
  inputPath: string,
  suffix: string,
  extension?: string,
): Promise<string> {
  const parsed = parse(inputPath)
  const ext = extension ?? parsed.ext
  let candidate = join(parsed.dir, `${parsed.name}${suffix}${ext}`)
  let counter = 1
  while (true) {
    try {
      await stat(candidate)
      candidate = join(parsed.dir, `${parsed.name}${suffix}-${counter}${ext}`)
      counter += 1
    } catch {
      return candidate
    }
  }
}

export function isValidHttpUrl(input: string | null | undefined): input is string {
  if (!input) return false
  try {
    const u = new URL(input)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

const DEFAULT_FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; Orbit-Fetch/1.0; +https://orbit.local)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

/**
 * `fetch` with an AbortController timeout. Extra `init` is merged over the
 * defaults (headers are merged key-wise).
 */
export async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      ...init,
      headers: { ...DEFAULT_FETCH_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
