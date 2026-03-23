const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

/**
 * Formats an ISO timestamp as a short relative label (e.g. "3 days ago").
 */
export function formatRelativeFromIso(iso: string | null): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const now = Date.now()
  let diff = (then - now) / 1000
  for (const { amount, unit } of divisions) {
    if (Math.abs(diff) < amount) {
      return formatter.format(Math.round(diff), unit)
    }
    diff /= amount
  }
  return "—"
}
