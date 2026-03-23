/**
 * Formats byte counts into compact human-readable units.
 */
export function formatBytes(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  if (value < 1024) return `${value} B`

  const units = ["KB", "MB", "GB", "TB"]
  let size = value / 1024
  let unitIdx = 0
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024
    unitIdx += 1
  }
  const decimals = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(decimals)} ${units[unitIdx]}`
}
