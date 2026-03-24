import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MetadataDialogProps = {
  /** When null, nothing is rendered. */
  path: string | null
  repoName: string
  /** Comma-separated tags when the dialog opens. */
  initialTags: string
  initialNote: string
  saving: boolean
  onClose: () => void
  onSave: (tagsInput: string, noteInput: string) => void | Promise<void>
}

/**
 * Isolated metadata editor so typing does not re-render the main app tree.
 */
export function MetadataDialog({
  path,
  repoName,
  initialTags,
  initialNote,
  saving,
  onClose,
  onSave,
}: MetadataDialogProps) {
  const [tagsInput, setTagsInput] = useState(initialTags)
  const [noteInput, setNoteInput] = useState(initialNote)

  useEffect(() => {
    if (!path) return
    setTagsInput(initialTags)
    setNoteInput(initialNote)
  }, [path, initialTags, initialNote])

  if (!path) return null

  const overlay = (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/70"
        onClick={onClose}
        aria-label="Close metadata dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md border border-border bg-card p-4 text-card-foreground shadow-lg"
      >
        <div className="mb-3 space-y-1 border-b border-border pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider">
            Edit metadata
          </h3>
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {repoName}
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave(tagsInput, noteInput)
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] tracking-widest text-muted-foreground uppercase">
              Tags (comma-separated)
            </label>
            <Input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="client, urgent, backend"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] tracking-widest text-muted-foreground uppercase">
              Note
            </label>
            <textarea
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              rows={4}
              className="min-h-24 w-full border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Optional project note..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save metadata"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
