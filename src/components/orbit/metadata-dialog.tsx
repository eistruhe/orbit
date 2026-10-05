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
  initialLiveUrl: string
  saving: boolean
  onClose: () => void
  /** `liveUrl` is normalized (https:// added) or empty to remove it. */
  onSave: (tagsInput: string, noteInput: string, liveUrl: string) => void | Promise<void>
}

/** Adds https:// when missing; null for anything that is not an http(s) URL. */
function normalizeLiveUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return ""
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Sharp-edged mono modal for editing per-repo tags, notes and live URL.
 */
export function MetadataDialog({
  path,
  repoName,
  initialTags,
  initialNote,
  initialLiveUrl,
  saving,
  onClose,
  onSave,
}: MetadataDialogProps) {
  const [tagsInput, setTagsInput] = useState(initialTags)
  const [noteInput, setNoteInput] = useState(initialNote)
  const [liveUrlInput, setLiveUrlInput] = useState(initialLiveUrl)
  const [liveUrlError, setLiveUrlError] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    setTagsInput(initialTags)
    setNoteInput(initialNote)
    setLiveUrlInput(initialLiveUrl)
    setLiveUrlError(null)
  }, [path, initialTags, initialNote, initialLiveUrl])

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
          const liveUrl = normalizeLiveUrl(liveUrlInput)
          if (liveUrl === null) {
            setLiveUrlError("Enter a web address like www.example.com")
            return
          }
          void onSave(tagsInput, noteInput, liveUrl)
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
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Live URL <span className="text-muted-foreground/60">(for SSL and SEO on the project page)</span>
          </label>
          <Input
            value={liveUrlInput}
            onChange={(event) => {
              setLiveUrlInput(event.target.value)
              setLiveUrlError(null)
            }}
            placeholder="www.example.com"
            aria-invalid={liveUrlError ? true : undefined}
          />
          {liveUrlError ? (
            <p className="text-[10px] text-destructive">{liveUrlError}</p>
          ) : null}
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
