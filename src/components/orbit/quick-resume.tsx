import { Loader2, Pencil, Pin } from "lucide-react"
import { memo } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { StatusBadge } from "@/components/orbit/status-badge"
import { diskLabel, syncLabel } from "@/lib/repo-facts"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { RepoRecord } from "@/types/repo"
import { DotmCircular4 } from "@/components/ui/dotm-circular-4"
import { Button } from "@/components/ui/button"

type QuickResumeProps = {
  repos: RepoRecord[]
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

function SectionHeading({
  title,
  trailing,
}: {
  title: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-3.5 bg-foreground uppercase tracking-[0.16em] text-muted-foreground"></span>
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
        {title}
      </h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
      {trailing}
    </div>
  )
}

/**
 * Single fixed-height tabular row inside a project card.
 * Keeps every card visually uniform regardless of available data.
 */
function DataRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex h-4 min-w-0 items-center gap-2", className)}>
      <span className="w-12 shrink-0 text-[9px] uppercase tracking-widest text-muted-foreground/80">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/85">
        {children}
      </span>
    </div>
  )
}

const EMPTY = (
  <span className="text-muted-foreground/50">—</span>
)

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
      <SectionHeading
        title="Quick resume"
        trailing={
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            By last activity
          </span>
        }
      />
      {showLoadingPlaceholder ? (
        <div
          className="flex min-h-48 flex-col items-center justify-center gap-3 border border-border bg-card px-6 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          {/* <Loader2
            className="size-6 animate-spin text-muted-foreground"
            aria-hidden
          /> */}
          <DotmCircular4
            size={24}
            dotSize={3}
            speed={1.5}
          />
          <p className="text-[11px] font-medium uppercase tracking-[0.08em]">
            Scanning repositories…
          </p>
          <p className="max-w-md text-[11px] text-muted-foreground">
            Discovering git projects under your scan folder. This can take a
            moment if you have many repos.
          </p>
        </div>
      ) : null}
      {showEmpty ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            No projects yet
          </p>
          <p className="max-w-md text-[11px] text-muted-foreground">
            No git repositories were found. Adjust your scan root in config or
            use <span className="text-foreground">Scan projects</span> after
            adding repos under your Sites folder.
          </p>
        </div>
      ) : null}
      {!showLoadingPlaceholder && !showEmpty ? (
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3 border border-border">
          {repos.map((repo, idx) => {
            const sync = syncLabel(repo)
            const disk = diskLabel(repo)
            const tags = repoTags[repo.path] ?? []
            const note = repoNotes[repo.path]
            const isPinned = pinnedPaths.has(repo.path)
            const time = formatRelativeFromIso(repo.lastCommitIso)
            const timeLine = sync ? `${time} · ${sync}` : time
            const stackLine =
              repo.stack.length > 0 ? repo.stack.slice(0, 4).join(" · ") : null
            const tagLine = tags.length > 0 ? `#${tags.join(" #")}` : null

            return (
              <div
                key={repo.path}
                className={cn(
                  "group/card relative flex h-full cursor-pointer flex-col bg-card transition-colors hover:bg-background/90 dark:hover:bg-background/50",
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
                <div className="flex h-9 items-center justify-between gap-2 border-b border-border/60 px-3 bg-sidebar">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {repo.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge repo={repo} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className={cn(
                        "size-5 border border-border items-center justify-center transition-colors",
                        isPinned
                          ? "text-highlight hover:text-highlight/80"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label={isPinned ? "Unpin project" : "Pin project"}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTogglePin(repo.path)
                      }}
                    >
                      <Pin className="size-3" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className={cn(
                        "size-5 border border-border items-center justify-center transition-colors",
                        "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label="Edit metadata"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditMetadata(repo.path)
                      }}
                    >
                      <Pencil className="size-3" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="border-b border-border/60 px-3 py-2">
                  <p className="line-clamp-2 min-h-[2.4em] text-[11px] leading-[1.2em] text-muted-foreground">
                    {repo.lastCommitMessage ?? repo.error ?? "No commit"}
                  </p>
                </div>

                <div className="flex flex-col gap-0.5 border-b border-border/60 px-3 py-2">
                  <DataRow label="Branch">
                    {repo.branch ? (
                      <span className="text-foreground">{repo.branch}</span>
                    ) : (
                      EMPTY
                    )}
                  </DataRow>
                  <DataRow label="Author">
                    {repo.lastCommitAuthor ?? EMPTY}
                  </DataRow>
                  <DataRow label="Time">
                    <span className="tabular-nums">{timeLine || EMPTY}</span>
                  </DataRow>
                  <DataRow label="Stack">
                    {stackLine ? (
                      <span className="uppercase tracking-[0.04em]">{stackLine}</span>
                    ) : (
                      EMPTY
                    )}
                  </DataRow>
                  <DataRow label="Disk">
                    {disk ? (
                      <span className="tabular-nums">{disk}</span>
                    ) : (
                      EMPTY
                    )}
                  </DataRow>
                </div>

                <div className="flex h-7 min-w-0 items-center gap-2 px-3">
                  {tagLine || note ? (
                    <span className="min-w-0 flex-1 truncate text-[10px] leading-none">
                      {tagLine ? (
                        <span className="text-muted-foreground">
                          <span className="text-highlight">#</span>
                          {tags.join(" #")}
                        </span>
                      ) : null}
                      {tagLine && note ? (
                        <span className="text-border-strong"> · </span>
                      ) : null}
                      {note ? (
                        <span className="italic text-muted-foreground/80">{note}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex-1" aria-hidden />
                  )}
                </div>

                <div
                  className="flex h-9 items-center justify-end border-t border-border/60 px-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
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
      ) : null}
    </section>
  )
})
