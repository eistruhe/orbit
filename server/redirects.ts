import { fetchWithTimeout, isValidHttpUrl } from "./util.ts"

const MAX_HOPS = 10
const HOP_TIMEOUT_MS = 10_000

export type RedirectHop = {
  url: string
  status: number
  statusText: string
  location: string | null
  durationMs: number
}

export type SecurityHeaderCheck = {
  name: string
  present: boolean
  value: string | null
  level: "pass" | "warn"
}

export type RedirectInspection = {
  chain: RedirectHop[]
  finalUrl: string
  finalStatus: number
  tooManyRedirects: boolean
  redirectLoop: boolean
  headers: { name: string; value: string }[]
  security: SecurityHeaderCheck[]
  caching: { name: string; value: string | null }[]
}

export type RedirectResult =
  | { ok: true; data: RedirectInspection }
  | { ok: false; status: number; error: string }

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
]

const CACHING_HEADERS = ["cache-control", "etag", "age", "expires", "vary"]

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304
}

/**
 * Follows redirects manually (no bodies read) and grades the final
 * response's security and caching headers.
 */
export async function inspectRedirects(
  target: string | null | undefined,
): Promise<RedirectResult> {
  if (!isValidHttpUrl(target)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or missing url. Use http(s) URLs.",
    }
  }

  const chain: RedirectHop[] = []
  const seen = new Set<string>()
  let current = target
  let tooManyRedirects = false
  let redirectLoop = false
  let finalResponse: Response | null = null

  try {
    while (chain.length < MAX_HOPS) {
      if (seen.has(current)) {
        redirectLoop = true
        break
      }
      seen.add(current)

      const startedAt = Date.now()
      const response = await fetchWithTimeout(current, HOP_TIMEOUT_MS, {
        redirect: "manual",
      })
      const durationMs = Date.now() - startedAt
      void response.body?.cancel()

      const location = response.headers.get("location")
      chain.push({
        url: current,
        status: response.status,
        statusText: response.statusText,
        location,
        durationMs,
      })

      if (!isRedirectStatus(response.status) || !location) {
        finalResponse = response
        break
      }

      let nextUrl: string
      try {
        nextUrl = new URL(location, current).toString()
      } catch {
        finalResponse = response
        break
      }
      if (!isValidHttpUrl(nextUrl)) {
        finalResponse = response
        break
      }
      current = nextUrl
    }

    if (!finalResponse && !redirectLoop && chain.length >= MAX_HOPS) {
      tooManyRedirects = true
    }

    const headers: { name: string; value: string }[] = []
    if (finalResponse) {
      finalResponse.headers.forEach((value, name) => {
        headers.push({ name, value })
      })
      headers.sort((a, b) => a.name.localeCompare(b.name))
    }

    const security: SecurityHeaderCheck[] = SECURITY_HEADERS.map((name) => {
      const value = finalResponse?.headers.get(name) ?? null
      return {
        name,
        present: value !== null,
        value,
        level: value !== null ? "pass" : "warn",
      }
    })

    const caching = CACHING_HEADERS.map((name) => ({
      name,
      value: finalResponse?.headers.get(name) ?? null,
    }))

    const lastHop = chain[chain.length - 1]
    return {
      ok: true,
      data: {
        chain,
        finalUrl: lastHop?.url ?? target,
        finalStatus: finalResponse?.status ?? lastHop?.status ?? 0,
        tooManyRedirects,
        redirectLoop,
        headers,
        security,
        caching,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.toLowerCase().includes("abort") ? 504 : 502
    return { ok: false, status, error: message }
  }
}
