import { useVirtualizer } from "@tanstack/react-virtual"
import { Pencil, Pin } from "lucide-react"
import { memo, useRef } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { StatusBadge } from "@/components/orbit/status-badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatBytes } from "@/lib/format-size"
import { syncLabel } from "@/lib/repo-facts"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { RepoRecord } from "@/types/repo"

/**
 * Five columns: actions, project, status, activity, open.
 * Status / activity / open use fixed tracks so each virtualized row (its own grid)
 * lines up with neighbors — `auto` tracks were sizing per-row and breaking alignment.
 */
const ROW_GRID_CLASS =
  "grid grid-cols-[5.5rem_minmax(0,1fr)_7rem_13rem_7rem] items-start gap-0"

type ProjectTableProps = {
  repos: RepoRecord[]
  pinnedPaths: Set<string>
  onTogglePin: (path: string) => void
  onOpen: (path: string) => void
  onOpenExternal: (path: string, target: OpenTarget) => void
  onOpenRemote: (remoteUrl: string | null) => void
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
  onEditMetadata: (path: string) => void
}

const ESTIMATE_ROW_PX = 96

/**
 * Full project listing with status and last activity.
 * Body rows are virtualized so navigating back to Projects stays responsive with large scans.
 */
export const ProjectTable = memo(function ProjectTable({
  repos,
  pinnedPaths,
  onTogglePin,
  onOpen,
  onOpenExternal,
  onOpenRemote,
  repoNotes,
  repoTags,
  onEditMetadata,
}: ProjectTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: repos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATE_ROW_PX,
    overscan: 10,
  })

  if (repos.length === 0) {
    return (
      <div className="overflow-hidden border border-border bg-card">
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No projects match the current filters.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden border border-border bg-card">
      <div
        ref={scrollRef}
        className="relative max-h-[min(72vh,calc(100svh-14rem))] w-full overflow-auto"
      >
        <div className="w-full min-w-[640px]">
          <div
            className={cn(
              ROW_GRID_CLASS,
              "sticky top-0 z-10 border-b border-border bg-card text-[11px] font-medium tracking-wider text-foreground [&>div]:px-2 [&>div]:py-2.5",
            )}
            role="row"
          >
            <div className="w-10" aria-hidden />
            <div>Project</div>
            <div className="text-left">Status</div>
            <div className="text-left">Last activity</div>
            <div className="text-right">Open</div>
          </div>

          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
            role="rowgroup"
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const repo = repos[virtualRow.index]
              const sync = syncLabel(repo)
              return (
                <div
                  key={repo.path}
                  role="row"
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    ROW_GRID_CLASS,
                    "absolute left-0 w-full cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${virtualRow.size}px`,
                  }}
                  onClick={() => onOpen(repo.path)}
                >
                  <div className="flex items-start gap-1 px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTogglePin(repo.path)
                      }}
                      aria-label={
                        pinnedPaths.has(repo.path) ? "Unpin project" : "Pin project"
                      }
                    >
                      <Pin
                        className={cn(
                          "size-4",
                          pinnedPaths.has(repo.path)
                            ? "text-highlight"
                            : "text-muted-foreground",
                        )}
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditMetadata(repo.path)
                      }}
                      aria-label="Edit metadata"
                    >
                      <Pencil className="size-4 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="min-w-0 px-2 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{repo.name}</span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground">
                        {repo.branch ? <span>{repo.branch}</span> : null}
                        {repo.lastCommitShortHash ? (
                          <span>{repo.lastCommitShortHash}</span>
                        ) : null}
                        {repo.lastCommitAuthor ? (
                          <span className="truncate">by {repo.lastCommitAuthor}</span>
                        ) : null}
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="line-clamp-1 cursor-default whitespace-normal text-left text-[11px] text-muted-foreground">
                            {repo.path}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md text-xs">
                          {repo.path}
                        </TooltipContent>
                      </Tooltip>
                      {repoTags[repo.path]?.length ? (
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">
                          #{repoTags[repo.path].join(" #")}
                        </span>
                      ) : null}
                      {repoNotes[repo.path] ? (
                        <span className="line-clamp-1 text-[10px] italic text-muted-foreground">
                          {repoNotes[repo.path]}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start justify-start px-2 py-2">
                    <StatusBadge repo={repo} className="max-w-full shrink-0" />
                  </div>

                  <div className="min-w-0 px-2 py-2 text-left text-xs text-muted-foreground">
                    <div className="flex min-w-0 flex-col gap-0.5 tabular-nums">
                      <span className="truncate text-foreground/90">
                        {formatRelativeFromIso(repo.lastCommitIso)}
                      </span>
                      {sync ? <span className="truncate">{sync}</span> : null}
                      {formatBytes(repo.workingTreeBytes) ? (
                        <span className="block truncate">
                          repo {formatBytes(repo.workingTreeBytes)}
                        </span>
                      ) : null}
                      {formatBytes(repo.nodeModulesBytes) ? (
                        <span className="block truncate">
                          node_modules {formatBytes(repo.nodeModulesBytes)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className="flex items-start justify-end px-2 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OpenTargetButtons
                      path={repo.path}
                      onOpenExternal={onOpenExternal}
                      remoteUrl={repo.remoteUrl}
                      onOpenRemote={() => onOpenRemote(repo.remoteUrl)}
                      size="compact"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})
