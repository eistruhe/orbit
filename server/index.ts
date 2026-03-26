import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { Hono } from "hono"

const execFileAsync = promisify(execFile)

import { openLocalPath, resolvePathUnderRoot } from "./open-path.ts"
import { readPreferences, writePreferences } from "./prefs.ts"
import { scanRepos } from "./scan.ts"

/** Default avoids 8787 — commonly used by Wrangler and other local dev servers. */
const PORT = (() => {
  const n = Number(process.env.ORBIT_API_PORT)
  return Number.isFinite(n) && n > 0 ? n : 8788
})()

function defaultScanRoot(): string {
  return process.env.ORBIT_SCAN_ROOT ?? join(homedir(), "Sites")
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
    scanRoot:
      typeof body.scanRoot === "string" && body.scanRoot.length > 0
        ? body.scanRoot
        : current.scanRoot,
    repoNotes: noteEntries ? Object.fromEntries(noteEntries) : current.repoNotes,
    repoTags: tagEntries ? Object.fromEntries(tagEntries) : current.repoTags,
  }
  await writePreferences(next)
  return c.json(next)
})

app.post("/api/scan", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const prefs = await readPreferences()
  const fromBody =
    body &&
    typeof body === "object" &&
    typeof (body as { scanRoot?: string }).scanRoot === "string"
      ? (body as { scanRoot: string }).scanRoot
      : undefined
  const scanRoot = fromBody ?? prefs.scanRoot ?? defaultScanRoot()
  const scannedAt = new Date().toISOString()

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
        scanRoot,
        scannedAt,
        repos: [],
      },
      500,
    )
  }

  const repos = await scanRepos(scanRoot)
  return c.json({ scanRoot, scannedAt, repos })
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
  const scanRoot = prefs.scanRoot ?? defaultScanRoot()

  try {
    const safe = await resolvePathUnderRoot(pathStr, scanRoot)
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

app.get("/api/repo/branches", async (c) => {
  const pathStr = c.req.query("path")
  if (!pathStr) {
    return c.json({ error: "Missing path" }, 400)
  }

  const prefs = await readPreferences()
  const scanRoot = prefs.scanRoot ?? defaultScanRoot()
  let safePath: string
  try {
    safePath = await resolvePathUnderRoot(pathStr, scanRoot)
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

console.log(`orbit API listening on http://127.0.0.1:${PORT}`)

export default {
  port: PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch,
}
