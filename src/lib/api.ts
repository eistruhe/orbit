import type { Preferences, ScanResponse } from "@/types/repo"

/**
 * Parses JSON from an API response body. If the body is prefixed with stray
 * characters (seen with some dev proxies), extracts the first `{...}` object.
 */
function parseResponseBody(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    const v = JSON.parse(trimmed) as unknown
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>
    }
  } catch {
    /* fall through to brace extraction */
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
  }
  throw new Error(
    trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed,
  )
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
}

/**
 * Loads persisted preferences from the local API.
 */
export async function fetchPreferences(): Promise<Preferences> {
  const res = await fetch("/api/preferences")
  return parseJson<Preferences>(res)
}

/**
 * Saves preferences to ~/.config/orbit/config.json via the API.
 */
export async function savePreferences(prefs: Preferences): Promise<Preferences> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  })
  return parseJson<Preferences>(res)
}

export type ScanRequest = {
  scanRoot?: string
  libraryId?: string
}

/**
 * Runs a filesystem scan for git repositories under the configured root.
 */
export async function runScan(request: ScanRequest = {}): Promise<ScanResponse> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as ScanResponse
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Scan failed",
    )
  }
  return data
}

export type OpenTarget = "finder" | "cursor" | "github" | "browser"

export type RepoBranchesResponse = {
  local: string[]
  remote: string[]
}

export type TinifyResult = {
  path: string
  outputPath?: string
  inputSize?: number
  outputSize?: number
  error?: string
}

export type TinifyResponse = {
  results: TinifyResult[]
}

export type TinifyKeyValidation = {
  valid: boolean
  message: string
  compressionCount?: number
}

/**
 * Opens a repo in local desktop tools via the local API (macOS).
 */
export async function openRepoPath(
  path: string,
  target: OpenTarget,
): Promise<void> {
  const res = await fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, target }),
  })
  const text = await res.text()
  const data = parseResponseBody(text)
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Could not open",
    )
  }
}

/**
 * Lists local and remote-tracking branches for a repository path.
 */
export async function fetchRepoBranches(
  path: string,
): Promise<RepoBranchesResponse> {
  const params = new URLSearchParams({ path })
  const res = await fetch(`/api/repo/branches?${params.toString()}`)
  return parseJson<RepoBranchesResponse>(res)
}

export async function tinifyPaths(
  paths: string[],
  replaceOriginal: boolean,
): Promise<TinifyResponse> {
  const res = await fetch("/api/tinify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, replaceOriginal }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as TinifyResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Tinify request failed",
    )
  }
  return data
}

export type OgRawMetaItem = { tag: string; value: string }

export type OgPreviewData = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  url: string
  favicon: string | null
  raw: OgRawMetaItem[]
}

/**
 * Fetches Open Graph metadata for the given URL via the local API.
 */
export async function fetchOgPreview(url: string): Promise<OgPreviewData> {
  const params = new URLSearchParams({ url })
  const res = await fetch(`/api/og?${params.toString()}`)
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as OgPreviewData & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not load preview",
    )
  }
  return data
}

export type SchemaIssue = {
  issueMessage: string
  severity: "ERROR" | "WARNING"
  dataFormat?: string
  rootType?: string
  location?: string
  path?: Array<Record<string, unknown>>
  fieldNames?: string[]
}

export type ExtractedSchemaItem = {
  id: string
  dataFormat: "jsonld" | "microdata" | "rdfa"
  rootType: string
  index: number
  location?: string
  source?: string
  data: Record<string, unknown>
}

export type SchemaViewerResponse = {
  extractedSchemas: ExtractedSchemaItem[]
  issues: SchemaIssue[]
  extractionErrors: string[]
  usedSchemaOrgVocabulary: boolean
}

export async function validateSchemaMarkup(input: {
  url?: string
  snippet?: string
}): Promise<SchemaViewerResponse> {
  const res = await fetch("/api/schema/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as SchemaViewerResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Schema validation failed",
    )
  }
  return data
}

export async function validateTinifyKey(
  apiKey: string,
): Promise<TinifyKeyValidation> {
  const res = await fetch("/api/tinify/validate-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as TinifyKeyValidation & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not validate API key",
    )
  }
  return data
}
