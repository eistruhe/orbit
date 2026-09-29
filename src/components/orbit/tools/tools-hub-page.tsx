import { ChevronRight, Pin } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

import { SectionHeading } from "@/components/orbit/section-heading"
import { TOOL_CATEGORIES, TOOLS } from "@/components/orbit/tools/tool-registry"
import { toggleToolPin, useToolLists } from "@/hooks/use-tool-pins"
import { cn } from "@/lib/utils"

export function ToolsHubPage() {
  const navigate = useNavigate()
  const { pinned } = useToolLists()

  const groups = TOOL_CATEGORIES.map((category) => ({
    category,
    tools: TOOLS.filter((tool) => tool.category === category.id),
  })).filter((group) => group.tools.length > 0)

  const toolNumbers = new Map(
    groups
      .flatMap((group) => group.tools)
      .map((tool, index) => [tool.id, index + 1]),
  )

  return (
    <section className="space-y-8">
      {groups.map((group) => (
        <div key={group.category.id} className="space-y-3">
          <SectionHeading
            title={group.category.label}
            trailing={
              <span className="text-[10px] tabular-nums text-foreground/80">
                {group.tools.length}
              </span>
            }
          />

          <div className="cell-grid grid gap-px border border-border bg-card md:grid-cols-2 xl:grid-cols-3">
            {group.tools.map((tool) => {
              const Icon = tool.icon
              const isPinned = pinned.includes(tool.id)
              return (
                <div
                  key={tool.id}
                  className="group/tool relative transition-colors hover:bg-muted/60"
                >
                  <button
                    type="button"
                    onClick={() => navigate({ to: tool.path })}
                    className="flex h-full w-full flex-col gap-2 px-3 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {String(toolNumbers.get(tool.id)).padStart(2, "0")}
                        </span>
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-[12px] uppercase tracking-[0.06em] text-foreground">
                          {tool.name}
                        </span>
                      </div>
                      <ChevronRight
                        className="size-3.5 text-muted-foreground transition-transform group-hover/tool:translate-x-0.5"
                        aria-hidden
                      />
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {tool.description}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleToolPin(tool.id)}
                    aria-pressed={isPinned}
                    title={isPinned ? "Unpin from sidebar" : "Pin to sidebar"}
                    className={cn(
                      "absolute top-2.5 right-9 flex size-6 items-center justify-center transition-opacity",
                      isPinned
                        ? "text-highlight"
                        : "text-muted-foreground opacity-0 hover:text-foreground group-hover/tool:opacity-100",
                    )}
                  >
                    <Pin
                      className={cn("size-3.5", isPinned && "fill-current")}
                      aria-hidden
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
