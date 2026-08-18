import { Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import { BulkRunDialog } from "@/components/orbit/bulk-run-dialog"
import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { formatBytes } from "@/lib/format-size"
import { formatRelativeFromIso } from "@/lib/time"
import type { RepoRecord } from "@/types/repo"

const STALE_GRACE_DAYS = 30

function stalenessScore(repo: RepoRecord, nowEpoch: number): number {
  const bytes = repo.nodeModulesBytes ?? 0
  const ageDays = repo.lastCommitEpoch
    ? (nowEpoch - repo.lastCommitEpoch) / 86_400
    : 365
  return bytes * Math.max(ageDays - STALE_GRACE_DAYS, 0)
}

/**
 * Cleanup tool: ranks every scanned project (all libraries) by
 * node_modules size × staleness and reclaims disk via the bulk delete queue.
 */
export function CleanupPage() {
  const { allRepos, projectLibraries, doScan } = useOrbit()
  const [nowEpoch] = useState(() => Math.floor(Date.now() / 1000))
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const candidates = useMemo(
    () =>
      allRepos
        .filter((repo) => (repo.nodeModulesBytes ?? 0) > 0)
        .sort((a, b) => stalenessScore(b, nowEpoch) - stalenessScore(a, nowEpoch)),
    [allRepos, nowEpoch],
  )

  const libraryLabelById = useMemo(
    () => new Map(projectLibraries.map((library) => [library.id, library.label])),
    [projectLibraries],
  )

  const selected = useMemo(
    () => candidates.filter((repo) => !deselected.has(repo.path)),
    [candidates, deselected],
  )
  const reclaimableBytes = selected.reduce(
    (sum, repo) => sum + (repo.nodeModulesBytes ?? 0),
    0,
  )
  const totalBytes = candidates.reduce(
    (sum, repo) => sum + (repo.nodeModulesBytes ?? 0),
    0,
  )

  const toggle = (path: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const setAll = (selectAll: boolean) => {
    setDeselected(
      selectAll ? new Set() : new Set(candidates.map((repo) => repo.path)),
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="Cleanup node_modules"
        description="Every scanned project across all libraries, ranked by node_modules size × time since last commit. Deselect anything you are actively working on."
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {candidates.length} candidates · {formatBytes(totalBytes) ?? "0 B"} total
          </span>
        }
      >
        {candidates.length === 0 ? (
          <p className="border border-border bg-surface-2/40 px-3 py-8 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Nothing to clean up — no node_modules found in the last scan.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => setAll(true)}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setAll(false)}>
                Select none
              </Button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto border border-border bg-surface-2/40">
              {candidates.map((repo) => {
                const checked = !deselected.has(repo.path)
                return (
                  <div
                    key={repo.path}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-border/40 px-2.5 py-1.5 text-[11px] last:border-b-0 hover:bg-muted/40"
                    onClick={() => toggle(repo.path)}
                  >
                    <Checkbox
                      checked={checked}
                      className="pointer-events-none"
                      aria-label={`Include ${repo.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground/90">
                        {repo.name}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground/80">
                        {repo.path}
                      </span>
                    </span>
                    <span className="shrink-0 border border-border bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
                      {libraryLabelById.get(repo.orbitLibraryId) ?? repo.orbitLibraryId}
                    </span>
                    <span className="w-24 shrink-0 text-right text-[10px] text-muted-foreground">
                      {repo.lastCommitIso
                        ? formatRelativeFromIso(repo.lastCommitIso)
                        : "no commits"}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/80">
                      {formatBytes(repo.nodeModulesBytes)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-[11px] text-muted-foreground">
                <span className="tabular-nums text-foreground">{selected.length}</span>{" "}
                selected ·{" "}
                <span className="font-mono tabular-nums text-highlight">
                  {formatBytes(reclaimableBytes) ?? "0 B"}
                </span>{" "}
                reclaimable
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={selected.length === 0}
                onClick={() => setConfirming(true)}
              >
                <Sparkles className="size-3.5" />
                Reclaim disk space…
              </Button>
            </div>
          </>
        )}
      </ToolSection>

      {confirming ? (
        <BulkRunDialog
          action="delete-node-modules"
          repos={selected}
          onClose={() => setConfirming(false)}
          onFinished={(libraryIds) => {
            for (const libraryId of libraryIds) {
              void doScan(libraryId)
            }
          }}
        />
      ) : null}
    </div>
  )
}
