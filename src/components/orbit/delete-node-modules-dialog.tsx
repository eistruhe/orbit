import { OrbitDialog } from "@/components/orbit/orbit-dialog"
import { Button } from "@/components/ui/button"
import { interactionCue } from "@/lib/sound"

type DeleteNodeModulesDialogProps = {
  open: boolean
  repoName: string
  busy: boolean
  onDismiss: () => void
  onConfirm: () => void
}

/**
 * Confirmation modal for removing a project root node_modules directory.
 */
export function DeleteNodeModulesDialog({
  open,
  repoName,
  busy,
  onDismiss,
  onConfirm,
}: DeleteNodeModulesDialogProps) {
  if (!open) return null

  return (
    <OrbitDialog
      title="Delete node_modules"
      tone="destructive"
      role="alertdialog"
      subtitle={repoName}
      closeDisabled={busy}
      labelledById="delete-node-modules-title"
      describedById="delete-node-modules-desc"
      onClose={onDismiss}
    >
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
            onClick={() => {
              interactionCue("close", { emphasis: "strong" })
              onConfirm()
            }}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete node_modules"}
          </Button>
        </div>
      </div>
    </OrbitDialog>
  )
}
