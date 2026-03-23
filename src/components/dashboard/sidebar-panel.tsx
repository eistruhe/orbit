import { Folder, Pin } from "lucide-react"

import { OpenTargetButtons } from "@/components/dashboard/open-target-buttons"
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
    <p className="px-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

/**
 * Left navigation: pinned, recent, and smart group counts.
 */
export function SidebarPanel({
  pinned,
  recent,
  activeThisWeek,
  stalled,
  onPick,
  onOpenExternal,
}: SidebarPanelProps) {
  return (
    <aside className="sticky top-0 z-20 flex h-svh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Folder className="size-4" aria-hidden />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider">Dashboard</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-hidden p-3">
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 bg-sidebar-accent px-2 py-1.5 text-left text-sm font-medium uppercase tracking-wider",
          )}
        >
          <Folder className="size-4 shrink-0" aria-hidden />
          Projects
        </button>

        <div className="space-y-2">
          <SectionTitle>Pinned</SectionTitle>
          <ScrollArea className="h-36">
            <ul className="space-y-1.5 pr-2">
              {pinned.length === 0 ? (
                <li className="px-2 text-xs text-muted-foreground">
                  Pin repos from the list
                </li>
              ) : (
                pinned.map((r) => (
                  <li key={r.path}>
                    <div className="flex items-start gap-1 px-1">
                      <button
                        type="button"
                        onClick={() => onPick(r.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-0 text-left text-sm hover:bg-sidebar-accent"
                      >
                        <Pin className="size-3.5 shrink-0 text-highlight" aria-hidden />
                        <span className="truncate">{r.name}</span>
                      </button>
                      <OpenTargetButtons
                        path={r.path}
                        onOpenExternal={onOpenExternal}
                        size="compact"
                        className="shrink-0 pt-0.5"
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>

        <Separator />

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
        </div>

        <Separator />

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
        </div>
      </nav>
    </aside>
  )
}
