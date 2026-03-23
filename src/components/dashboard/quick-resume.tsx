import { FileDiff, Loader2, Pin } from "lucide-react"

import { OpenTargetButtons } from "@/components/dashboard/open-target-buttons"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}

/**
 * Grid of the most recently active repositories (quick glance).
 */
export function QuickResume({
  repos,
  scanLoading,
  pinnedPaths,
  onTogglePin,
  onOpen,
  onOpenExternal,
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
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {repos.map((repo) => (
          <Card
            key={repo.path}
            size="sm"
            className={cn(
              "cursor-pointer transition hover:bg-muted/50",
              repo.isDirty &&
                !repo.error &&
                "border-l-4 border-l-highlight bg-highlight/[0.07]",
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
            <CardHeader className="gap-2 border-b border-border/60 pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="truncate text-sm">{repo.name}</CardTitle>
                <StatusBadge repo={repo} />
              </div>
              {repo.isDirty && !repo.error ? (
                <div
                  className="flex items-center gap-2 border border-highlight/50 bg-highlight/15 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground"
                  role="status"
                >
                  <FileDiff
                    className="size-4 shrink-0 text-highlight"
                    aria-hidden
                  />
                  Uncommitted changes
                </div>
              ) : null}
              <button
                type="button"
                className={cn(
                  "inline-flex w-fit items-center gap-1 border border-transparent px-1 py-0.5 text-[10px] text-muted-foreground hover:border-border",
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin(repo.path)
                }}
              >
                <Pin
                  className={cn(
                    "size-3",
                    pinnedPaths.has(repo.path)
                      ? "text-highlight"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                {pinnedPaths.has(repo.path) ? "Pinned" : "Pin"}
              </button>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {repo.lastCommitMessage ?? repo.error ?? "No commit"}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{formatRelativeFromIso(repo.lastCommitIso)}</span>
                {repo.stack.length > 0 && (
                  <span className="truncate">{repo.stack.slice(0, 3).join(" · ")}</span>
                )}
              </div>
              <div
                className="border-t border-border/60 pt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
                    Open
                  </span>
                  <OpenTargetButtons
                    path={repo.path}
                    onOpenExternal={onOpenExternal}
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
}
