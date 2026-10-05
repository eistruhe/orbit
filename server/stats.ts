import { appendFile, mkdir, readFile, stat } from "node:fs/promises"
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

/** Result of an SEO audit, so a project's live site can show its last score. */
export type SeoAuditStatsEvent = {
  type: "seo-audit"
  url: string
  score: number
  pass: number
  warn: number
  fail: number
}

export type StatsEventInput =
  | ImageStatsEvent
  | CleanupStatsEvent
  | TinifyQuotaStatsEvent
  | SeoAuditStatsEvent
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

/** Reads all events; a missing log is empty, unparsable lines are skipped. */
export async function readStatsEvents(): Promise<StatsEvent[]> {
  await writeChain
  let raw: string
  try {
    raw = await readFile(STATS_PATH, "utf8")
  } catch {
    return []
  }

  const events: StatsEvent[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Partial<StatsEvent>
      if (
        typeof parsed.type === "string" &&
        typeof parsed.at === "string" &&
        !Number.isNaN(Date.parse(parsed.at))
      ) {
        events.push(parsed as StatsEvent)
      }
    } catch {
      // torn or hand-edited line
    }
  }
  return events
}

const SERIES_DAYS = 30
const QUOTA_HISTORY_MONTHS = 6
const TOP_PROJECT_COUNT = 6
const RECENT_RUN_COUNT = 8

export type SavingsGroup = {
  tool: ImageTool
  formatIn: string
  formatOut: string
  files: number
  bytesIn: number
  bytesOut: number
  /** Bytes saved per local day, oldest first, `seriesDays` long. */
  dailySaved: number[]
}

export type RecentRun =
  | (Pick<ImageStatsEvent, "type" | "tool" | "name" | "project" | "formatIn" | "formatOut" | "bytesIn" | "bytesOut"> & {
      at: string
    })
  | (CleanupStatsEvent & { at: string })

export type StatsSummary = {
  /** Timestamp of the first recorded event; null while the log is empty. */
  trackingSince: string | null
  seriesDays: number
  /** Same-format compression (Tinify, SVGO): the "weight reduced" total. */
  compression: {
    files: number
    bytesIn: number
    bytesOut: number
    dailySaved: number[]
    dailyFiles: number[]
    groups: SavingsGroup[]
  }
  /** Format conversion at original size; kept out of the compression total. */
  conversion: { groups: SavingsGroup[] }
  cleanup: { runs: number; bytesFreed: number; daily: number[] }
  tinifyQuota: {
    /** Local calendar month, `YYYY-MM`. */
    month: string
    used: number | null
    history: { month: string; used: number | null }[]
  }
  /** Projects by bytes saved through same-format compression. */
  topProjects: { path: string; files: number; bytesSaved: number }[]
  recent: RecentRun[]
  /** Latest audit of `options.siteUrl`; null when none was recorded. */
  seoAudit: (Omit<SeoAuditStatsEvent, "type"> & { at: string }) | null
}

export type SummarizeOptions = {
  /** Only count image and cleanup events of this git project. */
  project?: string
  /** Live site whose latest SEO audit to include. */
  siteUrl?: string
}

/** Origin + path without trailing slash, so "x.com" and "x.com/" match. */
function normalizeSiteUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`.toLowerCase()
  } catch {
    return null
  }
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function localMonthKey(date: Date): string {
  return localDayKey(date).slice(0, 7)
}

function isImageEvent(event: StatsEvent): event is ImageStatsEvent & { v: number; at: string } {
  return (
    event.type === "image" &&
    IMAGE_TOOLS.includes(event.tool) &&
    isByteCount(event.bytesIn) &&
    isByteCount(event.bytesOut)
  )
}

/**
 * Aggregates the raw log. Re-running a tool on the same original (same
 * path or name, same input size, same output kind) replaces the earlier
 * result instead of counting twice, so rewrites after a settings change or
 * a copy after a download do not inflate the totals.
 */
export function summarizeStats(
  events: StatsEvent[],
  now = new Date(),
  options: SummarizeOptions = {},
): StatsSummary {
  const dayIndex = new Map<string, number>()
  for (let index = 0; index < SERIES_DAYS; index += 1) {
    const day = new Date(now)
    day.setDate(day.getDate() - (SERIES_DAYS - 1 - index))
    dayIndex.set(localDayKey(day), index)
  }
  const emptySeries = () => new Array<number>(SERIES_DAYS).fill(0)
  const indexOfDay = (at: string) => dayIndex.get(localDayKey(new Date(at)))

  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const latestImages = new Map<string, ImageStatsEvent & { at: string }>()
  const cleanups: (CleanupStatsEvent & { at: string })[] = []
  const quotaByMonth = new Map<string, number>()
  const siteKey = options.siteUrl ? normalizeSiteUrl(options.siteUrl) : null
  let seoAudit: StatsSummary["seoAudit"] = null
  const inProject = (project: string | undefined) =>
    !options.project || project === options.project

  for (const event of sorted) {
    if (isImageEvent(event)) {
      if (!inProject(event.project)) continue
      const key = [
        event.tool,
        event.formatOut,
        event.resized ? "resized" : "full",
        event.path ?? event.name,
        event.bytesIn,
      ].join("|")
      // Delete first so the map keeps insertion order = recency.
      latestImages.delete(key)
      latestImages.set(key, event)
    } else if (event.type === "cleanup" && typeof event.project === "string") {
      if (inProject(event.project)) cleanups.push(event)
    } else if (event.type === "tinify-quota" && isByteCount(event.compressionCount)) {
      const month = localMonthKey(new Date(event.at))
      quotaByMonth.set(month, Math.max(quotaByMonth.get(month) ?? 0, event.compressionCount))
    } else if (
      event.type === "seo-audit" &&
      siteKey &&
      typeof event.url === "string" &&
      normalizeSiteUrl(event.url) === siteKey
    ) {
      seoAudit = {
        at: event.at,
        url: event.url,
        score: event.score,
        pass: event.pass,
        warn: event.warn,
        fail: event.fail,
      }
    }
  }

  const compressionGroups = new Map<string, SavingsGroup>()
  const conversionGroups = new Map<string, SavingsGroup>()
  const compression = {
    files: 0,
    bytesIn: 0,
    bytesOut: 0,
    dailySaved: emptySeries(),
    dailyFiles: emptySeries(),
  }
  const projects = new Map<string, { files: number; bytesSaved: number }>()

  for (const event of latestImages.values()) {
    if (event.resized) continue
    const isConversion = event.tool === "convert"
    const groups = isConversion ? conversionGroups : compressionGroups
    const groupKey = `${event.tool}|${event.formatIn}|${event.formatOut}`
    const group = groups.get(groupKey) ?? {
      tool: event.tool,
      formatIn: event.formatIn,
      formatOut: event.formatOut,
      files: 0,
      bytesIn: 0,
      bytesOut: 0,
      dailySaved: emptySeries(),
    }
    const saved = event.bytesIn - event.bytesOut
    const day = indexOfDay(event.at)
    group.files += 1
    group.bytesIn += event.bytesIn
    group.bytesOut += event.bytesOut
    if (day !== undefined) group.dailySaved[day] += saved
    groups.set(groupKey, group)

    if (isConversion) continue
    compression.files += 1
    compression.bytesIn += event.bytesIn
    compression.bytesOut += event.bytesOut
    if (day !== undefined) {
      compression.dailySaved[day] += saved
      compression.dailyFiles[day] += 1
    }
    if (event.project) {
      const project = projects.get(event.project) ?? { files: 0, bytesSaved: 0 }
      project.files += 1
      project.bytesSaved += saved
      projects.set(event.project, project)
    }
  }

  const bySaved = (a: SavingsGroup, b: SavingsGroup) =>
    b.bytesIn - b.bytesOut - (a.bytesIn - a.bytesOut)

  const cleanupDaily = emptySeries()
  let bytesFreed = 0
  for (const cleanup of cleanups) {
    bytesFreed += cleanup.bytesFreed ?? 0
    const day = indexOfDay(cleanup.at)
    if (day !== undefined) cleanupDaily[day] += cleanup.bytesFreed ?? 0
  }

  const currentMonth = localMonthKey(now)
  const history = Array.from({ length: QUOTA_HISTORY_MONTHS }, (_, index) => {
    const month = localMonthKey(
      new Date(now.getFullYear(), now.getMonth() - (QUOTA_HISTORY_MONTHS - 1 - index), 1),
    )
    return { month, used: quotaByMonth.get(month) ?? null }
  })

  const recent: RecentRun[] = [
    ...[...latestImages.values()].map(
      (event): RecentRun => ({
        type: "image",
        at: event.at,
        tool: event.tool,
        name: event.name,
        project: event.project,
        formatIn: event.formatIn,
        formatOut: event.formatOut,
        bytesIn: event.bytesIn,
        bytesOut: event.bytesOut,
      }),
    ),
    ...cleanups.map(
      (event): RecentRun => ({
        type: "cleanup",
        at: event.at,
        project: event.project,
        bytesFreed: event.bytesFreed,
      }),
    ),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, RECENT_RUN_COUNT)

  return {
    trackingSince: sorted[0]?.at ?? null,
    seriesDays: SERIES_DAYS,
    compression: { ...compression, groups: [...compressionGroups.values()].sort(bySaved) },
    conversion: { groups: [...conversionGroups.values()].sort(bySaved) },
    cleanup: { runs: cleanups.length, bytesFreed, daily: cleanupDaily },
    tinifyQuota: {
      month: currentMonth,
      used: quotaByMonth.get(currentMonth) ?? null,
      history,
    },
    topProjects: [...projects.entries()]
      .map(([path, project]) => ({ path, ...project }))
      .sort((a, b) => b.bytesSaved - a.bytesSaved)
      .slice(0, TOP_PROJECT_COUNT),
    recent,
    seoAudit,
  }
}
