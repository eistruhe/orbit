import { Pin } from "lucide-react"
import { Outlet, useMatchRoute } from "@tanstack/react-router"
import { useEffect } from "react"

import { ContentFrame } from "@/components/orbit/content-frame"
import { TOOLS } from "@/components/orbit/tools/tool-registry"
import {
  recordToolVisit,
  toggleToolPin,
  useToolLists,
} from "@/hooks/use-tool-pins"
import { cn } from "@/lib/utils"

export function ToolsLayout() {
  const matchRoute = useMatchRoute()
  const activeTool = TOOLS.find((tool) => matchRoute({ to: tool.path }))
  const activeToolId = activeTool?.id
  const { pinned } = useToolLists()
  const activeToolPinned = activeToolId ? pinned.includes(activeToolId) : false

  useEffect(() => {
    if (activeToolId) recordToolVisit(activeToolId)
  }, [activeToolId])

  return (
    <>
      <header className="app-drag sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-sidebar/85 px-3 backdrop-blur-md">
        <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)]" aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
          Tools
        </h2>
        {activeTool ? (
          <>
            <span className="text-border-strong">/</span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-foreground">
              {activeTool.name}
            </span>
            <button
              type="button"
              onClick={() => toggleToolPin(activeTool.id)}
              aria-pressed={activeToolPinned}
              title={activeToolPinned ? "Unpin from sidebar" : "Pin to sidebar"}
              className={cn(
                "app-no-drag ml-auto flex size-6 items-center justify-center transition-colors",
                activeToolPinned
                  ? "text-highlight"
                  : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              <Pin
                className={cn("size-3.5", activeToolPinned && "fill-current")}
                aria-hidden
              />
            </button>
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

      {/* The hub grid uses the wide column; tools opt in via the registry. */}
      <ContentFrame width={activeTool ? (activeTool.width ?? "default") : "wide"}>
        <Outlet />
      </ContentFrame>
    </>
  )
}
