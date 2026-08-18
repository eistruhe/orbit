import { spawn, type ChildProcess } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

export type DevServerPackageManager = "bun" | "pnpm" | "yarn" | "npm"

export type DevServerStatus = "starting" | "running" | "exited" | "error"

export type DevServerLogLine = {
  seq: number
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

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

type ManagedDevServer = DevServerInfo & {
  child: ChildProcess
  logs: DevServerLogLine[]
  nextSeq: number
  stdoutRemainder: string
  stderrRemainder: string
}

const MAX_LOG_LINES = 2000
/** Consider the process "running" after this long without exiting, even if no URL was printed. */
const RUNNING_AFTER_MS = 1500
const STOP_GRACE_MS = 4000

const servers = new Map<string, ManagedDevServer>()
let nextServerId = 1

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g

const URL_PATTERN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s"')\]]*)?/i

export async function detectPackageManager(
  repoPath: string,
): Promise<DevServerPackageManager> {
  const checks: Array<[string, DevServerPackageManager]> = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ]
  for (const [file, pm] of checks) {
    try {
      const st = await stat(join(repoPath, file))
      if (st.isFile()) return pm
    } catch {
      // keep checking
    }
  }
  return "npm"
}

export async function readPackageScripts(
  repoPath: string,
): Promise<Record<string, string> | null> {
  try {
    const raw = await readFile(join(repoPath, "package.json"), "utf8")
    const parsed = JSON.parse(raw) as { scripts?: unknown }
    if (!parsed.scripts || typeof parsed.scripts !== "object") return {}
    return Object.fromEntries(
      Object.entries(parsed.scripts).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    )
  } catch {
    return null
  }
}

function toInfo(server: ManagedDevServer): DevServerInfo {
  return {
    id: server.id,
    repoPath: server.repoPath,
    script: server.script,
    packageManager: server.packageManager,
    pid: server.pid,
    status: server.status,
    startedAt: server.startedAt,
    exitCode: server.exitCode,
    detectedUrl: server.detectedUrl,
  }
}

function pushLogLine(
  server: ManagedDevServer,
  stream: "stdout" | "stderr",
  text: string,
): void {
  server.logs.push({
    seq: server.nextSeq,
    ts: new Date().toISOString(),
    stream,
    text,
  })
  server.nextSeq += 1
  if (server.logs.length > MAX_LOG_LINES) {
    server.logs.splice(0, server.logs.length - MAX_LOG_LINES)
  }
}

function normalizeDetectedUrl(raw: string): string {
  return raw
    .replace("0.0.0.0", "localhost")
    .replace("127.0.0.1", "localhost")
    .replace("[::1]", "localhost")
    .replace("[::]", "localhost")
}

function ingestChunk(
  server: ManagedDevServer,
  stream: "stdout" | "stderr",
  chunk: string,
): void {
  const key = stream === "stdout" ? "stdoutRemainder" : "stderrRemainder"
  const combined = server[key] + chunk
  const lines = combined.split("\n")
  server[key] = lines.pop() ?? ""

  for (const rawLine of lines) {
    const text = rawLine.replace(ANSI_PATTERN, "").trimEnd()
    if (text.length === 0) continue
    pushLogLine(server, stream, text)

    if (!server.detectedUrl) {
      const match = text.match(URL_PATTERN)
      if (match) {
        server.detectedUrl = normalizeDetectedUrl(match[0])
        if (server.status === "starting") {
          server.status = "running"
        }
      }
    }
  }
}

function isProcessGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch {
    // Group already gone.
  }
}

export function findDevServerByRepoPath(
  repoPath: string,
): DevServerInfo | null {
  for (const server of servers.values()) {
    if (
      server.repoPath === repoPath &&
      (server.status === "starting" || server.status === "running")
    ) {
      return toInfo(server)
    }
  }
  return null
}

export type StartDevServerResult =
  | { ok: true; server: DevServerInfo }
  | { ok: false; status: number; error: string }

export async function startDevServer(
  repoPath: string,
  script: string,
): Promise<StartDevServerResult> {
  const active = findDevServerByRepoPath(repoPath)
  if (active) {
    return {
      ok: false,
      status: 409,
      error: `A dev server is already ${active.status} for this project (script "${active.script}").`,
    }
  }

  const scripts = await readPackageScripts(repoPath)
  if (scripts === null) {
    return { ok: false, status: 400, error: "No package.json found in this project." }
  }
  if (!scripts[script]) {
    return { ok: false, status: 400, error: `Script "${script}" does not exist in package.json.` }
  }

  const packageManager = await detectPackageManager(repoPath)
  let child: ChildProcess
  try {
    child = spawn(packageManager, ["run", script], {
      cwd: repoPath,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 500, error: `Could not spawn ${packageManager}: ${message}` }
  }

  if (typeof child.pid !== "number") {
    return { ok: false, status: 500, error: `Could not start ${packageManager} run ${script}.` }
  }

  const id = `dev-${nextServerId}`
  nextServerId += 1

  const server: ManagedDevServer = {
    id,
    repoPath,
    script,
    packageManager,
    pid: child.pid,
    status: "starting",
    startedAt: new Date().toISOString(),
    exitCode: null,
    detectedUrl: null,
    child,
    logs: [],
    nextSeq: 1,
    stdoutRemainder: "",
    stderrRemainder: "",
  }
  servers.set(id, server)

  child.stdout?.on("data", (chunk: Buffer) => {
    ingestChunk(server, "stdout", chunk.toString("utf8"))
  })
  child.stderr?.on("data", (chunk: Buffer) => {
    ingestChunk(server, "stderr", chunk.toString("utf8"))
  })

  child.on("error", (error) => {
    server.status = "error"
    pushLogLine(server, "stderr", `spawn error: ${error.message}`)
  })

  child.on("exit", (code, signal) => {
    // Flush any partial trailing lines before marking exited.
    if (server.stdoutRemainder.trim()) ingestChunk(server, "stdout", "\n")
    if (server.stderrRemainder.trim()) ingestChunk(server, "stderr", "\n")
    server.exitCode = code
    if (server.status !== "error") {
      server.status = "exited"
    }
    pushLogLine(
      server,
      "stderr",
      signal
        ? `process exited (signal ${signal})`
        : `process exited (code ${code ?? "unknown"})`,
    )
    // The package manager exited, but its group may still hold the real
    // dev server — make sure the whole group is gone.
    killProcessGroup(server.pid, "SIGTERM")
  })

  setTimeout(() => {
    if (server.status === "starting") {
      server.status = "running"
    }
  }, RUNNING_AFTER_MS)

  return { ok: true, server: toInfo(server) }
}

export function listDevServers(): DevServerInfo[] {
  return [...servers.values()]
    .map(toInfo)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export function stopDevServer(id: string): { ok: boolean; error?: string } {
  const server = servers.get(id)
  if (!server) {
    return { ok: false, error: "Unknown dev server id" }
  }
  if (server.status === "exited" || server.status === "error") {
    servers.delete(id)
    return { ok: true }
  }

  killProcessGroup(server.pid, "SIGTERM")
  setTimeout(() => {
    if (isProcessGroupAlive(server.pid)) {
      killProcessGroup(server.pid, "SIGKILL")
    }
  }, STOP_GRACE_MS)
  return { ok: true }
}

export type DevServerLogsResponse = {
  lines: DevServerLogLine[]
  nextSince: number
  status: DevServerStatus
  detectedUrl: string | null
  exitCode: number | null
}

export function getDevServerLogs(
  id: string,
  since: number,
): DevServerLogsResponse | null {
  const server = servers.get(id)
  if (!server) return null
  const lines = server.logs.filter((line) => line.seq > since)
  return {
    lines,
    nextSince: server.nextSeq - 1,
    status: server.status,
    detectedUrl: server.detectedUrl,
    exitCode: server.exitCode,
  }
}

/**
 * Kills every managed dev-server process group. Called from the API process
 * signal handlers: children are spawned `detached` (their own groups), so the
 * group-kill Electron sends to the API process does not reach them.
 */
export function shutdownAllDevServers(): void {
  for (const server of servers.values()) {
    if (server.status === "starting" || server.status === "running") {
      killProcessGroup(server.pid, "SIGTERM")
    }
  }
}

export function forceKillRemainingDevServers(): void {
  for (const server of servers.values()) {
    if (isProcessGroupAlive(server.pid)) {
      killProcessGroup(server.pid, "SIGKILL")
    }
  }
}
