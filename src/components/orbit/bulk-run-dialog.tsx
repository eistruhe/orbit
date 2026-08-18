import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { OrbitDialog } from "@/components/orbit/orbit-dialog"
import { Button } from "@/components/ui/button"
import { useBulkQueue, type BulkItemState } from "@/hooks/use-bulk-queue"
import { deleteRepoNodeModules, gitFetchRepo } from "@/lib/api"
import { formatBytes } from "@/lib/format-size"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

export type BulkAction = "git-fetch" | "delete-node-modules"

const ACTION_META: Record<
  BulkAction,
  { title: string; runLabel: string; destructive: boolean }
> = {
  "git-fetch": { title: "Bulk Git Fetch", runLabel: "Fetch all", destructive: false },
  "delete-node-modules": {
    title: "Bulk Delete node_modules",
    runLabel: "Delete all",
    destructive: true,
  },
}

function StatusIcon({ state }: { state: BulkItemState | undefined }) {
  switch (state?.status) {
    case "working":
      return <Loader2 className="size-3.5 animate-spin text-foreground" aria-hidden />
    case "done":
      return <CheckCircle2 className="size-3.5 text-success" aria-hidden />
    case "error":
      return <XCircle className="size-3.5 text-destructive" aria-hidden />
    default:
      return <Circle className="size-3.5 text-muted-foreground/50" aria-hidden />
  }
}

type BulkRunDialogProps = {
  action: BulkAction
  repos: RepoRecord[]
  onClose: () => void
  /** Called once after a finished run, with the affected library ids. */
  onFinished: (libraryIds: string[]) => void
}

/**
 * Reviews the selected repos, runs the action through a concurrency-limited
 * queue with per-row status, and reports a summary.
 */
export function BulkRunDialog({
  action,
  repos,
  onClose,
  onFinished,
}: BulkRunDialogProps) {
  const meta = ACTION_META[action]
  const { states, running, run } = useBulkQueue()
  const [started, setStarted] = useState(false)
  const finished = started && !running

  const totalBytes = useMemo(
    () =>
      action === "delete-node-modules"
        ? repos.reduce((sum, repo) => sum + (repo.nodeModulesBytes ?? 0), 0)
        : 0,
    [action, repos],
  )

  useEffect(() => {
    if (!finished) return
    onFinished([...new Set(repos.map((repo) => repo.orbitLibraryId))])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  const handleRun = () => {
    setStarted(true)
    void run(
      repos.map((repo) => repo.path),
      async (path) => {
        if (action === "git-fetch") {
          await gitFetchRepo(path)
        } else {
          await deleteRepoNodeModules(path)
        }
      },
    )
  }

  const doneCount = [...states.values()].filter((s) => s.status === "done").length
  const errorCount = [...states.values()].filter((s) => s.status === "error").length

  return (
    <OrbitDialog
      title={meta.title}
      tone={meta.destructive ? "destructive" : "default"}
      role={meta.destructive ? "alertdialog" : "dialog"}
      closeDisabled={running}
      maxWidthClass="max-w-lg"
      onClose={onClose}
    >
      <div className="space-y-3 p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {action === "git-fetch"
            ? `Run git fetch in ${repos.length} ${repos.length === 1 ? "repository" : "repositories"}.`
            : `Permanently delete node_modules in ${repos.length} ${repos.length === 1 ? "project" : "projects"}${
                totalBytes > 0 ? `, reclaiming about ${formatBytes(totalBytes)}` : ""
              }. This cannot be undone.`}
        </p>

        <div className="max-h-64 overflow-y-auto border border-border bg-surface-2/40">
          {repos.map((repo) => {
            const state = states.get(repo.path)
            return (
              <div
                key={repo.path}
                className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5 text-[11px] last:border-b-0"
              >
                <StatusIcon state={state} />
                <span className="min-w-0 flex-1 truncate text-foreground/90">
                  {repo.name}
                </span>
                {action === "delete-node-modules" &&
                repo.nodeModulesBytes != null ? (
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatBytes(repo.nodeModulesBytes)}
                  </span>
                ) : null}
                {state?.error ? (
                  <span
                    className="max-w-48 truncate text-[10px] text-destructive"
                    title={state.error}
                  >
                    {state.error}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {finished ? (
          <p
            className={cn(
              "border px-2.5 py-1.5 text-[11px]",
              errorCount > 0
                ? "border-destructive/35 bg-destructive/5 text-destructive"
                : "border-highlight/35 bg-highlight/10 text-foreground",
            )}
            role="status"
          >
            {doneCount} succeeded
            {errorCount > 0 ? `, ${errorCount} failed` : ""}.
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={running}
          >
            {finished ? "Close" : "Cancel"}
          </Button>
          {!started ? (
            <Button
              type="button"
              variant={meta.destructive ? "destructive" : "highlight"}
              size="sm"
              onClick={handleRun}
              disabled={repos.length === 0}
            >
              {meta.runLabel}
            </Button>
          ) : running ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <Loader2 className="size-3.5 animate-spin" />
              Running… ({doneCount + errorCount}/{repos.length})
            </Button>
          ) : null}
        </div>
      </div>
    </OrbitDialog>
  )
}
