import { X } from "lucide-react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"

type DeleteNodeModulesDialogProps = {
  open: boolean
  repoName: string
  busy: boolean
  onDismiss: () => void
  onConfirm: () => void
}

/**
 * Confirmation modal for removing a project root node_modules directory.
 * Matches MetadataDialog layout and styling.
 */
export function DeleteNodeModulesDialog({
  open,
  repoName,
  busy,
  onDismiss,
  onConfirm,
}: DeleteNodeModulesDialogProps) {
  if (!open) return null

  const overlay = (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onDismiss()
        }}
        aria-label="Close dialog"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-node-modules-title"
        aria-describedby="delete-node-modules-desc"
        className="relative z-10 w-full max-w-md border border-border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="size-1.5 bg-destructive" aria-hidden />
            <h3
              id="delete-node-modules-title"
              className="text-[10px] font-medium uppercase tracking-[0.16em] text-destructive"
            >
              [Delete node_modules]
            </h3>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
          >
            <X className="size-3.5" />
          </button>
        </header>
        <div className="border-b border-border px-3 py-2">
          <p className="line-clamp-2 text-[11px] text-foreground/90">{repoName}</p>
        </div>
        <div className="space-y-3 p-3">
          <p
            id="delete-node-modules-desc"
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            Permanently delete the <code className="font-mono text-[10px] text-foreground">node_modules</code>{" "}
            folder at the project root? This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Deleting…" : "Delete node_modules"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
