import { Upload } from "lucide-react"
import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

type DropZoneProps = {
  /** Primary instruction line. */
  label: string
  /** Secondary hint line, e.g. accepted formats. */
  hint?: string
  /** Passed to the hidden file input. */
  accept?: string
  multiple?: boolean
  /** Receives dropped files and files chosen via the picker. */
  onFiles: (files: FileList) => void
  /** Replaces the default upload icon, e.g. a source preview image. */
  icon?: React.ReactNode
  /**
   * Overrides the click behavior (e.g. a native path picker). Call the
   * provided fallback to open the regular file picker instead.
   */
  onClick?: (openFilePicker: () => void) => void
  /** Attach a ref to the hidden input to trigger the picker from outside. */
  inputRef?: React.RefObject<HTMLInputElement | null>
  className?: string
}

/**
 * Shared dashed drop area used by every file-based tool: drag & drop plus
 * click-to-choose, with a uniform look across the app.
 */
export function DropZone({
  label,
  hint,
  accept,
  multiple,
  onFiles,
  icon,
  onClick,
  inputRef,
  className,
}: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const internalRef = useRef<HTMLInputElement | null>(null)

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        onFiles(event.dataTransfer.files)
      }}
      onClick={
        onClick
          ? (event) => {
              event.preventDefault()
              onClick(() => internalRef.current?.click())
            }
          : undefined
      }
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-strong bg-surface-2/40 px-4 py-10 text-center transition-colors hover:bg-surface-2/70",
        dragActive && "bg-surface-2/70",
        className,
      )}
    >
      {icon ?? <Upload className="size-5 text-muted-foreground" aria-hidden />}
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {hint ? (
        <span className="text-[10px] text-muted-foreground/70">{hint}</span>
      ) : null}
      <input
        ref={(node) => {
          internalRef.current = node
          if (inputRef) inputRef.current = node
        }}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFiles(event.target.files)
          }
          event.target.value = ""
        }}
      />
    </label>
  )
}
