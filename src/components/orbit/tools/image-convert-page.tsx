import { Check, Clipboard, Download, HardDriveDownload, Loader2 } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { DropZone } from "@/components/orbit/drop-zone"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { writeDerivedFile } from "@/lib/api"
import { formatBytes } from "@/lib/format-size"
import {
  type OutputFormat,
  blobToBase64,
  decodeImageFile,
  downloadBlob,
  drawResized,
  encodeCanvas,
} from "@/lib/image-encode"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"]

type OutputRow = {
  name: string
  width: number
  height: number
  blob: Blob
  outputPath?: string
}

type ConvertRow = {
  id: string
  fileName: string
  baseName: string
  diskPath: string
  inputSize: number
  status: "queued" | "converting" | "done" | "error"
  error?: string
  outputs: OutputRow[]
}

function baseName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".")
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName
}

function resolveDiskPath(file: File): string {
  const bridged = window.orbitFiles?.getPathForFile(file)
  if (bridged && bridged.length > 0) return bridged
  const withPath = file as File & { path?: string }
  return typeof withPath.path === "string" ? withPath.path : ""
}

function parseWidths(input: string): number[] | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const widths = trimmed
    .split(/[,\s]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 16 && value <= 8000)
  return widths.length > 0 ? [...new Set(widths)].sort((a, b) => a - b) : null
}

function srcsetSnippet(row: ConvertRow): string {
  if (row.outputs.length <= 1) {
    const output = row.outputs[0]
    return output ? `<img src="${output.name}" alt="" />` : ""
  }
  const srcset = row.outputs
    .map((output) => `${output.name} ${output.width}w`)
    .join(", ")
  const largest = row.outputs[row.outputs.length - 1]
  return `<img\n  src="${largest.name}"\n  srcset="${srcset}"\n  sizes="(min-width: ${largest.width}px) ${largest.width}px, 100vw"\n  alt=""\n/>`
}

/**
 * Client-side WebP/AVIF converter with optional multi-width srcset output.
 * WebP encodes via canvas, AVIF via the @jsquash WASM codec.
 */
export function ImageConvertPage() {
  const [format, setFormat] = useState<OutputFormat>("webp")
  const [quality, setQuality] = useState(80)
  const [widthsInput, setWidthsInput] = useState("")
  const [rows, setRows] = useState<ConvertRow[]>([])
  const [busy, setBusy] = useState(false)
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null)
  const queueRef = useRef<{ id: string; file: File }[]>([])
  const processingRef = useRef(false)
  const optionsRef = useRef({ format, quality, widthsInput })
  optionsRef.current = { format, quality, widthsInput }

  const canWriteToDisk = Boolean(window.orbitFiles?.getPathForFile)

  const updateRow = useCallback((id: string, patch: Partial<ConvertRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    setBusy(true)

    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()
        if (!next) continue
        const { id, file } = next
        const options = optionsRef.current
        updateRow(id, { status: "converting", error: undefined })

        try {
          const bitmap = await decodeImageFile(file)
          const widths = parseWidths(options.widthsInput) ?? [bitmap.width]
          const extension = options.format === "webp" ? "webp" : "avif"
          const diskPath = resolveDiskPath(file)
          const outputs: OutputRow[] = []

          for (const width of widths) {
            const canvas = drawResized(bitmap, width)
            const blob = await encodeCanvas(canvas, options.format, options.quality)
            const isOriginalSize = widths.length === 1 && width === bitmap.width
            const suffix = isOriginalSize ? "" : `-${canvas.width}w`
            const name = `${baseName(file.name)}${suffix}.${extension}`
            const output: OutputRow = {
              name,
              width: canvas.width,
              height: canvas.height,
              blob,
            }

            if (diskPath) {
              output.outputPath = await writeDerivedFile({
                originalPath: diskPath,
                suffix,
                extension: `.${extension}`,
                dataBase64: await blobToBase64(blob),
              })
            }
            outputs.push(output)
          }
          bitmap.close()
          updateRow(id, { status: "done", outputs, diskPath })
        } catch (error: unknown) {
          updateRow(id, {
            status: "error",
            error:
              error instanceof Error ? error.message : "Conversion failed",
          })
        }
      }
    } finally {
      processingRef.current = false
      setBusy(false)
    }
  }, [updateRow])

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((file) =>
        ACCEPTED_TYPES.includes(file.type),
      )
      if (accepted.length === 0) return

      const newRows: ConvertRow[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        fileName: file.name,
        baseName: baseName(file.name),
        diskPath: resolveDiskPath(file),
        inputSize: file.size,
        status: "queued",
        outputs: [],
      }))
      setRows((current) => [...current, ...newRows])
      queueRef.current.push(
        ...accepted.map((file, index) => ({ id: newRows[index].id, file })),
      )
      void processQueue()
    },
    [processQueue],
  )

  const copySnippet = (row: ConvertRow) => {
    void navigator.clipboard.writeText(srcsetSnippet(row)).then(() => {
      setCopiedRowId(row.id)
      window.setTimeout(
        () => setCopiedRowId((current) => (current === row.id ? null : current)),
        1200,
      )
    })
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="Image converter"
        description="Convert PNG/JPG/WebP to WebP or AVIF locally — no API, optional multi-width srcset."
        trailing={
          busy ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Format
            </span>
            <SegmentedControl
              options={(["webp", "avif"] as const).map((value) => ({
                value,
                label: value,
              }))}
              value={format}
              onValueChange={setFormat}
            />
          </div>

          <div className="flex min-w-44 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Quality · <span className="font-mono tabular-nums">{quality}</span>
            </span>
            <Slider
              value={quality}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value
                if (typeof next === "number") setQuality(next)
              }}
              min={1}
              max={100}
              step={1}
              aria-label="Encoding quality"
            />
          </div>

          <label className="flex min-w-52 flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              srcset widths <span className="text-muted-foreground/60">(optional)</span>
            </span>
            <Input
              value={widthsInput}
              onChange={(event) => setWidthsInput(event.target.value)}
              placeholder="480, 768, 1280 — empty keeps original size"
              className="font-mono"
            />
          </label>
        </div>

        <DropZone
          className="mt-4"
          label="Drop images here or click to choose"
          hint={`PNG · JPG · WebP${format === "avif" ? " — AVIF encoding can take a few seconds per image" : ""}`}
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onFiles={enqueueFiles}
        />

        {!canWriteToDisk && rows.length > 0 ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Running outside the desktop app — outputs are download-only.
          </p>
        ) : null}
      </ToolSection>

      {rows.length > 0 ? (
        <ToolSection
          title="Results"
          trailing={
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {rows.length}
            </span>
          }
        >
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="border border-border bg-surface-2/40">
                <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
                  {row.status === "converting" ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground" aria-hidden />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                    {row.fileName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatBytes(row.inputSize)}
                  </span>
                  {row.status === "done" && row.outputs.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => copySnippet(row)}
                    >
                      {copiedRowId === row.id ? (
                        <Check className="size-3 text-success" />
                      ) : (
                        <Clipboard className="size-3 text-muted-foreground" />
                      )}
                      {row.outputs.length > 1 ? "Copy srcset" : "Copy tag"}
                    </Button>
                  ) : null}
                </div>

                {row.status === "error" ? (
                  <p className="px-2.5 py-1.5 text-[11px] text-destructive">
                    {row.error}
                  </p>
                ) : row.status === "queued" ? (
                  <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                    Queued…
                  </p>
                ) : (
                  row.outputs.map((output) => {
                    const saved = row.inputSize - output.blob.size
                    return (
                      <div
                        key={output.name}
                        className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/85">
                          {output.name}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {output.width}×{output.height}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10px] tabular-nums",
                            saved > 0 ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          {formatBytes(output.blob.size)}
                        </span>
                        {output.outputPath ? (
                          <span
                            className="flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-[0.06em] text-success"
                            title={output.outputPath}
                          >
                            <HardDriveDownload className="size-3" aria-hidden />
                            saved
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Download ${output.name}`}
                          onClick={() => downloadBlob(output.name, output.blob)}
                        >
                          <Download className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            ))}
          </div>
        </ToolSection>
      ) : null}
    </div>
  )
}
