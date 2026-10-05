import { Activity, ChartNoAxesColumn, ChevronDown, ChevronRight, Folder, Pin, Search, Settings, Wrench } from "lucide-react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { memo, startTransition, useMemo, useState } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { ThemeToggle } from "@/components/orbit/theme-toggle"
import { TOOLS, type ToolMeta } from "@/components/orbit/tools/tool-registry"
import { useToolLists } from "@/hooks/use-tool-pins"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { ProjectLibrary, RepoRecord } from "@/types/repo"
import { interactionCue } from "@/lib/sound"

type SidebarPanelProps = {
  projectLibraries: ProjectLibrary[]
  activeLibraryId: string
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
  icon?: React.ComponentType<{ className?: string }>
  trailing?: React.ReactNode
}

function SubNavItem({ label, active, onClick, icon: Icon, trailing }: SubNavItemProps) {
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
      {Icon ? (
        <Icon
          className={cn(
            "size-3 shrink-0",
            active ? "text-highlight" : "text-muted-foreground/60",
          )}
          aria-hidden
        />
      ) : null}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}

/** `h-8` sub-rows and `h-6` section labels; heights feed the indicator math. */
const TOOLS_SUB_NAV_ROW_PX = 32
const TOOLS_SUB_NAV_LABEL_PX = 24
const TOOLS_SUB_NAV_ROW_CENTER_PX = TOOLS_SUB_NAV_ROW_PX / 2

/** Rows rendered inside the tools sub-nav rail. */
type ToolRailRow =
  | { kind: "label"; text: string }
  | { kind: "tool"; tool: ToolMeta; pinned: boolean }
  | { kind: "all" }

/**
 * Wraps a list of SubNavItems in a vertical rail aligned to the parent
 * NavItem icon column. `indicatorTop` is the active row's center in px
 * from the top of the rail, or null when no row is active.
 */
function SubNavRail({
  children,
  indicatorTop: activeTop,
}: {
  children: React.ReactNode
  indicatorTop: number | null
}) {
  const [lastTop, setLastTop] = useState(TOOLS_SUB_NAV_ROW_CENTER_PX)
  if (activeTop != null && activeTop !== lastTop) {
    setLastTop(activeTop)
  }
  const indicatorTop = activeTop ?? lastTop
  const indicatorVisible = activeTop != null

  return (
    <div className="relative pb-1">
      <span
        className="absolute top-0 bottom-1 left-[19px] w-px bg-border"
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute left-[19.5px] w-0.5 h-4 -translate-x-1/2 -translate-y-1/2 bg-highlight shadow-[0_0_6px_var(--highlight)] transition-[top,opacity] duration-200 ease-out",
          indicatorVisible ? "opacity-100" : "opacity-0",
        )}
        style={{ top: indicatorTop }}
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
  projectLibraries,
  activeLibraryId,
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
    pathname === "/" ||
    pathname.startsWith("/project/") ||
    pathname.startsWith("/projects/lib/")
  const primaryProjectsActive = projectsActive && activeLibraryId === "primary"
  const primaryLibrary = projectLibraries.find((library) => library.id === "primary")
  const additionalLibraries = projectLibraries.filter(
    (library) => library.id !== "primary",
  )
  const toolsActive = pathname.startsWith("/tools")
  const portsActive = pathname.startsWith("/ports")
  const searchActive = pathname.startsWith("/search")
  const statsActive = pathname.startsWith("/stats")
  const settingsActive = pathname.startsWith("/settings")
  const [manualToolsExpanded, setManualToolsExpanded] = useState(false)
  const toolsExpanded = toolsActive || manualToolsExpanded
  const isToolsHub = pathname === "/tools" || pathname === "/tools/"

  const { pinned: pinnedToolIds, recent: recentToolIds } = useToolLists()
  const toolRailRows = useMemo<ToolRailRow[]>(() => {
    const byId = new Map(TOOLS.map((tool) => [tool.id, tool]))
    const pinnedTools = pinnedToolIds
      .map((id) => byId.get(id))
      .filter((tool): tool is ToolMeta => Boolean(tool))
    const recentTools = recentToolIds
      .filter((id) => !pinnedToolIds.includes(id))
      .map((id) => byId.get(id))
      .filter((tool): tool is ToolMeta => Boolean(tool))
      .slice(0, 4)

    const rows: ToolRailRow[] = []
    if (pinnedTools.length > 0) {
      rows.push({ kind: "label", text: "Pinned" })
      for (const tool of pinnedTools) rows.push({ kind: "tool", tool, pinned: true })
    }
    if (recentTools.length > 0) {
      rows.push({ kind: "label", text: "Recent" })
      for (const tool of recentTools) rows.push({ kind: "tool", tool, pinned: false })
    }
    rows.push({ kind: "all" })
    return rows
  }, [pinnedToolIds, recentToolIds])

  let toolRailIndicatorTop: number | null = null
  {
    let y = 0
    for (const row of toolRailRows) {
      const height =
        row.kind === "label" ? TOOLS_SUB_NAV_LABEL_PX : TOOLS_SUB_NAV_ROW_PX
      const rowActive =
        row.kind === "tool" ? pathname === row.tool.path : row.kind === "all" && isToolsHub
      if (rowActive) toolRailIndicatorTop = y + height / 2
      y += height
    }
  }

  return (
    <aside className="sticky top-0 z-20 flex h-svh w-60 shrink-0 flex-col overflow-hidden border-r border-border text-sidebar-foreground surface-chrome">
      <div className="app-drag relative flex h-12 items-center justify-end border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)] rounded-full" aria-hidden />
          <h1 className="text-sm font-semibold uppercase tracking-[0.16em]">
            Orbit
          </h1>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Everything above Settings scrolls as one column, so a tall nav
            (tools expanded, many pins) stays reachable on short windows. */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="pt-2">
            <SectionLabel>Main</SectionLabel>
            <NavItem
              icon={Folder}
              label={primaryLibrary?.label || "Projects"}
              active={primaryProjectsActive}
              onClick={() =>
                startTransition(() => {
                  navigate({ to: "/" })
                })
              }
            />
            {additionalLibraries.map((library) => (
              <NavItem
                key={library.id}
                icon={Folder}
                label={library.label}
                active={activeLibraryId === library.id && projectsActive}
                onClick={() =>
                  startTransition(() => {
                    navigate({
                      to: "/projects/lib/$libraryId",
                      params: { libraryId: library.id },
                    })
                  })
                }
              />
            ))}
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
                  interactionCue(toolsExpanded ? "close" : "open", { emphasis: "subtle" })
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
              <SubNavRail indicatorTop={toolRailIndicatorTop}>
                {toolRailRows.map((row) => {
                  if (row.kind === "label") {
                    return (
                      <div
                        key={`label-${row.text}`}
                        className="flex h-6 items-center pl-9.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60"
                      >
                        {row.text}
                      </div>
                    )
                  }
                  if (row.kind === "all") {
                    return (
                      <SubNavItem
                        key="all-tools"
                        label="All tools"
                        active={isToolsHub}
                        onClick={() =>
                          startTransition(() => {
                            navigate({ to: "/tools" })
                          })
                        }
                        trailing={
                          <span className="text-[10px] tabular-nums text-muted-foreground/60">
                            {TOOLS.length}
                          </span>
                        }
                      />
                    )
                  }
                  return (
                    <SubNavItem
                      key={row.tool.id}
                      label={row.tool.name}
                      icon={row.pinned ? Pin : undefined}
                      active={pathname === row.tool.path}
                      onClick={() =>
                        startTransition(() => {
                          navigate({ to: row.tool.path })
                        })
                      }
                    />
                  )
                })}
              </SubNavRail>
            ) : null}
            <NavItem
              icon={Search}
              label="Search"
              active={searchActive}
              onClick={() =>
                startTransition(() => {
                  navigate({ to: "/search" })
                })
              }
            />
            <NavItem
              icon={Activity}
              label="Ports"
              active={portsActive}
              onClick={() =>
                startTransition(() => {
                  navigate({ to: "/ports" })
                })
              }
            />
            <NavItem
              icon={ChartNoAxesColumn}
              label="Statistics"
              active={statsActive}
              onClick={() =>
                startTransition(() => {
                  navigate({ to: "/stats" })
                })
              }
            />
          </div>

          <div className="pt-2">
            <SectionLabel trailing={pinned.length > 0 ? pinned.length : undefined}>
              Library · Pinned
            </SectionLabel>
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
          </div>
        </ScrollArea>

        <div className="py-2">
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
