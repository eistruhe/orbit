import type { StatsImageTool } from "@/lib/api"
import { formatBytes } from "@/lib/format-size"

/** Shared number and label formatting for statistics views. */

export const TOOL_LABELS: Record<StatsImageTool | "cleanup", string> = {
  tinify: "Tinify",
  svgo: "SVGO",
  convert: "Convert",
  cleanup: "Cleanup",
}

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Byte size that keeps the sign, e.g. "−12 KB" when a file grew. */
export const bytes = (value: number) =>
  value < 0 ? `−${formatBytes(Math.round(-value))}` : (formatBytes(Math.round(value)) ?? "—")

export const count = (value: number) => value.toLocaleString("en-GB")

/** Relative size change, "−64%" for a smaller output. */
export const reduction = (before: number, after: number) => {
  if (before <= 0) return "—"
  const percent = Math.round((1 - after / before) * 100)
  return percent >= 0 ? `−${percent}%` : `+${-percent}%`
}

export const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path

export const formatLabel = (format: string) =>
  format === "webp" ? "WebP" : format.toUpperCase()

/** "29 Sep": day first, three-letter month (en-GB would say "Sept"). */
export function shortDate(date: Date): string {
  return `${date.getDate()} ${date.toLocaleDateString("en-US", { month: "short" })}`
}

/** Time of day for today, short date otherwise. */
export function runTime(iso: string, now: Date): string {
  const date = new Date(iso)
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : shortDate(date)
}
