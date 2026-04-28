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
 * Six columns: index, actions, project, status, activity, open.
 * Status / activity / open use fixed tracks so each virtualized row (its own grid)
 * lines up with neighbors.
 */
const ROW_GRID_CLASS =
  "grid grid-cols-[3rem_4.5rem_minmax(0,1fr)_6rem_13rem_8rem] items-stretch gap-0"

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
 * Terminal-style data table with virtualized body and tabular numbers.
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
      <div className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="size-1.5 bg-muted-foreground/60" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            All projects · 0
          </span>
        </div>
        <p className="px-4 py-12 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          No projects match the current filters.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="size-1.5 bg-highlight shadow-[0_0_6px_var(--highlight)]" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            All projects
          </span>
          <span className="text-[10px] tabular-nums text-foreground">
            {repos.length}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          ↑ click row to open
        </span>
      </div>
      <div
        ref={scrollRef}
        className="relative max-h-[min(72vh,calc(100svh-18rem))] w-full overflow-auto"
      >
        <div className="w-full min-w-[760px]">
          <div
            className={cn(
              ROW_GRID_CLASS,
              "sticky top-0 z-10 border-b border-border bg-card text-[10px] uppercase tracking-[0.08em] text-muted-foreground [&>div]:flex [&>div]:items-center [&>div]:px-2 [&>div]:py-2",
            )}
            role="row"
          >
            <div>#</div>
            <div aria-hidden />
            <div>Project</div>
            <div>Status</div>
            <div>Last activity</div>
            <div className="justify-end">Open</div>
          </div>

          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
            role="rowgroup"
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const repo = repos[virtualRow.index]
              const sync = syncLabel(repo)
              const tags = repoTags[repo.path] ?? []
              const note = repoNotes[repo.path]
              const isEven = virtualRow.index % 2 === 0
              return (
                <div
                  key={repo.path}
                  role="row"
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    ROW_GRID_CLASS,
                    "absolute left-0 w-full cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/60",
                    isEven ? "bg-card" : "bg-surface-2/30",
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${virtualRow.size}px`,
                  }}
                  onClick={() => onOpen(repo.path)}
                >
                  <div className="flex items-start px-2 py-2">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {String(virtualRow.index + 1).padStart(3, "0")}
                    </span>
                  </div>

                  <div className="flex items-start gap-1 px-1 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 shrink-0"
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
                          "size-3.5",
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
                      className="size-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditMetadata(repo.path)
                      }}
                      aria-label="Edit metadata"
                    >
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="min-w-0 px-2 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-medium text-foreground">
                        {repo.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground">
                        {repo.branch ? (
                          <span className="text-foreground/70">
                            {repo.branch}
                          </span>
                        ) : null}
                        {repo.lastCommitShortHash ? (
                          <span className="tabular-nums">{repo.lastCommitShortHash}</span>
                        ) : null}
                        {repo.lastCommitAuthor ? (
                          <span className="truncate">by {repo.lastCommitAuthor}</span>
                        ) : null}
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="line-clamp-1 cursor-default text-left text-[10px] text-muted-foreground/80">
                            {repo.path}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md text-xs">
                          {repo.path}
                        </TooltipContent>
                      </Tooltip>
                      {tags.length ? (
                        <span className="line-clamp-1 text-[10px] text-muted-foreground">
                          <span className="text-highlight">#</span>
                          {tags.join(" #")}
                        </span>
                      ) : null}
                      {note ? (
                        <span className="line-clamp-1 text-[10px] italic text-muted-foreground">
                          {note}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start px-2 py-2">
                    <StatusBadge repo={repo} className="max-w-full shrink-0" />
                  </div>

                  <div className="min-w-0 px-2 py-2 text-left text-[10px] text-muted-foreground">
                    <div className="flex min-w-0 flex-col gap-0.5 tabular-nums">
                      <span className="truncate text-[11px] text-foreground/90">
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
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>
          Viewing <span className="text-foreground tabular-nums">{repos.length}</span> rows
        </span>
        <span className="font-mono">
          orbit · ready
        </span>
      </div>
    </div>
  )
})
