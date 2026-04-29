import Validator from "@adobe/structured-data-validator"
import WebAutoExtractor from "@marbec/web-auto-extractor"

const SCHEMA_ORG_VOCAB_URL =
  "https://schema.org/version/latest/schemaorg-all-https.jsonld"
const MAX_HTML_BYTES = 2 * 1024 * 1024

type ExtractedFormat = "jsonld" | "microdata" | "rdfa"

type ExtractedData = {
  jsonld?: Record<string, Record<string, unknown>[]>
  microdata?: Record<string, Record<string, unknown>[]>
  rdfa?: Record<string, Record<string, unknown>[]>
  errors?: Array<{
    format?: string
    message?: string
    source?: string
    sourceCodeLocation?: { startOffset?: number; endOffset?: number }
  }>
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
  dataFormat: ExtractedFormat
  rootType: string
  index: number
  location?: string
  source?: string
  data: Record<string, unknown>
}

export type SchemaViewerData = {
  extractedSchemas: ExtractedSchemaItem[]
  issues: SchemaIssue[]
  extractionErrors: string[]
  usedSchemaOrgVocabulary: boolean
}

export type SchemaViewerResult =
  | { ok: true; data: SchemaViewerData }
  | { ok: false; status: number; error: string }

let cachedVocabulary: unknown | null = null
let vocabularyPromise: Promise<unknown | null> | null = null

function isValidHttpUrl(input: string | null | undefined): input is string {
  if (!input) return false
  try {
    const u = new URL(input)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function looksLikeHtml(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  return (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    /<([a-z][a-z0-9-]*)\b[^>]*>/i.test(trimmed)
  )
}

function looksLikeJson(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}

function toExtractionHtml(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""
  if (looksLikeHtml(trimmed)) return trimmed
  if (looksLikeJson(trimmed)) {
    return `<!doctype html><html><head></head><body><script type="application/ld+json">${trimmed}</script></body></html>`
  }
  return `<!doctype html><html><head></head><body>${trimmed}</body></html>`
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; Orbit-Schema-Viewer/1.0; +https://orbit.local)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function loadSchemaOrgVocabulary(): Promise<unknown | null> {
  if (cachedVocabulary) return cachedVocabulary
  if (vocabularyPromise) return vocabularyPromise

  vocabularyPromise = (async () => {
    try {
      const response = await fetch(SCHEMA_ORG_VOCAB_URL, { cache: "force-cache" })
      if (!response.ok) return null
      const payload = (await response.json()) as unknown
      cachedVocabulary = payload
      return cachedVocabulary
    } catch {
      return null
    } finally {
      vocabularyPromise = null
    }
  })()

  return vocabularyPromise
}

function extractSchemas(data: ExtractedData): ExtractedSchemaItem[] {
  const output: ExtractedSchemaItem[] = []
  const formats: ExtractedFormat[] = ["jsonld", "microdata", "rdfa"]

  for (const format of formats) {
    const bucket = data[format]
    if (!bucket || typeof bucket !== "object") continue
    for (const [rootType, items] of Object.entries(bucket)) {
      if (!Array.isArray(items)) continue
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") return
        const location =
          typeof item["@location"] === "string" ? item["@location"] : undefined
        const source = typeof item["@source"] === "string" ? item["@source"] : undefined
        output.push({
          id: `${format}:${rootType}:${index}`,
          dataFormat: format,
          rootType,
          index,
          location,
          source,
          data: item,
        })
      })
    }
  }

  return output
}

function toExtractionErrorMessages(data: ExtractedData): string[] {
  const raw = Array.isArray(data.errors) ? data.errors : []
  return raw
    .map((error) => {
      if (!error || typeof error !== "object") return null
      if (
        error.format !== "jsonld" &&
        error.format !== "microdata" &&
        error.format !== "rdfa"
      ) {
        return null
      }
      if (typeof error.message !== "string" || error.message.trim().length === 0) {
        return null
      }
      return `${error.format.toUpperCase()}: ${error.message}`
    })
    .filter((message): message is string => Boolean(message))
}

async function validateExtractedSchemas(data: ExtractedData): Promise<{
  issues: SchemaIssue[]
  usedSchemaOrgVocabulary: boolean
}> {
  const schemaOrgVocabulary = await loadSchemaOrgVocabulary()
  const validator = new Validator(schemaOrgVocabulary ?? undefined)
  const cloned = structuredClone(data)
  const rawIssues = (await validator.validate(cloned)) as Array<Record<string, unknown>>
  const issues: SchemaIssue[] = rawIssues
    .map((issue) => {
      const severity =
        issue.severity === "WARNING" || issue.severity === "ERROR"
          ? issue.severity
          : "ERROR"
      const issueMessage =
        typeof issue.issueMessage === "string" && issue.issueMessage.trim().length > 0
          ? issue.issueMessage
          : "Validation issue"
      return {
        issueMessage,
        severity,
        dataFormat: typeof issue.dataFormat === "string" ? issue.dataFormat : undefined,
        rootType: typeof issue.rootType === "string" ? issue.rootType : undefined,
        location: typeof issue.location === "string" ? issue.location : undefined,
        path: Array.isArray(issue.path)
          ? (issue.path as Array<Record<string, unknown>>)
          : undefined,
        fieldNames: Array.isArray(issue.fieldNames)
          ? issue.fieldNames.filter(
              (fieldName): fieldName is string => typeof fieldName === "string",
            )
          : undefined,
      }
    })
    .sort((left, right) => {
      if (left.severity === right.severity) return 0
      return left.severity === "ERROR" ? -1 : 1
    })

  return {
    issues,
    usedSchemaOrgVocabulary: Boolean(schemaOrgVocabulary),
  }
}

function parseFromHtml(html: string): ExtractedData {
  const extractor = new WebAutoExtractor({
    addLocation: true,
    embedSource: ["jsonld", "microdata", "rdfa"],
  })
  return extractor.parse(html) as ExtractedData
}

export async function runSchemaViewerValidation(input: {
  url?: string | null
  snippet?: string | null
}): Promise<SchemaViewerResult> {
  const snippet = typeof input.snippet === "string" ? input.snippet.trim() : ""
  const hasSnippet = snippet.length > 0
  const hasUrl = typeof input.url === "string" && input.url.trim().length > 0

  if (!hasSnippet && !hasUrl) {
    return {
      ok: false,
      status: 400,
      error: "Provide either a public URL or markup snippet.",
    }
  }

  let extracted: ExtractedData
  try {
    if (hasSnippet) {
      extracted = parseFromHtml(toExtractionHtml(snippet))
    } else {
      const targetUrl = (input.url ?? "").trim()
      if (!isValidHttpUrl(targetUrl)) {
        return {
          ok: false,
          status: 400,
          error: "Invalid URL. Use a public http(s) address.",
        }
      }
      const response = await fetchWithTimeout(targetUrl, 12_000)
      if (!response.ok) {
        return {
          ok: false,
          status: 502,
          error: `Upstream responded with ${response.status}.`,
        }
      }
      let html = await response.text()
      if (html.length > MAX_HTML_BYTES) {
        html = html.slice(0, MAX_HTML_BYTES)
      }
      extracted = parseFromHtml(html)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not extract schema."
    const status = message.toLowerCase().includes("abort") ? 504 : 500
    return { ok: false, status, error: message }
  }

  try {
    const [{ issues, usedSchemaOrgVocabulary }, extractedSchemas] = await Promise.all([
      validateExtractedSchemas(extracted),
      Promise.resolve(extractSchemas(extracted)),
    ])
    const extractionErrors = toExtractionErrorMessages(extracted)
    return {
      ok: true,
      data: {
        extractedSchemas,
        issues,
        extractionErrors,
        usedSchemaOrgVocabulary,
      },
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not validate structured data."
    return {
      ok: false,
      status: 500,
      error: message,
    }
  }
}
