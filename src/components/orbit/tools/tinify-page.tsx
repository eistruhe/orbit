import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { DropZone } from "@/components/orbit/drop-zone"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { formatBytes } from "@/lib/format-size"
import { tinifyPaths, type TinifyResult } from "@/lib/api"

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg"]

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".")
  if (lastDot < 0) return ""
  return name.slice(lastDot).toLowerCase()
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).at(-1) ?? path
}

function resolveDroppedPath(file: File): string {
  const bridgedPath = window.orbitFiles?.getPathForFile(file)
  if (bridgedPath && bridgedPath.length > 0) return bridgedPath

  const fileWithPath = file as File & { path?: string }
  if (typeof fileWithPath.path === "string" && fileWithPath.path.length > 0) {
    return fileWithPath.path
  }

  return ""
}

function collectSupportedPaths(files: FileList | File[]): string[] {
  return Array.from(files)
    .map((file) => ({
      path: resolveDroppedPath(file),
      extension: getFileExtension(file.name),
    }))
    .filter(
      (entry) =>
        entry.path.length > 0 && ACCEPTED_EXTENSIONS.includes(entry.extension),
    )
    .map((entry) => entry.path)
}

type CompressionStatus = "queued" | "compressing" | "done" | "error"

type CompressionRow = {
  path: string
  inputSize?: number
  outputSize?: number
  error?: string
  status: CompressionStatus
}

export function TinifyPage() {
  const [replaceOriginal, setReplaceOriginal] = useState(true)
  const [rows, setRows] = useState<CompressionRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  const replaceOriginalRef = useRef(replaceOriginal)

  useEffect(() => {
    replaceOriginalRef.current = replaceOriginal
  }, [replaceOriginal])

  const supportsDesktopFileBridge = Boolean(
    window.orbitFiles?.getPathForFile || window.orbitFiles?.pickImagePaths,
  )

  const updateRow = useCallback((path: string, patch: Partial<CompressionRow>) => {
    setRows((current) =>
      current.map((row) => (row.path === path ? { ...row, ...patch } : row)),
    )
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    setBusy(true)

    try {
      while (queueRef.current.length > 0) {
        const nextPath = queueRef.current.shift()
        if (!nextPath) continue

        updateRow(nextPath, { status: "compressing", error: undefined })
        try {
          const response = await tinifyPaths(
            [nextPath],
            replaceOriginalRef.current,
          )
          const result = response.results[0] as TinifyResult | undefined
          if (!result) {
            updateRow(nextPath, {
              status: "error",
              error: "No result returned from compression.",
            })
            continue
          }

          if (result.error) {
            updateRow(nextPath, {
              status: "error",
              error: result.error,
              inputSize: result.inputSize,
              outputSize: result.outputSize,
            })
            continue
          }

          updateRow(nextPath, {
            status: "done",
            inputSize: result.inputSize,
            outputSize: result.outputSize,
            error: undefined,
          })
        } catch (compressError) {
          updateRow(nextPath, {
            status: "error",
            error:
              compressError instanceof Error
                ? compressError.message
                : "Tinify compression failed",
          })
        }
      }
    } finally {
      processingRef.current = false
      setBusy(false)
    }
  }, [updateRow])

  const appendPaths = useCallback(
    (incomingPaths: string[]) => {
      if (incomingPaths.length === 0) return
      setError(null)

      setRows((current) => {
        const existing = new Set(current.map((row) => row.path))
        const fresh = incomingPaths.filter((path) => !existing.has(path))
        if (fresh.length === 0) return current
        queueRef.current.push(...fresh)
        return [
          ...current,
          ...fresh.map((path) => ({ path, status: "queued" as const })),
        ]
      })

      void processQueue()
    },
    [processQueue],
  )

  const totalSaved = rows.reduce((acc, row) => {
    if (
      typeof row.inputSize !== "number" ||
      typeof row.outputSize !== "number"
    ) {
      return acc
    }
    return acc + Math.max(0, row.inputSize - row.outputSize)
  }, 0)

  return (
    <div className="space-y-4">
      <ToolSection
        title="Image compression"
        description={
          supportsDesktopFileBridge
            ? "Drop or pick PNG/JPG files. Compression starts immediately."
            : "Open Orbit desktop to enable drag-and-drop local file compression."
        }
        trailing={
          busy ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Compressing
            </span>
          ) : null
        }
      >
        <div className="space-y-3">
          <DropZone
            label="Drop images here or click to choose"
            hint=".png · .jpg · .jpeg"
            accept=".png,.jpg,.jpeg"
            multiple
            onFiles={(files) => {
              const paths = collectSupportedPaths(files)
              if (paths.length === 0) {
                setError(
                  "Could not read local file paths from the images. Try picking files from the app dialog.",
                )
                return
              }
              appendPaths(paths)
            }}
            onClick={(openFilePicker) => {
              void (async () => {
                if (window.orbitFiles?.pickImagePaths) {
                  const selectedPaths = await window.orbitFiles.pickImagePaths()
                  if (selectedPaths.length > 0) {
                    appendPaths(selectedPaths)
                    return
                  }
                }
                openFilePicker()
              })()
            }}
          />

          <div className="flex items-center justify-between gap-2">
            <FieldGroup className="max-w-xs">
              <FieldLabel>
                <Field orientation="horizontal">
                  <Checkbox
                    id="replaceOriginal"
                    checked={replaceOriginal}
                    onCheckedChange={(checked) => setReplaceOriginal(Boolean(checked))}
                  />
                  <FieldContent>
                    <FieldTitle>Replace original image</FieldTitle>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </FieldGroup>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                queueRef.current = []
                setRows([])
                setError(null)
              }}
              disabled={busy}
            >
              Clear
            </Button>
          </div>

          {error ? (
            <p className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </ToolSection>

      {rows.length > 0 ? (
        <ToolSection
          title="Results"
          trailing={
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Saved{" "}
              <span className="tabular-nums text-success">
                {formatBytes(totalSaved) ?? "0 B"}
              </span>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Image
                  </th>
                  <th className="py-1.5 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Original
                  </th>
                  <th className="py-1.5 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Compressed
                  </th>
                  <th className="py-1.5 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Saved
                  </th>
                  <th className="py-1.5 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((result) => {
                  const percentSaved =
                    typeof result.inputSize === "number" &&
                    typeof result.outputSize === "number" &&
                    result.inputSize > 0
                      ? Math.max(
                          0,
                          ((result.inputSize - result.outputSize) /
                            result.inputSize) *
                            100,
                        )
                      : null
                  return (
                    <tr
                      key={result.path}
                      className="border-b border-border/40 hover:bg-muted/40"
                    >
                      <td className="py-1.5 pr-2">{getFileName(result.path)}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                        {formatBytes(result.inputSize ?? null) ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {formatBytes(result.outputSize ?? null) ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-success">
                        {percentSaved == null ? "—" : `${percentSaved.toFixed(1)}%`}
                      </td>
                      <td className="py-1.5 pr-2">
                        {result.error ? (
                          <span className="text-destructive">{result.error}</span>
                        ) : result.status === "queued" ? (
                          <span className="text-muted-foreground uppercase tracking-[0.06em]">
                            Queued
                          </span>
                        ) : result.status === "compressing" ? (
                          <span className="inline-flex items-center gap-1 uppercase tracking-[0.06em] text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Working
                          </span>
                        ) : (
                          <span className="uppercase tracking-[0.06em] text-success">
                            Done
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ToolSection>
      ) : null}
    </div>
  )
}
