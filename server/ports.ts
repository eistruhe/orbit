import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type PortEntry = {
  command: string
  pid: number
  user: string
  address: string
  port: number
}

const LSOF_ARGS = ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "+c0"]
const LSOF_TIMEOUT_MS = 3000

function parsePort(name: string): { address: string; port: number } | null {
  // NAME looks like `*:5173`, `127.0.0.1:8788`, or `[::1]:3000`.
  const idx = name.lastIndexOf(":")
  if (idx < 0) return null
  const port = Number(name.slice(idx + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { address: name.slice(0, idx), port }
}

function parseLsofOutput(stdout: string): PortEntry[] {
  const entries: PortEntry[] = []
  const seen = new Set<string>()
  const lines = stdout.split("\n")

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    // Columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME [state].
    // COMMAND may contain spaces (+c0 widens it), so anchor on the PID column
    // and parse the tail from the right.
    const match = line.match(
      /^(.+?)\s+(\d+)\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\S+)/,
    )
    if (!match) continue
    const [, command, pidStr, user, name] = match
    const pid = Number(pidStr)
    if (!Number.isInteger(pid)) continue
    const parsed = parsePort(name)
    if (!parsed) continue

    // IPv4/IPv6 double listings collapse to one row per pid+port.
    const key = `${pid}:${parsed.port}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      // lsof escapes spaces and other bytes as \xNN even with +c0.
      command: command
        .trim()
        .replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        ),
      pid,
      user,
      address: parsed.address,
      port: parsed.port,
    })
  }

  return entries.sort((a, b) => a.port - b.port)
}

export async function listListeningPorts(): Promise<PortEntry[]> {
  try {
    const out = await execFileAsync("lsof", LSOF_ARGS, {
      timeout: LSOF_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: process.env,
    })
    return parseLsofOutput(out.stdout)
  } catch (error) {
    // lsof exits 1 when it finds nothing; treat stdout-less failures as empty.
    const maybe = error as { stdout?: string }
    if (typeof maybe.stdout === "string" && maybe.stdout.length > 0) {
      return parseLsofOutput(maybe.stdout)
    }
    return []
  }
}

export type KillPortResult = { ok: true } | { ok: false; status: number; error: string }

/**
 * SIGTERMs `pid` only after re-confirming it still listens on `port`
 * (guards against pid reuse between listing and killing).
 */
export async function killPortProcess(
  pid: number,
  port: number,
): Promise<KillPortResult> {
  if (!Number.isInteger(pid) || pid <= 1) {
    return { ok: false, status: 400, error: "Invalid pid" }
  }
  if (pid === process.pid) {
    return { ok: false, status: 400, error: "Refusing to kill the Orbit API process" }
  }

  const current = await listListeningPorts()
  const stillListening = current.some(
    (entry) => entry.pid === pid && entry.port === port,
  )
  if (!stillListening) {
    return {
      ok: false,
      status: 409,
      error: "Process is no longer listening on that port",
    }
  }

  try {
    process.kill(pid, "SIGTERM")
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "EPERM") {
      return {
        ok: false,
        status: 403,
        error: "Not permitted to kill this process (owned by another user)",
      }
    }
    if (code === "ESRCH") {
      return { ok: false, status: 409, error: "Process already exited" }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 500, error: message }
  }

  return { ok: true }
}
