import { Outlet, useMatchRoute } from "@tanstack/react-router"

const TOOL_SUBTITLES = [
  { to: "/tools/tinify", label: "Tinify" },
  { to: "/tools/px-to-rem", label: "Px ↔ rem" },
  { to: "/tools/open-graph", label: "Open graph" },
] as const

export function ToolsLayout() {
  const matchRoute = useMatchRoute()
  const subtitle =
    TOOL_SUBTITLES.find((entry) => matchRoute({ to: entry.to }))?.label ?? ""

  return (
    <>
      <header className="app-drag sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-sidebar/85 px-3 backdrop-blur-md">
        <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)]" aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
          Tools
        </h2>
        {subtitle ? (
          <>
            <span className="text-border-strong">/</span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-foreground">
              {subtitle}
            </span>
          </>
        ) : (
          <>
            <span className="h-3.5 w-px bg-border" aria-hidden />
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Utilities
            </span>
          </>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-6 px-3 py-6">
        <Outlet />
      </div>
    </>
  )
}
