import { X } from "lucide-react"
import { useEffect } from "react"
import { createPortal } from "react-dom"

import { interactionCue } from "@/lib/sound"
import { cn } from "@/lib/utils"

type OrbitDialogProps = {
  /** Rendered as `[title]` in the mono header. */
  title: string
  tone?: "default" | "destructive"
  role?: "dialog" | "alertdialog"
  /** Optional single line shown in a bordered strip under the header. */
  subtitle?: React.ReactNode
  /** Blocks backdrop, Escape, and X close while true. */
  closeDisabled?: boolean
  maxWidthClass?: string
  labelledById?: string
  describedById?: string
  onClose: () => void
  children: React.ReactNode
}

/**
 * `open` on mount, `close` on unmount. The deferred start keeps StrictMode's
 * mount → unmount → mount in development from playing open/close/open.
 */
function useDialogCues() {
  useEffect(() => {
    let opened = false
    const timer = window.setTimeout(() => {
      opened = true
      interactionCue("open")
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (opened) interactionCue("close")
    }
  }, [])
}

/**
 * Sharp-edged mono modal shell shared by all Orbit dialogs: portal overlay,
 * blurred backdrop, bracketed header, Escape/backdrop/X close.
 */
export function OrbitDialog({
  title,
  tone = "default",
  role = "dialog",
  subtitle,
  closeDisabled = false,
  maxWidthClass = "max-w-md",
  labelledById,
  describedById,
  onClose,
  children,
}: OrbitDialogProps) {
  useDialogCues()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      if (!closeDisabled) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeDisabled, onClose])

  const overlay = (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!closeDisabled) onClose()
        }}
        aria-label="Close dialog"
      />
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledById}
        aria-describedby={describedById}
        className={cn(
          "relative z-10 w-full border border-border bg-card text-card-foreground shadow-2xl",
          maxWidthClass,
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5",
                tone === "destructive" ? "bg-destructive" : "bg-highlight",
              )}
              aria-hidden
            />
            <h3
              id={labelledById}
              className={cn(
                "text-[10px] font-medium uppercase tracking-[0.16em]",
                tone === "destructive" && "text-destructive",
              )}
            >
              [{title}]
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={closeDisabled}
          >
            <X className="size-3.5" />
          </button>
        </header>
        {subtitle ? (
          <div className="border-b border-border px-3 py-2">
            <p className="line-clamp-2 text-[11px] text-foreground/90">
              {subtitle}
            </p>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
