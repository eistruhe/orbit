import { Download, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/format-size"

type BulkActionsToolbarProps = {
  count: number
  nodeModulesBytes: number
  onGitFetch: () => void
  onDeleteNodeModules: () => void
  onClear: () => void
}

/**
 * Floating action bar shown while table rows are selected.
 */
export function BulkActionsToolbar({
  count,
  nodeModulesBytes,
  onGitFetch,
  onDeleteNodeModules,
  onClear,
}: BulkActionsToolbarProps) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 border border-border bg-card px-3 py-2 shadow-lg">
      <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-foreground">
        <span className="size-1.5 bg-highlight shadow-[0_0_6px_var(--highlight)]" aria-hidden />
        <span className="tabular-nums">{count}</span> selected
      </span>
      {nodeModulesBytes > 0 ? (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          Σ node_modules {formatBytes(nodeModulesBytes)}
        </span>
      ) : null}
      <span className="h-3.5 w-px bg-border" aria-hidden />
      <Button type="button" variant="outline" size="sm" onClick={onGitFetch}>
        <Download className="size-3.5 text-muted-foreground" />
        Git fetch
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onDeleteNodeModules}
      >
        <Trash2 className="size-3.5" />
        Delete node_modules
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}
