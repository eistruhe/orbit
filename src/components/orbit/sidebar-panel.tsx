import { ChevronDown, ChevronRight, Folder, Pin, Settings, Wrench } from "lucide-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { memo, startTransition, useState } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { ThemeToggle } from "@/components/orbit/theme-toggle"
import { ScrollArea } from "@/components/ui/scroll-area"
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

function SectionLabel({
  children,
  trailing,
}: {
  children: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1">
      <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
        {children}
      </span>
      {trailing ? (
        <span className="text-[9px] tabular-nums text-muted-foreground/60">
          {trailing}
        </span>
      ) : null}
    </div>
  )
}

type NavItemProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  trailing?: React.ReactNode
}

function NavItem({ icon: Icon, label, active, onClick, trailing }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav-item app-no-drag relative flex h-9 w-full items-center gap-2.5 px-3 text-left text-[12px] font-medium transition-colors",
        active
          ? "bg-muted-foreground/7 text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {active ? (
        <span
          className="absolute inset-y-1 left-0 w-0.5 bg-highlight shadow-[0_0_6px_var(--highlight)]"
          aria-hidden
        />
      ) : null}
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-highlight" : "text-muted-foreground/70 group-hover/nav-item:text-foreground",
        )}
        aria-hidden
      />
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}

type SubNavItemProps = {
  label: string
  active: boolean
  onClick: () => void
}

function SubNavItem({ label, active, onClick }: SubNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "app-no-drag relative flex h-8 w-full items-center gap-2 pr-3 pl-9.5 text-left text-[12px] transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? (
        <span
          className="absolute top-1/2 left-[19.5px] w-0.5 h-4 -translate-x-1/2 -translate-y-1/2 bg-highlight shadow-[0_0_6px_var(--highlight)]"
          aria-hidden
        />
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * Wraps a list of SubNavItems in a vertical rail aligned to the parent
 * NavItem icon column.
 */
function SubNavRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pb-1">
      <span
        className="absolute top-0 bottom-1 left-[19px] w-px bg-border"
        aria-hidden
      />
      {children}
    </div>
  )
}

/**
 * Left navigation: sectioned nav, pinned list, theme toggle.
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const projectsActive =
    pathname === "/" || pathname.startsWith("/project/")
  const toolsActive = pathname.startsWith("/tools")
  const settingsActive = pathname.startsWith("/settings")
  const [manualToolsExpanded, setManualToolsExpanded] = useState(false)
  const toolsExpanded = toolsActive || manualToolsExpanded
  const isToolsHub = pathname === "/tools" || pathname === "/tools/"

  return (
    <aside className="sticky top-0 z-20 flex h-svh w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="app-drag relative flex h-12 items-center justify-end border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)] rounded-full" aria-hidden />
          <h1 className="text-sm font-semibold uppercase tracking-[0.16em]">
            Orbit
          </h1>
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-hidden py-2">
        <div>
          <SectionLabel>Main</SectionLabel>
          <NavItem
            icon={Folder}
            label="Projects"
            active={projectsActive}
            onClick={() =>
              startTransition(() => {
                navigate({ to: "/" })
              })
            }
          />
          <NavItem
            icon={Wrench}
            label="Tools"
            active={toolsActive}
            onClick={() =>
              startTransition(() => {
                if (!toolsActive) {
                  navigate({ to: "/tools" })
                  setManualToolsExpanded(true)
                  return
                }
                if (!isToolsHub) {
                  navigate({ to: "/tools" })
                  return
                }
                setManualToolsExpanded((current) => !current)
              })
            }
            trailing={
              toolsExpanded ? (
                <ChevronDown
                  className="size-3 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className="size-3 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              )
            }
          />
          {toolsExpanded ? (
            <SubNavRail>
              <SubNavItem
                label="Tinify"
                active={pathname === "/tools/tinify"}
                onClick={() =>
                  startTransition(() => {
                    navigate({ to: "/tools/tinify" })
                  })
                }
              />
              <SubNavItem
                label="Px ↔ rem"
                active={pathname === "/tools/px-to-rem"}
                onClick={() =>
                  startTransition(() => {
                    navigate({ to: "/tools/px-to-rem" })
                  })
                }
              />
              <SubNavItem
                label="Open graph"
                active={pathname === "/tools/open-graph"}
                onClick={() =>
                  startTransition(() => {
                    navigate({ to: "/tools/open-graph" })
                  })
                }
              />
            </SubNavRail>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <SectionLabel trailing={pinned.length > 0 ? pinned.length : undefined}>
            Library · Pinned
          </SectionLabel>
          <ScrollArea className="min-h-0 flex-1">
            <ul className="flex flex-col">
              {pinned.length === 0 ? (
                <li className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  Pin repos from the list
                </li>
              ) : (
                pinned.map((r) => (
                  <li key={r.path}>
                    <div className="group/pin flex items-center gap-1 px-1 transition-colors hover:bg-muted/60">
                      <button
                        type="button"
                        onClick={() => onPick(r.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12px]"
                      >
                        <Pin className="size-3 shrink-0 text-highlight" aria-hidden />
                        <span className="truncate text-foreground/85 group-hover/pin:text-foreground">
                          {r.name}
                        </span>
                      </button>
                      <OpenTargetButtons
                        path={r.path}
                        onOpenExternal={onOpenExternal}
                        size="compact"
                        className="shrink-0 transition-opacity"
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>

        <div className="pt-2">
          <NavItem
            icon={Settings}
            label="Settings"
            active={settingsActive}
            onClick={() =>
              startTransition(() => {
                navigate({ to: "/settings" })
              })
            }
          />
        </div>
      </nav>

      <div className="app-no-drag border-t border-border p-2">
        <ThemeToggle className="w-full" />
      </div>
    </aside>
  )
})
