import { cn } from "@/lib/utils"

export type ContentWidth = "default" | "wide"

type ContentFrameProps = {
  /**
   * `default` suits forms and single-column tools; `wide` is for tables and
   * side-by-side views. Alignment (centered / left / full) is a global
   * appearance setting applied via `html[data-layout]` in index.css.
   */
  width?: ContentWidth
  children: React.ReactNode
  className?: string
}

/**
 * Shared content column for every layout below the sticky page header, so
 * all views share the same widths, gutters, and alignment.
 */
export function ContentFrame({
  width = "default",
  children,
  className,
}: ContentFrameProps) {
  return (
    <div
      data-width={width}
      className={cn("content-frame flex flex-1 flex-col gap-6 px-3 py-6", className)}
    >
      {children}
    </div>
  )
}
