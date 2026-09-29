import { execFile } from "node:child_process"
import { realpath, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, relative } from "node:path"
import { promisify } from "node:util"

import { Hono } from "hono"

const execFileAsync = promisify(execFile)

import {
  detectPackageManager,
  forceKillRemainingDevServers,
  getDevServerLogs,
  listDevServers,
  readPackageScripts,
  shutdownAllDevServers,
  startDevServer,
  stopDevServer,
} from "./dev-servers.ts"
import { auditProjects } from "./deps.ts"
import { lookupDns } from "./dns.ts"
import { listEnvFiles, readEnvValues } from "./env-files.ts"
import { replaceFileInPlace, writeBatchFiles, writeDerivedFile } from "./files.ts"
import { checkSslDomains } from "./ssl.ts"
import { fetchSeoAudit } from "./seo.ts"
import { openLocalPath, resolvePathUnderAllowedRoots } from "./open-path.ts"
import { killPortProcess, listListeningPorts } from "./ports.ts"
import { readPreferences, writePreferences, type ProjectLibrary } from "./prefs.ts"
import { readRepoReadme } from "./readme.ts"
import { inspectRedirects } from "./redirects.ts"
import { validateRobots } from "./robots.ts"
import { scanRepos } from "./scan.ts"
import { runContentSearch } from "./search.ts"
import { runSchemaViewerValidation } from "./schema-viewer.ts"
import { tinifyPaths, validateTinifyApiKey } from "./tinify.ts"

/** Default avoids 8787 — commonly used by Wrangler and other local dev servers. */
const PORT = (() => {
  const n = Number(process.env.ORBIT_API_PORT)
  return Number.isFinite(n) && n > 0 ? n : 8788
})()

function defaultScanRoot(): string {
  return process.env.ORBIT_SCAN_ROOT ?? join(homedir(), "Sites")
}

function expandHomePath(pathValue: string): string {
  if (pathValue === "~") return homedir()
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2))
  }
  return pathValue
}

function getPrimaryScanRoot(scanRoot: string | undefined): string {
  return scanRoot && scanRoot.length > 0
    ? expandHomePath(scanRoot)
    : defaultScanRoot()
}

function parseAdditionalScanRoots(input: unknown): ProjectLibrary[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id.trim() : "",
      label: typeof entry.label === "string" ? entry.label.trim() : "",
      path: typeof entry.path === "string" ? entry.path.trim() : "",
    }))
    .filter((entry) => entry.id.length > 0 && entry.label.length > 0 && entry.path.length > 0)
}

function getConfiguredLibraries(
  scanRoot: string | undefined,
  primaryScanRootLabel: string | undefined,
  additionalScanRoots: ProjectLibrary[],
): ProjectLibrary[] {
  const primary = {
    id: "primary",
    label:
      typeof primaryScanRootLabel === "string" &&
      primaryScanRootLabel.trim().length > 0
        ? primaryScanRootLabel.trim()
        : "Projects",
    path: getPrimaryScanRoot(scanRoot),
  }
  const extras = additionalScanRoots
    .filter((root) => root.id !== "primary")
    .map((root) => ({ ...root, path: expandHomePath(root.path) }))
  return [primary, ...extras]
}

async function getAllowedRoots(): Promise<string[]> {
  const prefs = await readPreferences()
  return getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  ).map((library) => library.path)
}

type BranchGroups = {
  local: string[]
  remote: string[]
}

async function listRepoBranches(repoPath: string): Promise<BranchGroups> {
  const localResult = await execFileAsync(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    { cwd: repoPath, env: process.env, maxBuffer: 1024 * 1024 },
  )
  const remoteResult = await execFileAsync(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    { cwd: repoPath, env: process.env, maxBuffer: 1024 * 1024 },
  )

  const local = localResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
  const remote = remoteResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  return { local, remote }
}

const app = new Hono()

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "orbit-api" }),
)

app.get("/api/preferences", async (c) => {
  const prefs = await readPreferences()
  return c.json(prefs)
})

app.put("/api/preferences", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const current = await readPreferences()
  const noteEntries =
    body.repoNotes && typeof body.repoNotes === "object"
      ? Object.entries(body.repoNotes).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === "string" && typeof entry[1] === "string",
        )
      : null
  const tagEntries =
    body.repoTags && typeof body.repoTags === "object"
      ? Object.entries(body.repoTags).map(([path, tags]) => [
          path,
          Array.isArray(tags)
            ? tags.filter((tag): tag is string => typeof tag === "string")
            : [],
        ])
      : null
  const nextAppSettings =
    body.appSettings && typeof body.appSettings === "object"
      ? {
          ...current.appSettings,
          ...(body.appSettings as Record<string, unknown>),
          tinify:
            (body.appSettings as { tinify?: unknown }).tinify &&
            typeof (body.appSettings as { tinify?: unknown }).tinify === "object"
              ? {
                  ...current.appSettings.tinify,
                  ...((body.appSettings as { tinify?: unknown }).tinify as Record<
                    string,
                    unknown
                  >),
                  apiKey:
                    typeof ((body.appSettings as { tinify?: { apiKey?: unknown } })
                      .tinify?.apiKey) === "string"
                      ? (body.appSettings as { tinify: { apiKey: string } }).tinify
                          .apiKey
                      : current.appSettings.tinify?.apiKey,
                }
              : current.appSettings.tinify,
          svgo:
            (body.appSettings as { svgo?: unknown }).svgo &&
            typeof (body.appSettings as { svgo?: unknown }).svgo === "object"
              ? {
                  ...current.appSettings.svgo,
                  ...((body.appSettings as { svgo?: unknown }).svgo as Record<
                    string,
                    unknown
                  >),
                  schemaVersion:
                    typeof (body.appSettings as { svgo?: { schemaVersion?: unknown } })
                      .svgo?.schemaVersion === "number"
                      ? Math.round(
                          (body.appSettings as { svgo: { schemaVersion: number } }).svgo
                            .schemaVersion,
                        )
                      : current.appSettings.svgo?.schemaVersion,
                  plugins:
                    (body.appSettings as { svgo?: { plugins?: unknown } }).svgo
                      ?.plugins &&
                    typeof (body.appSettings as { svgo?: { plugins?: unknown } }).svgo
                      ?.plugins === "object"
                      ? Object.fromEntries(
                          Object.entries(
                            (body.appSettings as { svgo: { plugins: Record<string, unknown> } })
                              .svgo.plugins,
                          ).filter(
                            (entry): entry is [string, boolean] =>
                              typeof entry[0] === "string" &&
                              typeof entry[1] === "boolean",
                          ),
                        )
                      : current.appSettings.svgo?.plugins,
                  multipass:
                    typeof (body.appSettings as { svgo?: { multipass?: unknown } }).svgo
                      ?.multipass === "boolean"
                      ? (body.appSettings as { svgo: { multipass: boolean } }).svgo
                          .multipass
                      : current.appSettings.svgo?.multipass,
                  pretty:
                    typeof (body.appSettings as { svgo?: { pretty?: unknown } }).svgo
                      ?.pretty === "boolean"
                      ? (body.appSettings as { svgo: { pretty: boolean } }).svgo.pretty
                      : current.appSettings.svgo?.pretty,
                  floatPrecision:
                    typeof (body.appSettings as { svgo?: { floatPrecision?: unknown } })
                      .svgo?.floatPrecision === "number"
                      ? (body.appSettings as { svgo: { floatPrecision: number } }).svgo
                          .floatPrecision
                      : current.appSettings.svgo?.floatPrecision,
                  transformPrecision:
                    typeof (
                      body.appSettings as {
                        svgo?: { transformPrecision?: unknown }
                      }
                    ).svgo?.transformPrecision === "number"
                      ? (
                          body.appSettings as {
                            svgo: { transformPrecision: number }
                          }
                        ).svgo.transformPrecision
                      : current.appSettings.svgo?.transformPrecision,
                }
              : current.appSettings.svgo,
        }
      : current.appSettings
  const next = {
    ...current,
    pinnedPaths: Array.isArray(body.pinnedPaths)
      ? body.pinnedPaths.filter((p: unknown) => typeof p === "string")
      : current.pinnedPaths,
    recent: Array.isArray(body.recent)
      ? body.recent.filter(
          (r: unknown) =>
            r &&
            typeof r === "object" &&
            typeof (r as { path?: string }).path === "string" &&
            typeof (r as { lastOpenedAt?: string }).lastOpenedAt === "string",
        )
      : current.recent,
    primaryScanRootLabel:
      typeof body.primaryScanRootLabel === "string" &&
      body.primaryScanRootLabel.trim().length > 0
        ? body.primaryScanRootLabel.trim()
        : current.primaryScanRootLabel,
    scanRoot:
      typeof body.scanRoot === "string" && body.scanRoot.length > 0
        ? body.scanRoot
        : current.scanRoot,
    additionalScanRoots:
      body.additionalScanRoots !== undefined
        ? parseAdditionalScanRoots(body.additionalScanRoots)
        : current.additionalScanRoots,
    repoNotes: noteEntries ? Object.fromEntries(noteEntries) : current.repoNotes,
    repoTags: tagEntries ? Object.fromEntries(tagEntries) : current.repoTags,
    appSettings: nextAppSettings,
  }
  await writePreferences(next)
  return c.json(next)
})

app.post("/api/scan", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const prefs = await readPreferences()
  const libraries = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  )
  const fromBody =
    body &&
    typeof body === "object" &&
    typeof (body as { scanRoot?: string }).scanRoot === "string"
      ? (body as { scanRoot: string }).scanRoot
      : undefined
  const fromLibraryId =
    body &&
    typeof body === "object" &&
    typeof (body as { libraryId?: string }).libraryId === "string"
      ? (body as { libraryId: string }).libraryId
      : undefined
  const selectedLibrary = fromLibraryId
    ? libraries.find((library) => library.id === fromLibraryId)
    : undefined
  const scanRoot = expandHomePath(
    fromBody ?? selectedLibrary?.path ?? getPrimaryScanRoot(prefs.scanRoot),
  )
  const libraryId = selectedLibrary?.id ?? fromLibraryId ?? "primary"
  const scannedAt = new Date().toISOString()

  try {
    const st = await stat(scanRoot)
    if (!st.isDirectory()) {
      return c.json(
        {
          error: `Scan root is not a directory: ${scanRoot}`,
          libraryId,
          scanRoot,
          scannedAt,
          repos: [],
        },
        400,
      )
    }
  } catch {
    return c.json(
      {
        error: `Scan root does not exist: ${scanRoot}`,
        libraryId,
        scanRoot,
        scannedAt,
        repos: [],
      },
      400,
    )
  }

  let gitAvailable = true
  try {
    await execFileAsync("git", ["--version"], { env: process.env })
  } catch {
    gitAvailable = false
  }

  if (!gitAvailable) {
    return c.json(
      {
        error: "git CLI not found on PATH",
        libraryId,
        scanRoot,
        scannedAt,
        repos: [],
      },
      500,
    )
  }

  const repos = await scanRepos(scanRoot, libraryId)
  return c.json({ libraryId, scanRoot, scannedAt, repos })
})

app.post("/api/tinify", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const paths = Array.isArray((body as { paths?: unknown }).paths)
    ? (body as { paths: unknown[] }).paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      )
    : []
  const replaceOriginal =
    typeof (body as { replaceOriginal?: unknown }).replaceOriginal === "boolean"
      ? (body as { replaceOriginal: boolean }).replaceOriginal
      : true

  if (paths.length === 0) {
    return c.json({ error: "No image paths were provided" }, 400)
  }

  const prefs = await readPreferences()
  const apiKey = prefs.appSettings.tinify?.apiKey?.trim()
  if (!apiKey) {
    return c.json(
      {
        error:
          "TinyPNG API key is missing. Add it in Settings before compressing images.",
      },
      400,
    )
  }

  const results = await tinifyPaths(apiKey, paths, replaceOriginal)
  return c.json({ results })
})

app.post("/api/tinify/validate-key", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const apiKey =
    typeof (body as { apiKey?: unknown }).apiKey === "string"
      ? (body as { apiKey: string }).apiKey.trim()
      : ""
  if (!apiKey) {
    return c.json({ error: "Missing API key" }, 400)
  }

  const validation = await validateTinifyApiKey(apiKey)
  return c.json(validation)
})

app.post("/api/open", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const pathStr = (body as { path?: string }).path
  const target = (body as { target?: string }).target
  if (typeof pathStr !== "string" || pathStr.length === 0) {
    return c.json({ error: "Missing path" }, 400)
  }
  if (
    target !== "finder" &&
    target !== "cursor" &&
    target !== "github" &&
    target !== "browser"
  ) {
    return c.json(
      {
        error:
          "target must be one of: \"finder\", \"cursor\", \"github\", \"browser\"",
      },
      400,
    )
  }

  const prefs = await readPreferences()
  const allowedRoots = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  ).map((library) => library.path)

  try {
    const safe = await resolvePathUnderAllowedRoots(pathStr, allowedRoots)
    await openLocalPath(safe, target)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
})

app.get("/api/seo-audit", async (c) => {
  const target = c.req.query("url")
  const result = await fetchSeoAudit(target)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 500 | 502 | 504)
  }
  return c.json(result.data)
})

app.post("/api/schema/validate", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const url =
    typeof (body as { url?: unknown }).url === "string"
      ? (body as { url: string }).url
      : null
  const snippet =
    typeof (body as { snippet?: unknown }).snippet === "string"
      ? (body as { snippet: string }).snippet
      : null

  const result = await runSchemaViewerValidation({ url, snippet })
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 500 | 502 | 504)
  }
  return c.json(result.data)
})

app.get("/api/repo/branches", async (c) => {
  const pathStr = c.req.query("path")
  if (!pathStr) {
    return c.json({ error: "Missing path" }, 400)
  }

  const prefs = await readPreferences()
  const allowedRoots = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  ).map((library) => library.path)
  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, allowedRoots)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  try {
    const branches = await listRepoBranches(safePath)
    return c.json(branches)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 500)
  }
})

app.post("/api/repo/delete-node-modules", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const pathStr = (body as { path?: string }).path
  if (typeof pathStr !== "string" || pathStr.length === 0) {
    return c.json({ error: "Missing path" }, 400)
  }

  const prefs = await readPreferences()
  const allowedRoots = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  ).map((library) => library.path)

  let safeRepo: string
  try {
    safeRepo = await resolvePathUnderAllowedRoots(pathStr, allowedRoots)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  const nodeModulesPath = join(safeRepo, "node_modules")
  let resolvedNm: string
  try {
    resolvedNm = await realpath(nodeModulesPath)
  } catch {
    return c.json({ ok: true, skipped: true })
  }

  const rel = relative(safeRepo, resolvedNm)
  if (rel.startsWith("..") || rel === "..") {
    return c.json(
      { error: "node_modules resolves outside the repository" },
      400,
    )
  }

  if (basename(resolvedNm) !== "node_modules") {
    return c.json({ error: "Not a node_modules directory" }, 400)
  }

  try {
    const st = await stat(resolvedNm)
    if (!st.isDirectory()) {
      return c.json({ error: "node_modules is not a directory" }, 400)
    }
    await rm(resolvedNm, { recursive: true, force: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 500)
  }

  return c.json({ ok: true })
})

app.post("/api/repo/git-fetch", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const pathStr = (body as { path?: string }).path
  if (typeof pathStr !== "string" || pathStr.length === 0) {
    return c.json({ error: "Missing path" }, 400)
  }

  const prefs = await readPreferences()
  const allowedRoots = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  ).map((library) => library.path)

  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, allowedRoots)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  try {
    await execFileAsync("git", ["fetch"], {
      cwd: safePath,
      env: process.env,
      maxBuffer: 1024 * 1024,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 500)
  }

  return c.json({ ok: true })
})

app.get("/api/repo/readme", async (c) => {
  const pathStr = c.req.query("path")
  if (!pathStr) {
    return c.json({ error: "Missing path" }, 400)
  }

  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, await getAllowedRoots())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  const result = await readRepoReadme(safePath)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 404 | 500)
  }
  return c.json(result.data)
})

app.get("/api/repo/scripts", async (c) => {
  const pathStr = c.req.query("path")
  if (!pathStr) {
    return c.json({ error: "Missing path" }, 400)
  }

  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, await getAllowedRoots())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  const scripts = await readPackageScripts(safePath)
  if (scripts === null) {
    return c.json({ error: "No package.json found in this project" }, 404)
  }
  const packageManager = await detectPackageManager(safePath)
  return c.json({ scripts, packageManager })
})

app.get("/api/dev-servers", (c) => {
  return c.json({ servers: listDevServers() })
})

app.post("/api/dev-servers/start", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const pathStr = (body as { path?: unknown }).path
  const script =
    typeof (body as { script?: unknown }).script === "string" &&
    (body as { script: string }).script.trim().length > 0
      ? (body as { script: string }).script.trim()
      : "dev"
  if (typeof pathStr !== "string" || pathStr.length === 0) {
    return c.json({ error: "Missing path" }, 400)
  }

  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, await getAllowedRoots())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ error: message }, 400)
  }

  const result = await startDevServer(safePath, script)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 409 | 500)
  }
  return c.json(result.server)
})

app.post("/api/dev-servers/stop", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const id = (body as { id?: unknown }).id
  if (typeof id !== "string" || id.length === 0) {
    return c.json({ error: "Missing id" }, 400)
  }
  const result = stopDevServer(id)
  if (!result.ok) {
    return c.json({ error: result.error ?? "Could not stop dev server" }, 400)
  }
  return c.json({ ok: true })
})

app.get("/api/dev-servers/:id/logs", (c) => {
  const id = c.req.param("id")
  const sinceRaw = Number(c.req.query("since"))
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0
  const logs = getDevServerLogs(id, since)
  if (!logs) {
    return c.json({ error: "Unknown dev server id" }, 404)
  }
  return c.json(logs)
})

app.post("/api/files/write-derived", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const originalPath = (body as { originalPath?: unknown }).originalPath
  const suffix = (body as { suffix?: unknown }).suffix
  const extension = (body as { extension?: unknown }).extension
  const dataBase64 = (body as { dataBase64?: unknown }).dataBase64
  if (
    typeof originalPath !== "string" ||
    typeof suffix !== "string" ||
    typeof extension !== "string" ||
    typeof dataBase64 !== "string"
  ) {
    return c.json(
      { error: "originalPath, suffix, extension, and dataBase64 are required" },
      400,
    )
  }

  const result = await writeDerivedFile({ originalPath, suffix, extension, dataBase64 })
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 413 | 500)
  }
  return c.json({ outputPath: result.outputPath })
})

app.post("/api/files/write-batch", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const dirPath = (body as { dirPath?: unknown }).dirPath
  const filesRaw = (body as { files?: unknown }).files
  if (typeof dirPath !== "string" || !Array.isArray(filesRaw)) {
    return c.json({ error: "dirPath and files are required" }, 400)
  }
  const files = filesRaw.filter(
    (entry): entry is { name: string; dataBase64: string } =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as { name?: unknown }).name === "string" &&
      typeof (entry as { dataBase64?: unknown }).dataBase64 === "string",
  )

  const result = await writeBatchFiles({ dirPath, files })
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 413 | 500)
  }
  return c.json({ written: result.written })
})

app.post("/api/files/replace", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const path = (body as { path?: unknown }).path
  const dataBase64 = (body as { dataBase64?: unknown }).dataBase64
  if (typeof path !== "string" || path.length === 0 || typeof dataBase64 !== "string") {
    return c.json({ error: "path and dataBase64 are required" }, 400)
  }

  const result = await replaceFileInPlace({ path, dataBase64 })
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 413 | 500)
  }
  return c.json({
    outputPath: result.outputPath,
    inputSize: result.inputSize,
    outputSize: result.outputSize,
  })
})

app.get("/api/env/files", async (c) => {
  const pathStr = c.req.query("path")
  if (!pathStr) return c.json({ error: "Missing path" }, 400)
  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, await getAllowedRoots())
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
  const result = await listEnvFiles(safePath)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 500)
  }
  return c.json(result.data)
})

app.post("/api/env/values", async (c) => {
  const body = await c.req.json().catch(() => null)
  const pathStr =
    body && typeof body === "object" &&
    typeof (body as { path?: unknown }).path === "string"
      ? (body as { path: string }).path
      : null
  if (!pathStr) return c.json({ error: "Missing path" }, 400)
  let safePath: string
  try {
    safePath = await resolvePathUnderAllowedRoots(pathStr, await getAllowedRoots())
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
  const result = await readEnvValues(
    safePath,
    (body as { file?: unknown }).file,
  )
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400)
  }
  return c.json(result.data)
})

app.post("/api/deps/audit", async (c) => {
  const body = await c.req.json().catch(() => null)
  const rawPaths =
    body && typeof body === "object"
      ? (body as { paths?: unknown }).paths
      : null
  if (!Array.isArray(rawPaths)) {
    return c.json({ error: "Expected a list of project paths" }, 400)
  }
  const allowedRoots = await getAllowedRoots()
  const safePaths: string[] = []
  for (const entry of rawPaths) {
    if (typeof entry !== "string") continue
    try {
      safePaths.push(await resolvePathUnderAllowedRoots(entry, allowedRoots))
    } catch {
      // Paths outside the scan roots are silently skipped.
    }
  }
  const result = await auditProjects(safePaths)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400)
  }
  return c.json(result.data)
})

app.get("/api/dns", async (c) => {
  const result = await lookupDns(c.req.query("domain"), c.req.query("type"))
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400)
  }
  return c.json(result.data)
})

app.post("/api/ssl/check", async (c) => {
  const body = await c.req.json().catch(() => null)
  const domains =
    body && typeof body === "object"
      ? (body as { domains?: unknown }).domains
      : null
  const result = await checkSslDomains(domains)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400)
  }
  return c.json(result.data)
})

app.get("/api/redirects", async (c) => {
  const result = await inspectRedirects(c.req.query("url"))
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 502 | 504)
  }
  return c.json(result.data)
})

app.post("/api/robots/validate", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const url =
    typeof (body as { url?: unknown }).url === "string"
      ? (body as { url: string }).url
      : null
  const result = await validateRobots(url)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 502 | 504)
  }
  return c.json(result.data)
})

app.post("/api/search", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const query =
    typeof (body as { query?: unknown }).query === "string"
      ? (body as { query: string }).query
      : ""
  const regex = (body as { regex?: unknown }).regex === true
  const caseSensitive = (body as { caseSensitive?: unknown }).caseSensitive === true
  const rawExtensions = (body as { extensions?: unknown }).extensions
  const extensions = Array.isArray(rawExtensions)
    ? rawExtensions.filter((entry): entry is string => typeof entry === "string")
    : []
  const libraryId =
    typeof (body as { libraryId?: unknown }).libraryId === "string"
      ? (body as { libraryId: string }).libraryId
      : null

  const prefs = await readPreferences()
  const libraries = getConfiguredLibraries(
    prefs.scanRoot,
    prefs.primaryScanRootLabel,
    prefs.additionalScanRoots,
  )
  const roots = (
    libraryId
      ? libraries.filter((library) => library.id === libraryId)
      : libraries
  ).map((library) => library.path)

  const result = await runContentSearch({
    query,
    regex,
    caseSensitive,
    extensions,
    roots,
  })
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 500)
  }
  return c.json(result.data)
})

app.get("/api/ports", async (c) => {
  const ports = await listListeningPorts()
  return c.json({ ports })
})

app.post("/api/ports/kill", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400)
  }
  const pid = Number((body as { pid?: unknown }).pid)
  const port = Number((body as { port?: unknown }).port)
  if (!Number.isInteger(pid) || !Number.isInteger(port)) {
    return c.json({ error: "pid and port must be integers" }, 400)
  }
  const result = await killPortProcess(pid, port)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400 | 403 | 409 | 500)
  }
  return c.json({ ok: true })
})

// Dev-server children are detached into their own process groups, so the
// group signal Electron sends to this process does not reach them. Reap them
// explicitly on shutdown.
let shuttingDown = false
function handleShutdownSignal(): void {
  if (shuttingDown) return
  shuttingDown = true
  shutdownAllDevServers()
  setTimeout(() => {
    forceKillRemainingDevServers()
    process.exit(0)
  }, 300)
}
process.on("SIGTERM", handleShutdownSignal)
process.on("SIGINT", handleShutdownSignal)

console.log(`orbit API listening on http://127.0.0.1:${PORT}`)

export default {
  port: PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch,
}
