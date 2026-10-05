import { appendFile, mkdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"

import { CONFIG_DIR } from "./prefs.ts"

/**
 * Append-only usage log behind the Statistics page: one JSON object per line
 * in ~/.config/orbit/stats.jsonl. Events are raw facts; totals, dedupe and
 * per-project grouping happen when the log is read.
 */
const STATS_PATH = join(CONFIG_DIR, "stats.jsonl")
const STATS_VERSION = 1

export const IMAGE_TOOLS = ["tinify", "svgo", "convert"] as const
export const IMAGE_OUTPUTS = ["replace", "new-file", "download", "clipboard"] as const

export type ImageTool = (typeof IMAGE_TOOLS)[number]
/**
 * How the result left the tool: `replace` overwrote the original,
 * `new-file` was written next to it, `download`/`clipboard` never touched
 * the original on disk.
 */
export type ImageOutput = (typeof IMAGE_OUTPUTS)[number]

export type ImageStatsEvent = {
  type: "image"
  tool: ImageTool
  /** File name; always present, also for pasted input without a path. */
  name: string
  /** Absolute source path when known (file pickers, desktop drops). */
  path?: string
  /** Git top-level that contains `path`, resolved when the event is recorded. */
  project?: string
  formatIn: string
  formatOut: string
  bytesIn: number
  bytesOut: number
  output: ImageOutput
  /** Convert only: output has other pixel dimensions than the input. */
  resized?: boolean
}

export type CleanupStatsEvent = {
  type: "cleanup"
  project: string
  /** Size of the deleted node_modules; null when it could not be measured. */
  bytesFreed: number | null
}

/** Account-wide Tinify compressions this month, as reported by the API. */
export type TinifyQuotaStatsEvent = {
  type: "tinify-quota"
  compressionCount: number
}

export type StatsEventInput = ImageStatsEvent | CleanupStatsEvent | TinifyQuotaStatsEvent
export type StatsEvent = StatsEventInput & { v: number; at: string }

/** Lowercase extension without the dot; `jpeg` is folded into `jpg`. */
export function formatFromPath(path: string): string {
  const ext = extname(path).slice(1).toLowerCase()
  return ext === "jpeg" ? "jpg" : ext
}

const projectCache = new Map<string, string | null>()

/**
 * Nearest ancestor directory of `path` that contains a `.git` entry (a
 * directory, or a file for worktrees and submodules).
 */
async function findProjectRoot(path: string): Promise<string | null> {
  const startDir = dirname(resolve(path))
  const visited: string[] = []
  let dir = startDir
  let found: string | null = null

  while (true) {
    const cached = projectCache.get(dir)
    if (cached !== undefined) {
      found = cached
      break
    }
    visited.push(dir)
    try {
      await stat(join(dir, ".git"))
      found = dir
      break
    } catch {
      // not a repository root, keep walking up
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const visitedDir of visited) projectCache.set(visitedDir, found)
  return found
}

let writeChain: Promise<void> = Promise.resolve()

/**
 * Appends events to the log. Never throws: statistics must not break the
 * tool that produced them, so failures are only logged.
 */
export function recordStatsEvents(events: StatsEventInput[]): Promise<void> {
  if (events.length === 0) return writeChain

  writeChain = writeChain.then(async () => {
    try {
      const at = new Date().toISOString()
      const lines: string[] = []
      for (const event of events) {
        const withProject =
          event.type === "image" && event.path && !event.project
            ? { ...event, project: (await findProjectRoot(event.path)) ?? undefined }
            : event
        lines.push(JSON.stringify({ v: STATS_VERSION, at, ...withProject }))
      }
      await mkdir(CONFIG_DIR, { recursive: true })
      await appendFile(STATS_PATH, `${lines.join("\n")}\n`, "utf8")
    } catch (error) {
      console.error("Could not record stats events:", error)
    }
  })
  return writeChain
}

const MAX_CLIENT_EVENTS = 200
const MAX_STRING_LENGTH = 4096

function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function boundedString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_STRING_LENGTH
    ? value
    : null
}

/**
 * Validates image events reported by client-side tools (SVGO, convert).
 * Invalid entries are dropped; the server fills in `project` itself.
 */
export function parseClientImageEvents(input: unknown): ImageStatsEvent[] {
  if (!Array.isArray(input)) return []
  const events: ImageStatsEvent[] = []

  for (const raw of input.slice(0, MAX_CLIENT_EVENTS)) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const tool = IMAGE_TOOLS.find((value) => value === entry.tool)
    const output = IMAGE_OUTPUTS.find((value) => value === entry.output)
    const name = boundedString(entry.name)
    const formatIn = boundedString(entry.formatIn)
    const formatOut = boundedString(entry.formatOut)
    if (
      entry.type !== "image" ||
      !tool ||
      !output ||
      !name ||
      !formatIn ||
      !formatOut ||
      !isByteCount(entry.bytesIn) ||
      !isByteCount(entry.bytesOut)
    ) {
      continue
    }

    const path = boundedString(entry.path)
    events.push({
      type: "image",
      tool,
      name: basename(name),
      ...(path ? { path: resolve(path) } : {}),
      formatIn: formatIn.toLowerCase(),
      formatOut: formatOut.toLowerCase(),
      bytesIn: Math.round(entry.bytesIn),
      bytesOut: Math.round(entry.bytesOut),
      output,
      ...(typeof entry.resized === "boolean" ? { resized: entry.resized } : {}),
    })
  }

  return events
}
