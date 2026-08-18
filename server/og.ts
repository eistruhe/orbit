import { load, type CheerioAPI } from "cheerio"

export type RawMetaItem = { tag: string; value: string }

export type OgData = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  url: string
  favicon: string | null
  raw: RawMetaItem[]
}

function getContent(
  $: CheerioAPI,
  selector: string,
  attr: string,
): string | null {
  const el = $(selector).first()
  const value = el.attr(attr) ?? null
  return value && value.trim() !== "" ? value : null
}

function resolveUrl(maybeUrl: string | null, baseUrl: string): string | null {
  if (!maybeUrl) return null
  try {
    return new URL(maybeUrl, baseUrl).toString()
  } catch {
    return null
  }
}

function extractRawMeta($: CheerioAPI): RawMetaItem[] {
  const items: RawMetaItem[] = []
  $("meta").each((_, el) => {
    const name = $(el).attr("property") || $(el).attr("name")
    const content = $(el).attr("content")
    if (!name || !content) return
    items.push({ tag: name, value: content })
  })
  return items
}

/**
 * Parses Open Graph, Twitter, and other meta tags from an HTML document.
 * Resolves relative image and favicon URLs against `baseUrl`.
 */
export function parseOgFromHtml(html: string, baseUrl: string): OgData {
  const $ = load(html)
  const raw = extractRawMeta($)

  const candidatesTitle = [
    getContent($, 'meta[property="og:title"]', "content"),
    getContent($, 'meta[name="twitter:title"]', "content"),
    $("title").first().text() || null,
  ]

  const candidatesDescription = [
    getContent($, 'meta[property="og:description"]', "content"),
    getContent($, 'meta[name="twitter:description"]', "content"),
    getContent($, 'meta[name="description"]', "content"),
  ]

  const candidatesImage = [
    getContent($, 'meta[property="og:image"]', "content"),
    getContent($, 'meta[name="twitter:image"]', "content"),
  ]

  const candidatesSiteName = [
    getContent($, 'meta[property="og:site_name"]', "content"),
  ]

  const faviconHref =
    getContent($, 'link[rel="icon"]', "href") ||
    getContent($, 'link[rel="shortcut icon"]', "href") ||
    getContent($, 'link[rel="apple-touch-icon"]', "href") ||
    "/favicon.ico"

  const title = candidatesTitle.find(Boolean) ?? null
  const description = candidatesDescription.find(Boolean) ?? null
  const image = resolveUrl(candidatesImage.find(Boolean) ?? null, baseUrl)
  const siteName =
    candidatesSiteName.find(Boolean) ??
    (() => {
      try {
        return new URL(baseUrl).hostname
      } catch {
        return null
      }
    })()
  const favicon = resolveUrl(faviconHref, baseUrl)

  return {
    title,
    description,
    image,
    siteName,
    url: baseUrl,
    favicon,
    raw,
  }
}
