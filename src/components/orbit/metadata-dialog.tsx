import { useEffect, useState } from "react"

import { OrbitDialog } from "@/components/orbit/orbit-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

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

  return (
    <OrbitDialog
      title="Edit Metadata"
      subtitle={repoName}
      closeDisabled={saving}
      onClose={onClose}
    >
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
          <Textarea
            value={noteInput}
            onChange={(event) => setNoteInput(event.target.value)}
            rows={3}
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
    </OrbitDialog>
  )
}
