import cronstrue from "cronstrue"
import { Check, Clipboard } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"

const TIME_ZONES = [
  { id: "local", label: "Local", timeZone: undefined },
  { id: "utc", label: "UTC", timeZone: "UTC" },
  { id: "berlin", label: "Europe/Berlin", timeZone: "Europe/Berlin" },
  { id: "newyork", label: "America/New_York", timeZone: "America/New_York" },
  { id: "la", label: "America/Los_Angeles", timeZone: "America/Los_Angeles" },
  { id: "tokyo", label: "Asia/Tokyo", timeZone: "Asia/Tokyo" },
]

function formatInZone(ms: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).format(new Date(ms))
}

function relativeTime(ms: number): string {
  const diffSeconds = Math.round((ms - Date.now()) / 1000)
  const abs = Math.abs(diffSeconds)
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (abs < 60) return format.format(diffSeconds, "second")
  if (abs < 3600) return format.format(Math.round(diffSeconds / 60), "minute")
  if (abs < 86400) return format.format(Math.round(diffSeconds / 3600), "hour")
  if (abs < 86400 * 30)
    return format.format(Math.round(diffSeconds / 86400), "day")
  if (abs < 86400 * 365)
    return format.format(Math.round(diffSeconds / (86400 * 30)), "month")
  return format.format(Math.round(diffSeconds / (86400 * 365)), "year")
}

// --- Cron parsing -----------------------------------------------------------

const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

type CronSpec = {
  minutes: Set<number>
  hours: Set<number>
  dom: Set<number>
  months: Set<number>
  dow: Set<number>
  domStar: boolean
  dowStar: boolean
}

function resolveValue(
  raw: string,
  names: Record<string, number> | null,
): number | null {
  const lower = raw.toLowerCase()
  if (names && lower in names) return names[lower]
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

function parseCronField(
  text: string,
  min: number,
  max: number,
  names: Record<string, number> | null,
): Set<number> | null {
  const set = new Set<number>()
  for (const part of text.split(",")) {
    if (!part) return null
    const [rangeText, stepText, ...rest] = part.split("/")
    if (rest.length > 0) return null
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return null
    let start: number
    let end: number
    if (rangeText === "*") {
      start = min
      end = max
    } else {
      const bounds = rangeText.split("-")
      if (bounds.length > 2) return null
      const from = resolveValue(bounds[0], names)
      if (from === null) return null
      const to = bounds.length === 2 ? resolveValue(bounds[1], names) : from
      if (to === null) return null
      start = from
      end = bounds.length === 2 ? to : stepText !== undefined ? max : from
      if (start > end) return null
    }
    if (start < min || end > max + (names === DOW_NAMES ? 1 : 0)) return null
    for (let value = start; value <= end; value += step) {
      // Cron allows 7 for Sunday in the day-of-week field.
      set.add(names === DOW_NAMES && value === 7 ? 0 : value)
    }
  }
  return set.size > 0 ? set : null
}

function parseCron(expression: string): CronSpec | null {
  const normalized =
    CRON_MACROS[expression.trim().toLowerCase()] ?? expression.trim()
  const fields = normalized.split(/\s+/)
  if (fields.length !== 5) return null
  const minutes = parseCronField(fields[0], 0, 59, null)
  const hours = parseCronField(fields[1], 0, 23, null)
  const dom = parseCronField(fields[2], 1, 31, null)
  const months = parseCronField(fields[3], 1, 12, MONTH_NAMES)
  const dow = parseCronField(fields[4], 0, 6, DOW_NAMES)
  if (!minutes || !hours || !dom || !months || !dow) return null
  return {
    minutes,
    hours,
    dom,
    months,
    dow,
    domStar: fields[2] === "*",
    dowStar: fields[4] === "*",
  }
}

function dayMatches(spec: CronSpec, day: Date): boolean {
  if (!spec.months.has(day.getMonth() + 1)) return false
  const domHit = spec.dom.has(day.getDate())
  const dowHit = spec.dow.has(day.getDay())
  // Standard cron: if both fields are restricted, either one matching counts.
  if (!spec.domStar && !spec.dowStar) return domHit || dowHit
  if (!spec.domStar) return domHit
  if (!spec.dowStar) return dowHit
  return true
}

function nextRuns(spec: CronSpec, count: number): Date[] {
  const results: Date[] = []
  const start = new Date()
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)
  const limit = new Date(start)
  limit.setFullYear(limit.getFullYear() + 4)
  const hours = [...spec.hours].sort((a, b) => a - b)
  const minutes = [...spec.minutes].sort((a, b) => a - b)

  const day = new Date(start)
  day.setHours(0, 0, 0, 0)
  while (day <= limit && results.length < count) {
    if (dayMatches(spec, day)) {
      for (const hour of hours) {
        for (const minute of minutes) {
          const candidate = new Date(day)
          candidate.setHours(hour, minute, 0, 0)
          if (candidate >= start) {
            results.push(candidate)
            if (results.length >= count) return results
          }
        }
      }
    }
    day.setDate(day.getDate() + 1)
  }
  return results
}

// ---------------------------------------------------------------------------

/**
 * Timestamp converter (Unix ↔ ISO ↔ time zones) and cron expression
 * explainer with the next scheduled runs. Fully client-side.
 */
export function TimePage() {
  const [tab, setTab] = useState<"timestamp" | "cron">("timestamp")

  // Canonical value is `ms`; each input keeps its own draft string so typing
  // never fights reformatting.
  const [ms, setMs] = useState<number>(() => Date.now())
  const [unixSeconds, setUnixSeconds] = useState(() =>
    String(Math.floor(Date.now() / 1000)),
  )
  const [unixMs, setUnixMs] = useState(() => String(Date.now()))
  const [iso, setIso] = useState(() => new Date().toISOString())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [cronInput, setCronInput] = useState("*/15 9-17 * * 1-5")

  const applyMs = (
    nextMs: number,
    source: "seconds" | "ms" | "iso" | null,
  ) => {
    setMs(nextMs)
    if (source !== "seconds") setUnixSeconds(String(Math.floor(nextMs / 1000)))
    if (source !== "ms") setUnixMs(String(nextMs))
    if (source !== "iso") setIso(new Date(nextMs).toISOString())
  }

  const copy = (id: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedId(id)
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1200,
      )
    })
  }

  const cron = useMemo(() => {
    const trimmed = cronInput.trim()
    if (!trimmed) return null
    const spec = parseCron(trimmed)
    if (!spec) return { error: "Invalid cron expression (5 fields expected)." }
    let description: string
    try {
      description = cronstrue.toString(trimmed, { use24HourTimeFormat: true })
    } catch {
      description = ""
    }
    return { spec, description, runs: nextRuns(spec, 5) }
  }, [cronInput])

  const timestampFields = [
    {
      id: "seconds",
      label: "Unix seconds",
      value: unixSeconds,
      onChange: (value: string) => {
        setUnixSeconds(value)
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed) && value.trim() !== "") {
          applyMs(Math.floor(parsed * 1000), "seconds")
        }
      },
    },
    {
      id: "ms",
      label: "Unix milliseconds",
      value: unixMs,
      onChange: (value: string) => {
        setUnixMs(value)
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed) && value.trim() !== "") {
          applyMs(Math.floor(parsed), "ms")
        }
      },
    },
    {
      id: "iso",
      label: "ISO 8601",
      value: iso,
      onChange: (value: string) => {
        setIso(value)
        const parsed = Date.parse(value.trim())
        if (!Number.isNaN(parsed)) applyMs(parsed, "iso")
      },
    },
  ]

  return (
    <div className="space-y-4">
      <ToolSection
        title="Timestamp & cron"
        description="Convert between Unix timestamps, ISO 8601, and time zones — or explain a cron expression."
        trailing={
          <SegmentedControl
            options={[
              { value: "timestamp", label: "Timestamp" },
              { value: "cron", label: "Cron" },
            ]}
            value={tab}
            onValueChange={setTab}
          />
        }
      >
        {tab === "timestamp" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              {timestampFields.map((field) => (
                <label key={field.id} className="flex min-w-44 flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {field.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="font-mono"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${field.label}`}
                      onClick={() => copy(field.id, field.value)}
                    >
                      {copiedId === field.id ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Clipboard className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </label>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => applyMs(Date.now(), null)}
              >
                Now
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {relativeTime(ms)}
            </p>

            <div className="divide-y divide-border/60 border border-border">
              {TIME_ZONES.map((zone) => (
                <div
                  key={zone.id}
                  className="flex items-center gap-3 px-2.5 py-1.5"
                >
                  <span className="w-44 shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {zone.label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-foreground">
                    {formatInZone(ms, zone.timeZone)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex max-w-md flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Expression{" "}
                <span className="normal-case text-muted-foreground/60">
                  (minute hour day month weekday — or @daily, @hourly, …)
                </span>
              </span>
              <Input
                value={cronInput}
                onChange={(event) => setCronInput(event.target.value)}
                placeholder="*/15 9-17 * * 1-5"
                className="font-mono"
                spellCheck={false}
              />
            </label>

            {cron && "error" in cron ? (
              <p className="text-[11px] text-destructive">{cron.error}</p>
            ) : cron ? (
              <>
                {cron.description ? (
                  <p className="border border-border bg-surface-2/40 px-2.5 py-2 text-[11px] text-foreground">
                    {cron.description}
                  </p>
                ) : null}
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Next runs
                  </p>
                  {cron.runs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No runs within the next 4 years.
                    </p>
                  ) : (
                    <div className="divide-y divide-border/60 border border-border">
                      {cron.runs.map((run) => (
                        <div
                          key={run.getTime()}
                          className="flex items-center gap-3 px-2.5 py-1.5"
                        >
                          <span className="font-mono text-[11px] tabular-nums text-foreground">
                            {formatInZone(run.getTime(), undefined)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {relativeTime(run.getTime())}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </ToolSection>
    </div>
  )
}
