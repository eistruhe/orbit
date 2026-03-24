import { FileDiff, Loader2, Pencil, Pin } from "lucide-react"
import { memo } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { StatusBadge } from "@/components/orbit/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBytes } from "@/lib/format-size"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { RepoRecord } from "@/types/repo"

type QuickResumeProps = {
  repos: RepoRecord[]
  /** True while the initial or manual scan is in progress (used with repo count for UI). */
  scanLoading: boolean
  pinnedPaths: Set<string>
  onTogglePin: (path: string) => void
  onOpen: (path: string) => void
  onOpenExternal: (path: string, target: OpenTarget) => void
  onOpenRemote: (remoteUrl: string | null) => void
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
  onEditMetadata: (path: string) => void
}

function syncLabel(repo: RepoRecord): string | null {
  if (repo.aheadCount == null || repo.behindCount == null) return null
  if (repo.aheadCount === 0 && repo.behindCount === 0) return "Synced"
  return `↑${repo.aheadCount} ↓${repo.behindCount}`
}

function diskLabel(repo: RepoRecord): string | null {
  const repoSize = formatBytes(repo.workingTreeBytes)
  const nodeModulesSize = formatBytes(repo.nodeModulesBytes)
  if (!repoSize && !nodeModulesSize) return null
  if (repoSize && nodeModulesSize) {
    return `repo ${repoSize} · node_modules ${nodeModulesSize}`
  }
  if (repoSize) return `repo ${repoSize}`
  return `node_modules ${nodeModulesSize}`
}

/**
 * Grid of the most recently active repositories (quick glance).
 */
export const QuickResume = memo(function QuickResume({
  repos,
  scanLoading,
  pinnedPaths,
  onTogglePin,
  onOpen,
  onOpenExternal,
  onOpenRemote,
  repoNotes,
  repoTags,
  onEditMetadata,
}: QuickResumeProps) {
  const showLoadingPlaceholder = scanLoading && repos.length === 0
  const showEmpty = !scanLoading && repos.length === 0

  return (
    <section className="space-y-3" aria-busy={showLoadingPlaceholder}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Quick resume
        </h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Last activity
        </p>
      </div>
      {showLoadingPlaceholder ? (
        <div
          className="flex min-h-48 flex-col items-center justify-center gap-3 border border-border bg-card px-6 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium uppercase tracking-wider">
            Scanning repositories…
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Discovering git projects under your scan folder. This can take a
            moment if you have many repos.
          </p>
        </div>
      ) : null}
      {showEmpty ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-border bg-muted px-6 py-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            No projects yet
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            No git repositories were found. Adjust your scan root in config or
            use <span className="text-foreground">Scan projects</span> after
            adding repos under your Sites folder.
          </p>
        </div>
      ) : null}
      {!showLoadingPlaceholder && !showEmpty ? (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {repos.map((repo) => (
          <Card
            key={repo.path}
            size="sm"
            className={cn(
              "cursor-pointer gap-2 py-2 transition hover:bg-muted",
            )}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(repo.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen(repo.path)
              }
            }}
            aria-label={
              repo.isDirty && !repo.error
                ? `${repo.name}, has uncommitted changes`
                : undefined
            }
          >
            <CardHeader className="gap-1 border-b border-border/60 px-2.5 pb-2!">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="truncate text-sm leading-tight">
                  {repo.name}
                </CardTitle>
                <StatusBadge repo={repo} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex w-fit items-center gap-1 border border-transparent px-0 py-0 h-5 text-[10px] text-muted-foreground hover:text-black dark:hover:text-white cursor-pointer",
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePin(repo.path)
                    }}
                  >
                    <Pin
                      className={cn(
                        "size-2.5",
                        pinnedPaths.has(repo.path)
                          ? "text-highlight"
                          : "",
                      )}
                      aria-hidden
                    />
                    {pinnedPaths.has(repo.path) ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex w-fit items-center gap-1 border border-transparent px-0 py-0 h-5 text-[10px] text-muted-foreground hover:text-black dark:hover:text-white cursor-pointer",
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditMetadata(repo.path)
                    }}
                  >
                    <Pencil className="size-2.5" aria-hidden />
                    Meta
                  </button>
                </div>
                {repo.isDirty && !repo.error ? (
                  <div
                    className="flex items-center gap-1.5 border border-highlight/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground h-5"
                    role="status"
                  >
                    <FileDiff
                      className="size-3 shrink-0 text-highlight"
                      aria-hidden
                    />
                    Uncommitted changes
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-y-1 px-2.5 pt-0 h-full">
              <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {repo.lastCommitMessage ?? repo.error ?? "No commit"}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground">
                {repo.branch ? <span>{repo.branch}</span> : null}
                {repo.lastCommitShortHash ? (
                  <span>{repo.lastCommitShortHash}</span>
                ) : null}
                {repo.lastCommitAuthor ? (
                  <span className="truncate">by {repo.lastCommitAuthor}</span>
                ) : null}
              </div>
              <div className="text-[10px] text-muted-foreground">
                <span>{formatRelativeFromIso(repo.lastCommitIso)}</span>
                {syncLabel(repo) ? <span>{' · '} {syncLabel(repo)}</span> : null}
              </div>
              <div className="h-px w-full bg-border/60 my-1"></div>
              {repo.stack.length > 0 && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {repo.stack.slice(0, 3).join(" · ")}
                </p>
              )}
              {diskLabel(repo) ? (
                <p className="line-clamp-1 text-[10px] text-muted-foreground">
                  {diskLabel(repo)}
                </p>
              ) : null}
              {repoTags[repo.path]?.length ? (
                <div className="line-clamp-1 text-[10px] text-muted-foreground">
                  #{repoTags[repo.path].join(" #")}
                </div>
              ) : null}
              {repoNotes[repo.path] ? (
                <p className="line-clamp-1 text-[10px] italic text-muted-foreground">
                  {repoNotes[repo.path]}
                </p>
              ) : null}
              <div
                className="mt-auto"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex justify-end border-t border-border/60 mt-1 pt-2">
                  <OpenTargetButtons
                    path={repo.path}
                    onOpenExternal={onOpenExternal}
                    remoteUrl={repo.remoteUrl}
                    onOpenRemote={() => onOpenRemote(repo.remoteUrl)}
                    size="compact"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      ) : null}
    </section>
  )
})
