import { cn } from "@/lib/utils"

/**
 * Building blocks of the Statistics page, after terminal-style system
 * dashboards: corner-bracketed panel tags, dotted leaders, segmented meters
 * and dot-matrix column charts.
 */

export function PanelTag({ children }: { children: React.ReactNode }) {
  const corner = "absolute size-1 border-highlight"
  return (
    <span className="relative bg-highlight/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-highlight">
      <span className={cn(corner, "top-0 left-0 border-t border-l")} aria-hidden />
      <span className={cn(corner, "top-0 right-0 border-t border-r")} aria-hidden />
      <span className={cn(corner, "bottom-0 left-0 border-b border-l")} aria-hidden />
      <span className={cn(corner, "right-0 bottom-0 border-r border-b")} aria-hidden />
      {children}
    </span>
  )
}

export function Panel({
  tag,
  trailing,
  className,
  bodyClassName,
  children,
}: {
  tag: string
  trailing?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-w-0 flex-col border border-border bg-card", className)}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3">
        <PanelTag>{tag}</PanelTag>
        {trailing ? (
          <span className="truncate text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {trailing}
          </span>
        ) : null}
      </header>
      <div className={cn("flex flex-1 flex-col p-3", bodyClassName)}>{children}</div>
    </section>
  )
}

export function Leader() {
  return (
    <span
      className="h-px min-w-3 flex-1 border-b border-dotted border-foreground/25"
      aria-hidden
    />
  )
}

export function StatRow({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: "warning" | "destructive" | "muted"
}) {
  return (
    <div className="flex items-center gap-2 py-[5px] text-[11px]">
      <span className="shrink-0 uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <Leader />
      <span
        className={cn(
          "shrink-0 tabular-nums",
          tone === "warning"
            ? "text-warning"
            : tone === "destructive"
              ? "text-destructive"
              : tone === "muted"
                ? "text-muted-foreground"
                : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Segmented meter (0–1); segments from `dangerFrom` on turn destructive. */
export function SegmentBar({
  value,
  segments = 24,
  dangerFrom,
  label,
  className,
}: {
  value: number
  segments?: number
  dangerFrom?: number
  label: string
  className?: string
}) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  const filled = Math.round(clamped * segments)
  const dangerIndex = dangerFrom == null ? Infinity : Math.floor(dangerFrom * segments)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("flex h-3 gap-[2px]", className)}
    >
      {Array.from({ length: segments }, (_, index) => {
        const danger = index >= dangerIndex
        const lit = index < filled
        return (
          <span
            key={index}
            className={cn(
              "min-w-0 flex-1",
              lit
                ? danger
                  ? "bg-destructive"
                  : "bg-highlight"
                : danger
                  ? "bg-destructive/15"
                  : "bg-foreground/10",
            )}
          />
        )
      })}
    </div>
  )
}

/** Dot-matrix column chart: one column per value, `rows` dots tall. */
export function DotColumns({
  values,
  rows = 4,
  max,
  dot = "size-[3px]",
  litClassName = "bg-highlight",
  className,
}: {
  values: number[]
  rows?: number
  max?: number
  dot?: string
  litClassName?: string | ((index: number, row: number) => string)
  className?: string
}) {
  const peak = max ?? Math.max(1, ...values)
  return (
    <div className={cn("flex items-end gap-px", className)} aria-hidden>
      {values.map((value, index) => {
        const lit = value <= 0 ? 0 : Math.min(rows, Math.max(1, Math.round((value / peak) * rows)))
        return (
          <div key={index} className="flex flex-col-reverse gap-px">
            {Array.from({ length: rows }, (_, row) => (
              <span
                key={row}
                className={cn(
                  dot,
                  row < lit
                    ? typeof litClassName === "function"
                      ? litClassName(index, row)
                      : litClassName
                    : "bg-foreground/10",
                )}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function KpiCell({
  label,
  value,
  detail,
  children,
}: {
  label: string
  value: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-1">
        <span className="text-[22px] leading-none font-medium tracking-tight tabular-nums text-foreground">
          {value}
        </span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{detail}</span>
      </div>
      <div className="mt-auto flex h-[15px] items-end">{children}</div>
    </div>
  )
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
      {children}
    </span>
  )
}

export function ToolBadge({ tool }: { tool: string }) {
  return (
    <span className="inline-flex border border-border px-1 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
      {tool}
    </span>
  )
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-[10px] leading-relaxed uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  )
}
