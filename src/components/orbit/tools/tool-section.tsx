import { cn } from "@/lib/utils"

type ToolSectionProps = {
  title: string
  description?: string
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Bordered section with mono header used by tool pages.
 */
export function ToolSection({
  title,
  description,
  trailing,
  children,
  className,
}: ToolSectionProps) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-foreground">
            [{title}]
          </h3>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {trailing}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}
