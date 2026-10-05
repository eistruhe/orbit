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

export type DeleteNodeModulesResult = {
  skipped?: boolean
}

/**
 * Deletes `node_modules` at the repository root (path validated against scan roots).
 */
export async function deleteRepoNodeModules(
  path: string,
): Promise<DeleteNodeModulesResult> {
  const res = await fetch("/api/repo/delete-node-modules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as {
    error?: string
    ok?: boolean
    skipped?: boolean
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not delete node_modules",
    )
  }
  return { skipped: data.skipped === true }
}

/**
 * Runs `git fetch` in the given repository directory.
 */
export async function gitFetchRepo(path: string): Promise<void> {
  const res = await fetch("/api/repo/git-fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  const text = await res.text()
  const data = parseResponseBody(text)
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "git fetch failed",
    )
  }
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

export type DevServerPackageManager = "bun" | "pnpm" | "yarn" | "npm"

export type DevServerStatus = "starting" | "running" | "exited" | "error"

export type DevServerInfo = {
  id: string
  repoPath: string
  script: string
  packageManager: DevServerPackageManager
  pid: number
  status: DevServerStatus
  startedAt: string
  exitCode: number | null
  detectedUrl: string | null
}

export type DevServerLogLine = {
  seq: number
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

export type DevServerLogsResponse = {
  lines: DevServerLogLine[]
  nextSince: number
  status: DevServerStatus
  detectedUrl: string | null
  exitCode: number | null
}

export type RepoScriptsResponse = {
  scripts: Record<string, string>
  packageManager: DevServerPackageManager
}

/**
 * Lists package.json scripts and the detected package manager for a repo.
 * Returns null when the project has no package.json.
 */
export async function fetchRepoScripts(
  path: string,
): Promise<RepoScriptsResponse | null> {
  const params = new URLSearchParams({ path })
  const res = await fetch(`/api/repo/scripts?${params.toString()}`)
  if (res.status === 404) return null
  return parseJson<RepoScriptsResponse>(res)
}

export async function listDevServers(): Promise<DevServerInfo[]> {
  const res = await fetch("/api/dev-servers")
  const data = await parseJson<{ servers: DevServerInfo[] }>(res)
  return data.servers
}

export async function startDevServer(
  path: string,
  script: string,
): Promise<DevServerInfo> {
  const res = await fetch("/api/dev-servers/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, script }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as DevServerInfo & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not start dev server",
    )
  }
  return data
}

export async function stopDevServer(id: string): Promise<void> {
  const res = await fetch("/api/dev-servers/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  const text = await res.text()
  const data = parseResponseBody(text)
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not stop dev server",
    )
  }
}

export async function fetchDevServerLogs(
  id: string,
  since: number,
): Promise<DevServerLogsResponse> {
  const params = new URLSearchParams({ since: String(since) })
  const res = await fetch(`/api/dev-servers/${encodeURIComponent(id)}/logs?${params.toString()}`)
  return parseJson<DevServerLogsResponse>(res)
}

export type SearchMatch = {
  line: number
  column: number
  preview: string
}

export type SearchFileResult = {
  relPath: string
  matches: SearchMatch[]
}

export type SearchRepoResult = {
  repoPath: string
  repoName: string
  files: SearchFileResult[]
}

export type SearchResponse = {
  results: SearchRepoResult[]
  truncated: boolean
  filesScanned: number
  durationMs: number
}

export type SearchRequest = {
  query: string
  regex?: boolean
  caseSensitive?: boolean
  extensions?: string[]
  libraryId?: string
}

/**
 * Runs a content search across all configured scan roots via the local API.
 */
export async function runContentSearch(
  request: SearchRequest,
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as SearchResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Search failed",
    )
  }
  return data
}

export type RepoReadmeResponse = {
  fileName: string
  content: string
  truncated: boolean
}

/**
 * Loads the repo-root README. Returns null when the project has none.
 */
export async function fetchRepoReadme(
  path: string,
): Promise<RepoReadmeResponse | null> {
  const params = new URLSearchParams({ path })
  const res = await fetch(`/api/repo/readme?${params.toString()}`)
  if (res.status === 404) return null
  return parseJson<RepoReadmeResponse>(res)
}

export type PortEntry = {
  command: string
  pid: number
  user: string
  address: string
  port: number
}

export async function fetchPorts(): Promise<PortEntry[]> {
  const res = await fetch("/api/ports")
  const data = await parseJson<{ ports: PortEntry[] }>(res)
  return data.ports
}

export async function killPortProcess(pid: number, port: number): Promise<void> {
  const res = await fetch("/api/ports/kill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pid, port }),
  })
  const text = await res.text()
  const data = parseResponseBody(text)
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not kill process",
    )
  }
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

export type SeoCheckStatus = "pass" | "warn" | "fail"

export type SeoCheck = {
  id: string
  label: string
  status: SeoCheckStatus
  detail: string
}

export type SeoHeadingItem = { level: number; text: string }

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

export type SeoAuditResponse = {
  og: OgPreviewData
  audit: SeoAuditData
}

/**
 * Fetches the SEO audit (checks, headings, links, page weight) plus Open
 * Graph metadata for the given URL via the local API.
 */
export async function fetchSeoAudit(url: string): Promise<SeoAuditResponse> {
  const params = new URLSearchParams({ url })
  const res = await fetch(`/api/seo-audit?${params.toString()}`)
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as SeoAuditResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not load audit",
    )
  }
  return data
}

/**
 * Writes derived bytes (converted image, etc.) as a non-clobbering sibling of
 * a user-picked original file. Returns the written path.
 */
export async function writeDerivedFile(input: {
  originalPath: string
  suffix: string
  extension: string
  dataBase64: string
}): Promise<string> {
  const res = await fetch("/api/files/write-derived", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as { outputPath?: string; error?: string }
  if (!res.ok || typeof data.outputPath !== "string") {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not write file",
    )
  }
  return data.outputPath
}

export type ReplaceFileResult = {
  outputPath: string
  inputSize: number
  outputSize: number
}

/**
 * Overwrites a user-picked local file in place (atomic temp + rename).
 * The server only accepts a small allowlist of text extensions (e.g. .svg).
 */
export async function replaceFileContents(
  path: string,
  dataBase64: string,
): Promise<ReplaceFileResult> {
  const res = await fetch("/api/files/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, dataBase64 }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as Partial<ReplaceFileResult> & {
    error?: string
  }
  if (
    !res.ok ||
    typeof data.outputPath !== "string" ||
    typeof data.inputSize !== "number" ||
    typeof data.outputSize !== "number"
  ) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not replace file",
    )
  }
  return {
    outputPath: data.outputPath,
    inputSize: data.inputSize,
    outputSize: data.outputSize,
  }
}

export type ImageStatsEvent = {
  tool: "svgo" | "convert"
  name: string
  /** Absolute source path when known; the server derives the project from it. */
  path?: string
  formatIn: string
  formatOut: string
  bytesIn: number
  bytesOut: number
  output: "replace" | "new-file" | "download" | "clipboard"
  resized?: boolean
}

export type StatsImageTool = "tinify" | "svgo" | "convert"

export type StatsSavingsGroup = {
  tool: StatsImageTool
  formatIn: string
  formatOut: string
  files: number
  bytesIn: number
  bytesOut: number
  /** Bytes saved per local day, oldest first. */
  dailySaved: number[]
}

export type StatsRecentRun =
  | {
      type: "image"
      at: string
      tool: StatsImageTool
      name: string
      project?: string
      formatIn: string
      formatOut: string
      bytesIn: number
      bytesOut: number
    }
  | { type: "cleanup"; at: string; project: string; bytesFreed: number | null }

/** Aggregated statistics log, see `summarizeStats` in server/stats.ts. */
export type StatsSummary = {
  trackingSince: string | null
  seriesDays: number
  compression: {
    files: number
    bytesIn: number
    bytesOut: number
    dailySaved: number[]
    dailyFiles: number[]
    groups: StatsSavingsGroup[]
  }
  conversion: { groups: StatsSavingsGroup[] }
  cleanup: { runs: number; bytesFreed: number; daily: number[] }
  tinifyQuota: {
    month: string
    used: number | null
    history: { month: string; used: number | null }[]
  }
  topProjects: { path: string; files: number; bytesSaved: number }[]
  recent: StatsRecentRun[]
  /** Latest recorded audit of the requested `site`; null without one. */
  seoAudit: {
    at: string
    url: string
    score: number
    pass: number
    warn: number
    fail: number
  } | null
}

/**
 * Aggregated statistics; `project` limits savings and runs to one git
 * project, `site` adds the latest SEO audit of that URL.
 */
export async function fetchStatsSummary(
  options: { project?: string; site?: string } = {},
): Promise<StatsSummary> {
  const params = new URLSearchParams()
  if (options.project) params.set("project", options.project)
  if (options.site) params.set("site", options.site)
  const query = params.toString()
  const res = await fetch(`/api/stats/summary${query ? `?${query}` : ""}`)
  return parseJson<StatsSummary>(res)
}

export type RepoActivity = {
  days: number
  /** Commits per local day on the current branch, oldest first. */
  commitsPerDay: number[]
}

export async function fetchRepoActivity(path: string): Promise<RepoActivity> {
  const res = await fetch(`/api/repo/activity?${new URLSearchParams({ path }).toString()}`)
  return parseJson<RepoActivity>(res)
}

/**
 * Reports results of client-side image tools to the statistics log.
 * Fire-and-forget: failures are ignored so tools never break on stats.
 */
export function reportImageStats(events: ImageStatsEvent[]): void {
  if (events.length === 0) return
  void fetch("/api/stats/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: events.map((event) => ({ type: "image", ...event })),
    }),
  }).catch(() => undefined)
}

/**
 * Writes a set of named files into a user-picked directory.
 */
export async function writeBatchFiles(
  dirPath: string,
  files: { name: string; dataBase64: string }[],
): Promise<{ name: string; outputPath: string }[]> {
  const res = await fetch("/api/files/write-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dirPath, files }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as {
    written?: { name: string; outputPath: string }[]
    error?: string
  }
  if (!res.ok || !Array.isArray(data.written)) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not write files",
    )
  }
  return data.written
}

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

/**
 * Traces the redirect chain and grades response headers via the local API.
 */
export async function inspectRedirects(url: string): Promise<RedirectInspection> {
  const params = new URLSearchParams({ url })
  const res = await fetch(`/api/redirects?${params.toString()}`)
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as RedirectInspection & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not inspect URL",
    )
  }
  return data
}

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

/**
 * Validates robots.txt and referenced sitemaps for a site via the local API.
 */
export async function validateRobots(url: string): Promise<RobotsValidation> {
  const res = await fetch("/api/robots/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as RobotsValidation & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Robots validation failed",
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

// --- DNS lookup -------------------------------------------------------------

export type DnsRecord = {
  name: string
  type: string
  ttl: number
  data: string
}

export type DnsResolverResult = {
  resolver: "cloudflare" | "google"
  records: DnsRecord[]
  error: string | null
}

export type DnsLookup = {
  domain: string
  type: string
  results: DnsResolverResult[]
}

export async function lookupDns(
  domain: string,
  type: string,
): Promise<DnsLookup> {
  const params = new URLSearchParams({ domain, type })
  const res = await fetch(`/api/dns?${params.toString()}`)
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as DnsLookup & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Lookup failed",
    )
  }
  return data
}

// --- SSL check --------------------------------------------------------------

export type SslCertificate = {
  domain: string
  ok: boolean
  error: string | null
  subject: string | null
  issuer: string | null
  validFrom: string | null
  validTo: string | null
  daysLeft: number | null
  altNames: string[]
  chain: string[]
  protocol: string | null
  selfSigned: boolean
}

export async function checkSsl(domains: string[]): Promise<SslCertificate[]> {
  const res = await fetch("/api/ssl/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domains }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as {
    results?: SslCertificate[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Check failed",
    )
  }
  return data.results ?? []
}

// --- Env compare ------------------------------------------------------------

export type EnvKeyInfo = {
  key: string
  hasValue: boolean
  line: number
}

export type EnvFileInfo = {
  name: string
  keys: EnvKeyInfo[]
  parseErrors: number
}

export async function fetchEnvFiles(path: string): Promise<EnvFileInfo[]> {
  const params = new URLSearchParams({ path })
  const res = await fetch(`/api/env/files?${params.toString()}`)
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as {
    files?: EnvFileInfo[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not list env files",
    )
  }
  return data.files ?? []
}

export async function fetchEnvValues(
  path: string,
  file: string,
): Promise<Record<string, string>> {
  const res = await fetch("/api/env/values", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, file }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as {
    values?: Record<string, string>
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ??
        "Could not read env values",
    )
  }
  return data.values ?? {}
}

// --- Dependency audit -------------------------------------------------------

export type DepDiffLevel = "major" | "minor" | "patch" | "none" | "unknown"

export type DepInfo = {
  name: string
  range: string
  latest: string | null
  diff: DepDiffLevel
  dev: boolean
}

export type ProjectAudit = {
  path: string
  name: string
  error: string | null
  packages: DepInfo[]
  counts: { total: number; outdated: number; major: number }
}

export async function auditDeps(paths: string[]): Promise<ProjectAudit[]> {
  const res = await fetch("/api/deps/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  })
  const text = await res.text()
  const data = parseResponseBody(text) as unknown as {
    projects?: ProjectAudit[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(
      (typeof data.error === "string" ? data.error : null) ?? "Audit failed",
    )
  }
  return data.projects ?? []
}
