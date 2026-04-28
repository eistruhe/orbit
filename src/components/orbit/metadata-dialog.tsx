import { X } from "lucide-react"
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
 * Sharp-edged mono modal for editing per-repo tags and notes.
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
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close metadata dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md border border-border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="size-1.5 bg-highlight" aria-hidden />
            <h3 className="text-[10px] font-medium uppercase tracking-[0.16em]">
              [Edit Metadata]
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
            disabled={saving}
          >
            <X className="size-3.5" />
          </button>
        </header>
        <div className="border-b border-border px-3 py-2">
          <p className="line-clamp-1 text-[11px] text-foreground/90">
            {repoName}
          </p>
        </div>
        <form
          className="space-y-3 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave(tagsInput, noteInput)
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Tags <span className="text-muted-foreground/60">(comma-separated)</span>
            </label>
            <Input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="client, urgent, backend"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Note
            </label>
            <textarea
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              rows={3}
              className="block w-full border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground/20 dark:bg-input/15"
              placeholder="Optional project note..."
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="highlight" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save metadata"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
