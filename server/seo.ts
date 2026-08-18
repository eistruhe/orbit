import { load, type CheerioAPI } from "cheerio"

import { parseOgFromHtml, type OgData } from "./og.ts"
import { fetchWithTimeout, isValidHttpUrl } from "./util.ts"

export type SeoCheckStatus = "pass" | "warn" | "fail"

export type SeoCheck = {
  id: string
  label: string
  status: SeoCheckStatus
  detail: string
}

export type SeoHeadingItem = {
  level: number
  text: string
}

export type SeoAuditData = {
  score: number
  checks: SeoCheck[]
  title: { text: string | null; length: number }
  metaDescription: { text: string | null; length: number }
  headings: {
    /** Total number of h1…h6 tags, index 0 = h1. */
    levels: number[]
    structure: SeoHeadingItem[]
  }
  images: { total: number; withAlt: number }
  links: { internal: number; external: number; nofollow: number; total: number }
  wordCount: number
  htmlBytes: number
  /** Visible text length divided by HTML length, 0..1. */
  textRatio: number
  hasJsonLd: boolean
  lang: string | null
  canonical: string | null
  robotsMeta: string | null
  indexable: boolean
  https: boolean
  viewport: boolean
  ogTags: { title: boolean; description: boolean; image: boolean }
  twitterCard: boolean
}

export type SeoAuditResult =
  | { ok: true; data: { og: OgData; audit: SeoAuditData } }
  | { ok: false; status: number; error: string }

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_HEADINGS = 60

/**
 * Finds a meta tag by its `name` or `property` attribute, case-insensitively
 * (sites use e.g. `name="Description"` or `property="og:title"`).
 */
function getMetaContent($: CheerioAPI, metaName: string): string | null {
  let found: string | null = null
  $("meta").each((_, el) => {
    if (found !== null) return
    const key = ($(el).attr("name") ?? $(el).attr("property") ?? "")
      .trim()
      .toLowerCase()
    if (key !== metaName) return
    const content = $(el).attr("content")
    if (content && content.trim() !== "") found = content.trim()
  })
  return found
}

function collectHeadings($: CheerioAPI): SeoHeadingItem[] {
  const items: SeoHeadingItem[] = []
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    if (items.length >= MAX_HEADINGS) return false
    const level = Number.parseInt(el.tagName.slice(1), 10)
    // noscript content is parsed as raw text and would leak markup here.
    const clone = $(el).clone()
    clone.find("noscript, script, style, template").remove()
    const text = clone.text().replace(/\s+/g, " ").trim().slice(0, 120)
    items.push({ level, text })
  })
  return items
}

function countLinks(
  $: CheerioAPI,
  baseUrl: string,
): SeoAuditData["links"] {
  let internal = 0
  let external = 0
  let nofollow = 0
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname
    } catch {
      return null
    }
  })()

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? ""
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      return
    }
    let host: string | null = null
    try {
      host = new URL(href, baseUrl).hostname
    } catch {
      return
    }
    if (baseHost && host === baseHost) internal += 1
    else external += 1
    const rel = ($(el).attr("rel") ?? "").toLowerCase()
    if (rel.split(/\s+/).includes("nofollow")) nofollow += 1
  })

  return { internal, external, nofollow, total: internal + external }
}

/**
 * Parses SEO-relevant signals from an HTML document and grades them into a
 * pass/warn/fail checklist with an overall 0–100 score.
 */
export function parseSeoAudit(html: string, baseUrl: string): SeoAuditData {
  const $ = load(html)

  const title = $("head title").first().text().replace(/\s+/g, " ").trim() || null
  const titleLength = title?.length ?? 0

  const metaDescription = getMetaContent($, "description")
  const descriptionLength = metaDescription?.length ?? 0

  const structure = collectHeadings($)
  // Count from the DOM, not from `structure` — that list is capped.
  const levels = [1, 2, 3, 4, 5, 6].map((level) => $(`h${level}`).length)
  const h1Count = levels[0]

  const canonical = (() => {
    const href = $('link[rel="canonical"]').first().attr("href") ?? null
    return href && href.trim() !== "" ? href.trim() : null
  })()

  const robotsMeta = getMetaContent($, "robots")
  const indexable = !(robotsMeta ?? "").toLowerCase().includes("noindex")

  const https = baseUrl.startsWith("https:")
  const viewport = getMetaContent($, "viewport") !== null
  const lang = $("html").attr("lang")?.trim() || null

  const ogTags = {
    title: getMetaContent($, "og:title") !== null,
    description: getMetaContent($, "og:description") !== null,
    image: getMetaContent($, "og:image") !== null,
  }
  const twitterCard = getMetaContent($, "twitter:card") !== null

  const images = { total: 0, withAlt: 0 }
  $("img").each((_, el) => {
    images.total += 1
    const alt = $(el).attr("alt")
    if (typeof alt === "string" && alt.trim() !== "") images.withAlt += 1
  })

  const links = countLinks($, baseUrl)

  $("script, style, noscript, template").remove()
  const visibleText = $("body").text().replace(/\s+/g, " ").trim()
  const wordCount = visibleText === "" ? 0 : visibleText.split(" ").length
  const htmlBytes = Buffer.byteLength(html, "utf8")
  const textRatio = htmlBytes > 0 ? visibleText.length / htmlBytes : 0

  const hasJsonLd = $('script[type="application/ld+json"]').length > 0

  const checks: SeoCheck[] = [
    {
      id: "title",
      label: "Title tag length",
      status:
        title === null
          ? "fail"
          : titleLength >= 10 && titleLength <= 60
            ? "pass"
            : "warn",
      detail:
        title === null
          ? "No <title> tag found"
          : `${titleLength} characters (ideal: 10–60)`,
    },
    {
      id: "meta-description",
      label: "Meta description length",
      status:
        metaDescription === null
          ? "fail"
          : descriptionLength >= 50 && descriptionLength <= 160
            ? "pass"
            : "warn",
      detail:
        metaDescription === null
          ? "No meta description found"
          : `${descriptionLength} characters (ideal: 50–160)`,
    },
    {
      id: "h1",
      label: "Single H1 tag",
      status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
      detail: `${h1Count} H1 tag(s) found`,
    },
    {
      id: "canonical",
      label: "Canonical tag",
      status: canonical ? "pass" : "warn",
      detail: canonical ? "Present" : "Missing",
    },
    {
      id: "https",
      label: "HTTPS",
      status: https ? "pass" : "fail",
      detail: https ? "Site uses HTTPS" : "Site does not use HTTPS",
    },
    {
      id: "viewport",
      label: "Mobile viewport tag",
      status: viewport ? "pass" : "fail",
      detail: viewport ? "Present" : "Missing",
    },
    {
      id: "lang",
      label: "HTML lang attribute",
      status: lang ? "pass" : "warn",
      detail: lang ? `lang="${lang}"` : "Missing",
    },
    {
      id: "og",
      label: "Open Graph tags",
      status:
        ogTags.title && ogTags.description && ogTags.image
          ? "pass"
          : ogTags.title || ogTags.description || ogTags.image
            ? "warn"
            : "fail",
      detail: (["title", "description", "image"] as const)
        .map((key) => `og:${key} ${ogTags[key] ? "✓" : "✗"}`)
        .join(", "),
    },
    {
      id: "twitter-card",
      label: "Twitter card",
      status: twitterCard ? "pass" : "warn",
      detail: twitterCard ? "Present" : "Missing",
    },
    {
      id: "img-alt",
      label: "Image alt text coverage",
      status:
        images.total === 0 || images.withAlt === images.total
          ? "pass"
          : images.withAlt / images.total >= 0.8
            ? "warn"
            : "fail",
      detail:
        images.total === 0
          ? "No images on the page"
          : `${images.withAlt}/${images.total} images have alt text`,
    },
    {
      id: "word-count",
      label: "Word count",
      status: wordCount >= 300 ? "pass" : "warn",
      detail: `${wordCount} words (300+ recommended)`,
    },
    {
      id: "json-ld",
      label: "Structured data (JSON-LD)",
      status: hasJsonLd ? "pass" : "warn",
      detail: hasJsonLd ? "Present" : "Missing",
    },
    {
      id: "indexable",
      label: "Indexing allowed",
      status: indexable ? "pass" : "fail",
      detail: indexable
        ? "No noindex directive found"
        : `Blocked by robots meta: ${robotsMeta ?? ""}`,
    },
  ]

  const points = checks.reduce(
    (sum, check) =>
      sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0,
  )
  const score = Math.round((points / checks.length) * 100)

  return {
    score,
    checks,
    title: { text: title, length: titleLength },
    metaDescription: { text: metaDescription, length: descriptionLength },
    headings: { levels, structure },
    images,
    links,
    wordCount,
    htmlBytes,
    textRatio,
    hasJsonLd,
    lang,
    canonical,
    robotsMeta,
    indexable,
    https,
    viewport,
    ogTags,
    twitterCard,
  }
}

/**
 * Fetches a URL once and returns both the Open Graph preview data and the
 * SEO audit, with timeout and size caps.
 */
export async function fetchSeoAudit(
  target: string | null | undefined,
): Promise<SeoAuditResult> {
  if (!isValidHttpUrl(target)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or missing url. Use http(s) URLs.",
    }
  }

  try {
    const response = await fetchWithTimeout(target, 10_000)
    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error: `Upstream responded with ${response.status}`,
      }
    }

    let html = await response.text()
    if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES)

    // The final URL (after redirects) decides HTTPS and internal-link checks.
    const finalUrl = response.url || target

    return {
      ok: true,
      data: {
        og: parseOgFromHtml(html, finalUrl),
        audit: parseSeoAudit(html, finalUrl),
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.toLowerCase().includes("abort") ? 504 : 500
    return { ok: false, status, error: message }
  }
}
