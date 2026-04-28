import { ChevronDown, ChevronRight, Folder, Settings, Wrench } from "lucide-react"
import { memo, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { RepoRecord } from "@/types/repo"

type SidebarPanelProps = {
  pinned: RepoRecord[]
  recent: RepoRecord[]
  activeThisWeek: number
  stalled: number
  onPick: (path: string) => void
  onOpenExternal: (path: string, target: OpenTarget) => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

/**
 * Left navigation: pinned, recent, and smart group counts.
 */
export const SidebarPanel = memo(function SidebarPanel({
  pinned,
  // recent,
  // activeThisWeek,
  // stalled,
  onPick,
  onOpenExternal,
}: SidebarPanelProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const projectsActive =
    location.pathname === "/" || location.pathname.startsWith("/project/")
  const toolsActive = location.pathname.startsWith("/tools")
  const settingsActive = location.pathname.startsWith("/settings")
  const [toolsExpanded, setToolsExpanded] = useState(toolsActive)

  useEffect(() => {
    if (toolsActive) {
      setToolsExpanded(true)
    }
  }, [toolsActive])

  return (
    <aside className="sticky top-0 z-20 flex h-svh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="app-drag h-12 border-b border-border flex items-center justify-end pr-3">
        <h1 className="text-2xl font-semibold uppercase">
          Orbit
        </h1>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-hidden p-3">
        <div className="flex flex-col gap-y-1">
          <button
            type="button"
            onClick={() => navigate("/")}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-left text-sm font-medium uppercase tracking-wider",
              projectsActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
            )}
          >
            <Folder className="size-4 shrink-0" aria-hidden />
            Projects
          </button>
          <button
            type="button"
            onClick={() => {
              if (!toolsActive) {
                navigate("/tools")
                setToolsExpanded(true)
                return
              }
              setToolsExpanded((current) => !current)
            }}
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-left text-sm font-medium uppercase tracking-wider hover:bg-sidebar-accent",
              toolsActive ? "bg-sidebar-accent" : "",
            )}
          >
            <span className="flex items-center gap-2">
              <Wrench className="size-4 shrink-0" aria-hidden />
              Tools
            </span>
            {toolsExpanded ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            )}
          </button>
          {toolsExpanded ? (
            <button
              type="button"
              onClick={() => navigate("/tools/tinify")}
              className={cn(
                "ml-6 flex items-center gap-2 px-2 py-1.5 text-left text-sm",
                location.pathname === "/tools/tinify"
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent",
              )}
            >
              Tinify
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 text-left text-sm font-medium uppercase tracking-wider hover:bg-sidebar-accent",
              settingsActive ? "bg-sidebar-accent" : "",
            )}
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
          </button>
        </div>

        <Separator />

        <div className="space-y-2">
          <SectionTitle>Pinned</SectionTitle>
          <ScrollArea className="h-36">
            <ul className="flex flex-col gap-2">
              {pinned.length === 0 ? (
                <li className="px-2 text-xs text-muted-foreground">
                  Pin repos from the list
                </li>
              ) : (
                pinned.map((r) => (
                  <li key={r.path}>
                    <div className="flex items-center gap-1 hover:bg-sidebar-accent">
                      <button
                        type="button"
                        onClick={() => onPick(r.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                      >
                        <span className="truncate">{r.name}</span>
                      </button>
                      <OpenTargetButtons
                        path={r.path}
                        onOpenExternal={onOpenExternal}
                        size="compact"
                        className="shrink-0"
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>

        {/* <Separator />

        <div className="space-y-2">
          <SectionTitle>Recent</SectionTitle>
          <ScrollArea className="h-36">
            <ul className="space-y-0.5 pr-2">
              {recent.length === 0 ? (
                <li className="px-2 text-xs text-muted-foreground">
                  Opens when you select a project
                </li>
              ) : (
                recent.map((r) => (
                  <li key={r.path}>
                    <button
                      type="button"
                      onClick={() => onPick(r.path)}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-sidebar-accent"
                    >
                      <span className="truncate">{r.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div> */}

        {/* <Separator />

        <div className="space-y-2">
          <SectionTitle>Smart groups</SectionTitle>
          <ul className="space-y-1 text-xs">
            <li className="flex justify-between px-2 py-1">
              <span>Active this week</span>
              <span className="text-muted-foreground">{activeThisWeek}</span>
            </li>
            <li className="flex justify-between px-2 py-1">
              <span>Stalled</span>
              <span className="text-muted-foreground">{stalled}</span>
            </li>
          </ul>
        </div> */}
      </nav>
    </aside>
  )
})
