import { load } from "cheerio"

import { fetchWithTimeout, isValidHttpUrl, mapLimit } from "./util.ts"

const ROBOTS_TIMEOUT_MS = 10_000
const SITEMAP_TIMEOUT_MS = 12_000
const MAX_ROBOTS_BYTES = 500 * 1024
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024
const MAX_SITEMAPS = 5
const MAX_INDEX_DEPTH = 2
const MAX_URLS_PER_SITEMAP = 50_000
const SAMPLE_CHECK_COUNT = 10
const SAMPLE_CONCURRENCY = 3
const TOTAL_BUDGET_MS = 30_000

export type RobotsRule = {
  type: "allow" | "disallow" | "crawl-delay"
  value: string
}

export type RobotsGroup = {
  userAgents: string[]
  rules: RobotsRule[]
}

export type SitemapReport = {
  url: string
  ok: boolean
  status: number | null
  isIndex: boolean
  urlCount: number | null
  lastmodPct: number | null
  errors: string[]
  children: string[]
}

export type SampleCheck = {
  url: string
  status: number | null
  error: string | null
}

export type RobotsValidation = {
  robotsUrl: string
  robotsStatus: number | null
  robotsFound: boolean
  groups: RobotsGroup[]
  sitemapUrls: string[]
  sitemapDiscovery: "robots" | "fallback" | "none"
  sitemaps: SitemapReport[]
  sampleChecks: SampleCheck[]
  truncated: boolean
}

export type RobotsResult =
  | { ok: true; data: RobotsValidation }
  | { ok: false; status: number; error: string }

function parseRobotsTxt(content: string): {
  groups: RobotsGroup[]
  sitemaps: string[]
} {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let currentGroup: RobotsGroup | null = null
  let lastWasUserAgent = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim()
    if (!line) continue
    const colon = line.indexOf(":")
    if (colon < 0) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (field === "sitemap") {
      if (value) sitemaps.push(value)
      continue
    }

    if (field === "user-agent") {
      if (!lastWasUserAgent || !currentGroup) {
        currentGroup = { userAgents: [], rules: [] }
        groups.push(currentGroup)
      }
      currentGroup.userAgents.push(value)
      lastWasUserAgent = true
      continue
    }

    lastWasUserAgent = false
    if (!currentGroup) continue
    if (field === "allow" || field === "disallow") {
      currentGroup.rules.push({ type: field, value })
    } else if (field === "crawl-delay") {
      currentGroup.rules.push({ type: "crawl-delay", value })
    }
  }

  return { groups, sitemaps: [...new Set(sitemaps)] }
}

async function fetchTextCapped(
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ status: number; text: string | null; tooLarge: boolean }> {
  const response = await fetchWithTimeout(url, timeoutMs, {
    headers: { accept: "text/plain,application/xml,text/xml,*/*;q=0.8" },
  })
  if (!response.ok) {
    void response.body?.cancel()
    return { status: response.status, text: null, tooLarge: false }
  }
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    void response.body?.cancel()
    return { status: response.status, text: null, tooLarge: true }
  }
  const text = await response.text()
  if (text.length > maxBytes) {
    return { status: response.status, text: text.slice(0, maxBytes), tooLarge: true }
  }
  return { status: response.status, text, tooLarge: false }
}

function analyzeSitemapXml(xml: string): {
  isIndex: boolean
  urls: string[]
  childSitemaps: string[]
  lastmodPct: number | null
  errors: string[]
} {
  const errors: string[] = []
  let $: ReturnType<typeof load>
  try {
    $ = load(xml, { xmlMode: true })
  } catch {
    return {
      isIndex: false,
      urls: [],
      childSitemaps: [],
      lastmodPct: null,
      errors: ["Invalid XML"],
    }
  }

  const indexEntries = $("sitemapindex > sitemap")
  if (indexEntries.length > 0) {
    const childSitemaps: string[] = []
    indexEntries.each((_, el) => {
      const loc = $(el).find("loc").first().text().trim()
      if (loc) childSitemaps.push(loc)
    })
    return { isIndex: true, urls: [], childSitemaps, lastmodPct: null, errors }
  }

  const urlEntries = $("urlset > url")
  if (urlEntries.length === 0) {
    errors.push("No <urlset> or <sitemapindex> entries found")
    return { isIndex: false, urls: [], childSitemaps: [], lastmodPct: null, errors }
  }

  const urls: string[] = []
  let withLastmod = 0
  urlEntries.each((_, el) => {
    const loc = $(el).find("loc").first().text().trim()
    if (loc) urls.push(loc)
    if ($(el).find("lastmod").length > 0) withLastmod += 1
  })

  if (urls.length > MAX_URLS_PER_SITEMAP) {
    errors.push(`More than ${MAX_URLS_PER_SITEMAP.toLocaleString()} URLs (spec limit is 50,000)`)
  }

  return {
    isIndex: false,
    urls,
    childSitemaps: [],
    lastmodPct:
      urlEntries.length > 0
        ? Math.round((withLastmod / urlEntries.length) * 100)
        : null,
    errors,
  }
}

/**
 * Fetches and validates robots.txt plus the referenced sitemaps
 * (sitemap-index recursion capped), then HEAD-checks a URL sample.
 */
export async function validateRobots(
  target: string | null | undefined,
): Promise<RobotsResult> {
  if (!isValidHttpUrl(target)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or missing url. Use http(s) URLs.",
    }
  }

  const startedAt = Date.now()
  const deadline = startedAt + TOTAL_BUDGET_MS
  const origin = new URL(target).origin
  const robotsUrl = `${origin}/robots.txt`

  let robotsStatus: number | null = null
  let robotsFound = false
  let groups: RobotsGroup[] = []
  let sitemapUrls: string[] = []
  let sitemapDiscovery: RobotsValidation["sitemapDiscovery"] = "none"
  let truncated = false

  try {
    const robots = await fetchTextCapped(robotsUrl, ROBOTS_TIMEOUT_MS, MAX_ROBOTS_BYTES)
    robotsStatus = robots.status
    if (robots.text !== null) {
      robotsFound = true
      const parsed = parseRobotsTxt(robots.text)
      groups = parsed.groups
      if (parsed.sitemaps.length > 0) {
        sitemapUrls = parsed.sitemaps
        sitemapDiscovery = "robots"
      }
    }
  } catch {
    robotsStatus = null
  }

  if (sitemapUrls.length === 0) {
    sitemapUrls = [`${origin}/sitemap.xml`]
    sitemapDiscovery = "fallback"
  }

  const sitemaps: SitemapReport[] = []
  let firstUrlList: string[] = []
  const queue: Array<{ url: string; depth: number }> = sitemapUrls.map((url) => ({
    url,
    depth: 0,
  }))
  const visited = new Set<string>()

  while (queue.length > 0) {
    if (sitemaps.length >= MAX_SITEMAPS || Date.now() > deadline) {
      truncated = true
      break
    }
    const { url, depth } = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)

    if (!isValidHttpUrl(url)) {
      sitemaps.push({
        url,
        ok: false,
        status: null,
        isIndex: false,
        urlCount: null,
        lastmodPct: null,
        errors: ["Not a valid http(s) URL"],
        children: [],
      })
      continue
    }

    try {
      const fetched = await fetchTextCapped(url, SITEMAP_TIMEOUT_MS, MAX_SITEMAP_BYTES)
      if (fetched.text === null) {
        sitemaps.push({
          url,
          ok: false,
          status: fetched.status,
          isIndex: false,
          urlCount: null,
          lastmodPct: null,
          errors: fetched.tooLarge
            ? [`Larger than ${MAX_SITEMAP_BYTES / (1024 * 1024)}MB`]
            : [`Responded with ${fetched.status}`],
          children: [],
        })
        continue
      }

      const analysis = analyzeSitemapXml(fetched.text)
      const errors = [...analysis.errors]
      if (fetched.tooLarge) {
        errors.push(`Truncated at ${MAX_SITEMAP_BYTES / (1024 * 1024)}MB while parsing`)
      }
      sitemaps.push({
        url,
        ok: errors.length === 0,
        status: fetched.status,
        isIndex: analysis.isIndex,
        urlCount: analysis.isIndex ? analysis.childSitemaps.length : analysis.urls.length,
        lastmodPct: analysis.lastmodPct,
        errors,
        children: analysis.childSitemaps,
      })

      if (analysis.isIndex && depth < MAX_INDEX_DEPTH) {
        for (const child of analysis.childSitemaps) {
          queue.push({ url: child, depth: depth + 1 })
        }
        if (analysis.childSitemaps.length + sitemaps.length > MAX_SITEMAPS) {
          truncated = true
        }
      }
      if (!analysis.isIndex && firstUrlList.length === 0) {
        firstUrlList = analysis.urls
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fetch failed"
      sitemaps.push({
        url,
        ok: false,
        status: null,
        isIndex: false,
        urlCount: null,
        lastmodPct: null,
        errors: [message],
        children: [],
      })
    }
  }

  let sampleChecks: SampleCheck[] = []
  const sampleUrls = firstUrlList.slice(0, SAMPLE_CHECK_COUNT)
  if (sampleUrls.length > 0 && Date.now() < deadline) {
    sampleChecks = await mapLimit(sampleUrls, SAMPLE_CONCURRENCY, async (url) => {
      if (Date.now() > deadline) {
        return { url, status: null, error: "Skipped (time budget exceeded)" }
      }
      try {
        const response = await fetchWithTimeout(url, 8000, { method: "HEAD" })
        void response.body?.cancel()
        return { url, status: response.status, error: null }
      } catch (err: unknown) {
        return {
          url,
          status: null,
          error: err instanceof Error ? err.message : "Request failed",
        }
      }
    })
  }

  return {
    ok: true,
    data: {
      robotsUrl,
      robotsStatus,
      robotsFound,
      groups,
      sitemapUrls,
      sitemapDiscovery,
      sitemaps,
      sampleChecks,
      truncated,
    },
  }
}
