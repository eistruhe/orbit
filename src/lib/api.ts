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

/**
 * Runs a filesystem scan for git repositories under the configured root.
 */
export async function runScan(scanRoot?: string): Promise<ScanResponse> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scanRoot ? { scanRoot } : {}),
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
