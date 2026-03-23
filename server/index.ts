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
  const n = Number(process.env.DASHBOARD_API_PORT)
  return Number.isFinite(n) && n > 0 ? n : 8788
})()

function defaultScanRoot(): string {
  return process.env.DASHBOARD_SCAN_ROOT ?? join(homedir(), "Sites")
}

const app = new Hono()

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "dashboard-api" }),
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
  if (target !== "finder" && target !== "cursor") {
    return c.json({ error: "target must be \"finder\" or \"cursor\"" }, 400)
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

console.log(`dashboard API listening on http://127.0.0.1:${PORT}`)

export default {
  port: PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch,
}
