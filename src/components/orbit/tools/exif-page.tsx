import { Download, ExternalLink, Loader2, Trash2 } from "lucide-react"
import exifr from "exifr"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { DropZone } from "@/components/orbit/drop-zone"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { downloadBlob } from "@/lib/image-encode"
import { formatBytes } from "@/lib/format-size"

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic"]

type ExifRow = { key: string; value: string }

type ImageEntry = {
  id: string
  name: string
  type: string
  size: number
  file: File
  rows: ExifRow[]
  gps: { latitude: number; longitude: number } | null
  status: "reading" | "done" | "error"
  error?: string
  stripped?: { blob: Blob; name: string }
}

function stringifyTag(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number") return String(Math.round(value * 10000) / 10000)
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "boolean") return String(value)
  if (Array.isArray(value) && value.length <= 8) {
    const parts = value.map(stringifyTag).filter(Boolean)
    return parts.length > 0 ? parts.join(", ") : null
  }
  return null
}

async function readExif(file: File): Promise<{
  rows: ExifRow[]
  gps: { latitude: number; longitude: number } | null
}> {
  const tags = (await exifr.parse(file, true).catch(() => null)) as Record<
    string,
    unknown
  > | null
  const gps = await exifr.gps(file).catch(() => null)
  const rows: ExifRow[] = []
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      const text = stringifyTag(value)
      if (text && text.length <= 200) rows.push({ key, value: text })
    }
  }
  rows.sort((a, b) => a.key.localeCompare(b.key))
  return {
    rows,
    gps:
      gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)
        ? { latitude: gps.latitude, longitude: gps.longitude }
        : null,
  }
}

function strippedName(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, "")
  const extension =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
  return `${base}-clean.${extension}`
}

/**
 * EXIF viewer and stripper: shows metadata (camera, exposure, GPS) and
 * removes it by re-encoding through a canvas — fully local.
 */
export function ExifPage() {
  const [entries, setEntries] = useState<ImageEntry[]>([])
  const [quality, setQuality] = useState(90)

  const updateEntry = (id: string, patch: Partial<ImageEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }

  const addFiles = (files: FileList) => {
    const accepted = Array.from(files).filter(
      (file) =>
        ACCEPTED_TYPES.includes(file.type) || /\.(jpe?g|png|webp|tiff?|heic)$/i.test(file.name),
    )
    for (const file of accepted) {
      const id = crypto.randomUUID()
      setEntries((current) => [
        ...current,
        {
          id,
          name: file.name,
          type: file.type || "image/jpeg",
          size: file.size,
          file,
          rows: [],
          gps: null,
          status: "reading",
        },
      ])
      void readExif(file)
        .then(({ rows, gps }) => updateEntry(id, { rows, gps, status: "done" }))
        .catch((cause: unknown) =>
          updateEntry(id, {
            status: "error",
            error:
              cause instanceof Error ? cause.message : "Could not read metadata",
          }),
        )
    }
  }

  const strip = async (entry: ImageEntry) => {
    try {
      const bitmap = await createImageBitmap(entry.file)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas 2D context unavailable")
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      const type =
        entry.type === "image/png" || entry.type === "image/webp"
          ? entry.type
          : "image/jpeg"
      const blob = await canvas.convertToBlob({
        type,
        quality: type === "image/png" ? undefined : quality / 100,
      })
      updateEntry(entry.id, {
        stripped: { blob, name: strippedName(entry.name, type) },
      })
    } catch (cause: unknown) {
      updateEntry(entry.id, {
        error:
          cause instanceof Error ? cause.message : "Could not strip metadata",
      })
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="EXIF viewer"
        description="Inspect image metadata (camera, exposure, GPS) and strip it via re-encode — nothing is uploaded."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-40 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              JPEG quality ·{" "}
              <span className="font-mono tabular-nums">{quality}</span>
            </span>
            <Slider
              value={quality}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value
                if (typeof next === "number") setQuality(next)
              }}
              min={50}
              max={100}
              step={1}
              aria-label="JPEG quality for stripping"
            />
          </div>
          {entries.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEntries([])}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
              Clear
            </Button>
          ) : null}
        </div>

        <DropZone
          className="mt-4"
          label="Drop images here or click to choose"
          hint="JPG · PNG · WebP · TIFF — PNG/WebP re-encode losslessly"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onFiles={addFiles}
        />
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          Stripping re-encodes the image, which also removes the color profile.
        </p>
      </ToolSection>

      {entries.map((entry) => (
        <ToolSection
          key={entry.id}
          title={entry.name}
          trailing={
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatBytes(entry.size)}
              </span>
              {entry.status === "reading" ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {entry.stripped ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        entry.stripped
                          ? downloadBlob(entry.stripped.name, entry.stripped.blob)
                          : undefined
                      }
                    >
                      <Download className="size-3 text-success" />
                      {entry.stripped.name} (
                      {formatBytes(entry.stripped.blob.size)})
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void strip(entry)}
                    >
                      Strip metadata
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        >
          {entry.error ? (
            <p className="text-[11px] text-destructive">{entry.error}</p>
          ) : null}

          {entry.gps ? (
            <a
              href={`https://www.openstreetmap.org/?mlat=${entry.gps.latitude}&mlon=${entry.gps.longitude}#map=15/${entry.gps.latitude}/${entry.gps.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mb-2 inline-flex items-center gap-1.5 border border-highlight/40 bg-highlight/10 px-2 py-1 font-mono text-[11px] text-highlight hover:bg-highlight/20"
            >
              <ExternalLink className="size-3" />
              GPS {entry.gps.latitude.toFixed(5)}, {entry.gps.longitude.toFixed(5)}
            </a>
          ) : null}

          {entry.status === "done" && entry.rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No metadata found.
            </p>
          ) : entry.rows.length > 0 ? (
            <div className="max-h-72 overflow-auto border border-border">
              {entry.rows.map((row, index) => (
                <div
                  key={row.key}
                  className={
                    index % 2 === 0
                      ? "grid grid-cols-[14rem_1fr] gap-2 bg-card px-2.5 py-1"
                      : "grid grid-cols-[14rem_1fr] gap-2 bg-surface-2/30 px-2.5 py-1"
                  }
                >
                  <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                    {row.key}
                  </span>
                  <span
                    className="truncate font-mono text-[10.5px] text-foreground"
                    title={row.value}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </ToolSection>
      ))}
    </div>
  )
}
