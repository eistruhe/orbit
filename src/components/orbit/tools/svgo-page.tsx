import { Check, Copy, Download, HardDriveDownload, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { DropZone } from "@/components/orbit/drop-zone"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { type ImageStatsEvent, replaceFileContents, reportImageStats } from "@/lib/api"
import { formatBytes } from "@/lib/format-size"
import { batchCue, cue } from "@/lib/sound"
import { createDefaultSvgoSettings, mergeSvgoSettings, type SvgoUiSettings, } from "@/lib/svgo/default-settings"
import { optimizeSvgString } from "@/lib/svgo/optimize-svg"
import { svgoPluginConfig } from "@/lib/svgo/svgo-plugin-config"
import { cn } from "@/lib/utils"

type WriteStatus = "idle" | "writing" | "written" | "error"

type SvgInputItem = {
  id: string
  name: string
  original: string
  /** Absolute path on disk when the file came from the desktop bridge. */
  diskPath: string
  writeStatus: WriteStatus
  /** Optimized markup that was last written to `diskPath`. */
  writtenOptimized: string | null
  writeError: string | null
  inputSize: number | null
  outputSize: number | null
}

type SvgResultItem = SvgInputItem & {
  optimized: string | null
  error: string | null
}

type CopyTarget = string | "all" | null

function isSvgFile(file: File): boolean {
  const normalizedName = file.name.toLowerCase()
  return (
    file.type === "image/svg+xml" ||
    normalizedName.endsWith(".svg") ||
    normalizedName.endsWith(".svgz")
  )
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function resolveDiskPath(file: File): string {
  const bridged = window.orbitFiles?.getPathForFile(file)
  if (bridged && bridged.length > 0) return bridged
  const withPath = file as File & { path?: string }
  return typeof withPath.path === "string" ? withPath.path : ""
}

/** Only plain .svg files can be overwritten; .svgz would need gzip. */
function isReplaceablePath(path: string): boolean {
  return path.toLowerCase().endsWith(".svg")
}

/** UTF-8 byte length, i.e. the size the markup has on disk or in a download. */
function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function createInputItem(
  name: string,
  original: string,
  diskPath = "",
): SvgInputItem {
  return {
    id: makeId("svg"),
    name,
    original,
    diskPath,
    writeStatus: "idle",
    writtenOptimized: null,
    writeError: null,
    inputSize: null,
    outputSize: null,
  }
}

function svgPreviewUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function triggerSvgDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.toLowerCase().endsWith(".svg")
    ? filename
    : `${filename}.svg`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SvgoPage() {
  const { prefs, saveAllPreferences } = useOrbit()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  const persistedSettings = useMemo(
    () => mergeSvgoSettings(prefs.appSettings.svgo),
    [prefs.appSettings.svgo],
  )

  const [settings, setSettings] = useState<SvgoUiSettings>(persistedSettings)
  const [files, setFiles] = useState<SvgInputItem[]>([])
  const [pluginQuery, setPluginQuery] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<CopyTarget>(null)
  const [replaceOriginal, setReplaceOriginal] = useState(true)
  const [writing, setWriting] = useState(false)

  const settingsRef = useRef(settings)
  const replaceOriginalRef = useRef(replaceOriginal)
  /** `id|bytes` of results already reported, so copy + download count once. */
  const reportedStatsRef = useRef(new Set<string>())

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    replaceOriginalRef.current = replaceOriginal
  }, [replaceOriginal])

  const supportsDesktopFileBridge = Boolean(window.orbitFiles?.getPathForFile)

  useEffect(() => {
    const currentSerialized = JSON.stringify(settings)
    const persistedSerialized = JSON.stringify(persistedSettings)
    if (currentSerialized === persistedSerialized) return

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setSaving(true)
          setSaveError(null)
          await saveAllPreferences({
            ...prefs,
            appSettings: {
              ...prefs.appSettings,
              svgo: settings,
            },
          })
        } catch (error) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Could not save SVGO settings.",
          )
        } finally {
          setSaving(false)
        }
      })()
    }, 250)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [prefs, saveAllPreferences, settings, persistedSettings])

  const optimizedFiles = useMemo<SvgResultItem[]>(() => {
    return files.map((file) => {
      try {
        const optimized = optimizeSvgString(file.original, settings)
        return {
          ...file,
          optimized,
          error: null,
        }
      } catch (error) {
        return {
          ...file,
          optimized: null,
          error:
            error instanceof Error
              ? error.message
              : "Optimization failed for this SVG.",
        }
      }
    })
  }, [files, settings])

  const totalOptimized = optimizedFiles.filter((item) => item.optimized).length

  const filteredPlugins = useMemo(() => {
    const query = pluginQuery.trim().toLowerCase()
    if (!query) return svgoPluginConfig
    return svgoPluginConfig.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.id.toLowerCase().includes(query),
    )
  }, [pluginQuery])

  const reportSvgStats = useCallback(
    (
      items: Array<SvgInputItem & { optimized: string | null }>,
      output: ImageStatsEvent["output"],
    ) => {
      const events: ImageStatsEvent[] = []
      for (const item of items) {
        if (!item.optimized) continue
        const bytesOut = utf8ByteLength(item.optimized)
        const key = `${item.id}|${bytesOut}`
        if (reportedStatsRef.current.has(key)) continue
        reportedStatsRef.current.add(key)
        events.push({
          tool: "svgo",
          name: item.name,
          ...(item.diskPath ? { path: item.diskPath } : {}),
          formatIn: "svg",
          formatOut: "svg",
          bytesIn: utf8ByteLength(item.original),
          bytesOut,
          output,
        })
      }
      reportImageStats(events)
    },
    [],
  )

  const updateFile = useCallback((id: string, patch: Partial<SvgInputItem>) => {
    setFiles((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }, [])

  /**
   * Optimizes each item with the current settings and overwrites its file on
   * disk. Items without a replaceable disk path are skipped.
   */
  const writeItemsToDisk = useCallback(
    async (items: SvgInputItem[]) => {
      const targets = items.filter(
        (item) => item.diskPath && isReplaceablePath(item.diskPath),
      )
      if (targets.length === 0) return

      setWriting(true)
      let failed = 0
      try {
        for (const item of targets) {
          updateFile(item.id, { writeStatus: "writing", writeError: null })
          try {
            const optimized = optimizeSvgString(item.original, settingsRef.current)
            const result = await replaceFileContents(
              item.diskPath,
              utf8ToBase64(optimized),
            )
            updateFile(item.id, {
              writeStatus: "written",
              writtenOptimized: optimized,
              writeError: null,
              inputSize: item.inputSize ?? result.inputSize,
              outputSize: result.outputSize,
            })
            reportSvgStats([{ ...item, optimized }], "replace")
          } catch (error) {
            failed += 1
            updateFile(item.id, {
              writeStatus: "error",
              writeError:
                error instanceof Error
                  ? error.message
                  : "Could not replace the original file.",
            })
          }
        }
      } finally {
        setWriting(false)
        batchCue(targets.length, failed)
      }
    },
    [reportSvgStats, updateFile],
  )

  const readSvgFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming).filter(isSvgFile)
      if (list.length === 0) return

      const nextItems: SvgInputItem[] = []
      for (const file of list) {
        const text = await file.text()
        nextItems.push(createInputItem(file.name, text, resolveDiskPath(file)))
      }

      setFiles((current) => [...current, ...nextItems])

      if (replaceOriginalRef.current) {
        void writeItemsToDisk(nextItems)
      }
    },
    [writeItemsToDisk],
  )

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }

      const data = event.clipboardData
      if (!data) return

      const svgFiles = Array.from(data.files).filter(isSvgFile)
      if (svgFiles.length > 0) {
        event.preventDefault()
        void readSvgFiles(svgFiles)
        return
      }

      const text = data.getData("text/plain").trim()
      if (!text.toLowerCase().includes("<svg")) return

      event.preventDefault()
      setFiles((current) => {
        const pastedCount = current.filter((item) =>
          item.name.startsWith("pasted-"),
        ).length
        return [
          ...current,
          createInputItem(`pasted-${pastedCount + 1}.svg`, text),
        ]
      })
    }

    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [readSvgFiles])

  const updatePluginEnabled = useCallback((pluginId: string, enabled: boolean) => {
    setSettings((current) => {
      const nextPlugins = {
        ...current.plugins,
        [pluginId]: enabled,
      }
      return { ...current, plugins: nextPlugins }
    })
  }, [])

  const handleCopy = useCallback(
    async (value: string, target: CopyTarget, items: SvgResultItem[]) => {
      if (!value) return
      try {
        await navigator.clipboard.writeText(value)
        reportSvgStats(items, "clipboard")
        setCopied(target)
        window.setTimeout(() => {
          setCopied((current) => (current === target ? null : current))
        }, 1400)
      } catch {
        /* clipboard unavailable */
      }
    },
    [reportSvgStats],
  )

  const copyAllText = useMemo(() => {
    return optimizedFiles
      .filter((item) => item.optimized)
      .map((item) => `<!-- ${item.name} -->\n${item.optimized}`)
      .join("\n\n")
  }, [optimizedFiles])

  const downloadAll = useCallback(() => {
    const allReady = optimizedFiles.filter((item) => item.optimized)
    allReady.forEach((item, index) => {
      window.setTimeout(() => {
        if (!item.optimized) return
        triggerSvgDownload(item.name, item.optimized)
      }, index * 120)
    })
    reportSvgStats(allReady, "download")
    if (allReady.length > 0) cue("success", { emphasis: "subtle" })
  }, [optimizedFiles, reportSvgStats])

  const replaceableFiles = useMemo(
    () => files.filter((item) => item.diskPath && isReplaceablePath(item.diskPath)),
    [files],
  )
  const staleOnDisk = useMemo(
    () =>
      optimizedFiles.filter(
        (item) =>
          item.diskPath &&
          isReplaceablePath(item.diskPath) &&
          item.optimized &&
          item.writeStatus !== "writing" &&
          item.writtenOptimized !== item.optimized,
      ),
    [optimizedFiles],
  )

  return (
    <div className="space-y-4">
      <ToolSection
        title="SVGO"
        description="Optimize one or many SVG files using SVGO settings."
        trailing={
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {writing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Replacing
              </span>
            ) : null}
            <span>
              {totalOptimized}/{files.length} optimized
            </span>
          </span>
        }
      >
        <div className="space-y-3">
          <DropZone
            label="Drag SVG files here, click to upload, or paste SVG code (⌘V)"
            hint={
              replaceOriginal && supportsDesktopFileBridge
                ? "SVG · originals are replaced on disk right after optimization"
                : "SVG"
            }
            accept=".svg,image/svg+xml"
            multiple
            onFiles={(files) => void readSvgFiles(files)}
            inputRef={fileInputRef}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload SVGs
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFiles([])}
              disabled={files.length === 0 || writing}
            >
              Clear files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopy(copyAllText, "all", optimizedFiles)}
              disabled={!copyAllText}
            >
              {copied === "all" ? (
                <>
                  <Check className="size-3.5" />
                  Copied all
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy all code
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadAll}
              disabled={optimizedFiles.every((item) => !item.optimized)}
            >
              <Download className="size-3.5" />
              Download all SVGs
            </Button>
            {replaceOriginal && supportsDesktopFileBridge ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void writeItemsToDisk(replaceableFiles)}
                disabled={writing || staleOnDisk.length === 0}
                title={
                  staleOnDisk.length > 0
                    ? "Write the current optimization result over the original files"
                    : "All files on disk match the current settings"
                }
              >
                <HardDriveDownload className="size-3.5" />
                {staleOnDisk.length > 0
                  ? `Replace originals (${staleOnDisk.length})`
                  : "Originals up to date"}
              </Button>
            ) : null}
            {saving ? (
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Saving settings...
              </span>
            ) : null}
          </div>

          <FieldGroup className="max-w-md">
            <FieldLabel>
              <Field orientation="horizontal">
                <Checkbox
                  id="svgoReplaceOriginal"
                  checked={replaceOriginal}
                  disabled={!supportsDesktopFileBridge}
                  onCheckedChange={(checked) => setReplaceOriginal(Boolean(checked))}
                />
                <FieldContent>
                  <FieldTitle>Replace original file</FieldTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {supportsDesktopFileBridge
                      ? "Dropped or uploaded .svg files are overwritten with the optimized output. Pasted code is never written."
                      : "Open Orbit desktop to overwrite local files in place."}
                  </p>
                </FieldContent>
              </Field>
            </FieldLabel>
          </FieldGroup>

          {saveError ? (
            <p className="text-[11px] text-destructive">{saveError}</p>
          ) : null}
        </div>
      </ToolSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <ToolSection
          title="Settings"
          trailing={
            <Button
              type="button"
              variant="clean"
              size="xs"
              className="h-2.5 p-0 hover:text-destructive text-muted-foreground"
              onClick={() => setSettings(createDefaultSvgoSettings())}
            >
              Reset settings
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <Checkbox
                  checked={settings.multipass}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      multipass: checked === true,
                    }))
                  }
                />
                Multipass
              </label>
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <Checkbox
                  checked={settings.pretty}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      pretty: checked === true,
                    }))
                  }
                />
                Prettify markup
              </label>
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <Checkbox
                  checked={settings.wrapCode}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      wrapCode: checked === true,
                    }))
                  }
                />
                Wrap code
              </label>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Number precision: {settings.floatPrecision}
                </span>
                <Slider
                  min={0}
                  max={8}
                  step={1}
                  value={[settings.floatPrecision]}
                  onValueChange={(value) => {
                    const nextValue = Array.isArray(value) ? value[0] : value
                    setSettings((current) => ({
                      ...current,
                      floatPrecision:
                        typeof nextValue === "number"
                          ? Math.round(nextValue)
                          : current.floatPrecision,
                    }))
                  }}
                  className="w-full mt-1.5"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Transform precision: {settings.transformPrecision}
                </span>
                <Slider
                  min={0}
                  max={8}
                  step={1}
                  value={[settings.transformPrecision]}
                  onValueChange={(value) => {
                    const nextValue = Array.isArray(value) ? value[0] : value
                    setSettings((current) => ({
                      ...current,
                      transformPrecision:
                        typeof nextValue === "number"
                          ? Math.round(nextValue)
                          : current.transformPrecision,
                    }))
                  }}
                  className="w-full mt-1.5"
                />
              </label>
            </div>

            <div className="space-y-2">
              <Input
                value={pluginQuery}
                onChange={(event) => setPluginQuery(event.target.value)}
                placeholder="Search…"
              />
              <div className="max-h-104 space-y-1 overflow-auto border border-border p-2">
                {filteredPlugins.map((plugin) => (
                  <label
                    key={plugin.id}
                    className="flex items-start gap-2 px-1 py-1.5 text-[11px] text-foreground"
                  >
                    <Checkbox
                      checked={settings.plugins[plugin.id]}
                      onCheckedChange={(checked) =>
                        updatePluginEnabled(plugin.id, checked === true)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{plugin.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {plugin.id}
                      </span>
                    </span>
                  </label>
                ))}
                {filteredPlugins.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-muted-foreground">
                    No matching plugins.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </ToolSection>

        <ToolSection
          title="Optimized files"
        >
          <div className="space-y-2">
            {optimizedFiles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Upload at least one SVG to see optimized output.
              </p>
            ) : (
              optimizedFiles.map((item) => (
                <article
                  key={item.id}
                  className="space-y-2 border border-border bg-background p-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {item.name}
                      </p>
                      <DiskStatus
                        item={item}
                        replaceOriginal={replaceOriginal && supportsDesktopFileBridge}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void handleCopy(item.optimized ?? "", item.id, [item])
                        }
                        disabled={!item.optimized}
                      >
                        {copied === item.id ? (
                          <>
                            <Check className="size-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copy code
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (!item.optimized) return
                          triggerSvgDownload(item.name, item.optimized)
                          reportSvgStats([item], "download")
                        }}
                        disabled={!item.optimized}
                      >
                        <Download className="size-3.5" />
                        Download
                      </Button>
                    </div>
                  </div>
                  {item.error ? (
                    <p className="text-[11px] text-destructive">{item.error}</p>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex size-28 shrink-0 items-center justify-center border border-border bg-card p-2 [background-image:repeating-conic-gradient(rgba(128,128,128,0.12)_0%_25%,transparent_0%_50%)] [background-size:12px_12px]">
                        <img
                          src={svgPreviewUri(item.optimized ?? "")}
                          alt={`Preview of ${item.name}`}
                          className="max-h-full max-w-full"
                        />
                      </div>
                      <pre
                        className={cn(
                          "max-h-44 min-w-0 flex-1 overflow-auto border border-border bg-card p-2 text-[10px] leading-relaxed text-foreground",
                          settings.wrapCode && "whitespace-pre-wrap break-all",
                        )}
                      >
                        {item.optimized}
                      </pre>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </ToolSection>
      </div>
    </div>
  )
}

/**
 * One-line status under the file name: whether (and how) the original on
 * disk was replaced, and whether the disk copy still matches the settings.
 */
function DiskStatus({
  item,
  replaceOriginal,
}: {
  item: SvgResultItem
  replaceOriginal: boolean
}) {
  const base = "text-[10px] uppercase tracking-[0.06em]"

  if (item.writeStatus === "writing") {
    return (
      <p className={cn(base, "inline-flex items-center gap-1 text-muted-foreground")}>
        <Loader2 className="size-3 animate-spin" />
        Replacing original
      </p>
    )
  }

  if (item.writeStatus === "error") {
    return (
      <p className={cn(base, "text-destructive")}>
        Replace failed: {item.writeError}
      </p>
    )
  }

  if (item.writeStatus === "written") {
    const stale = item.optimized !== null && item.writtenOptimized !== item.optimized
    const sizes =
      item.inputSize !== null && item.outputSize !== null
        ? `${formatBytes(item.inputSize) ?? "—"} → ${formatBytes(item.outputSize) ?? "—"}`
        : null
    return (
      <p className={cn(base, stale ? "text-warning" : "text-success")}>
        {stale ? "Disk copy outdated (settings changed)" : "Original replaced"}
        {sizes ? <span className="text-muted-foreground"> · {sizes}</span> : null}
      </p>
    )
  }

  if (!replaceOriginal) return null

  if (!item.diskPath) {
    return (
      <p className={cn(base, "text-muted-foreground")}>
        No local path · nothing written
      </p>
    )
  }

  if (!isReplaceablePath(item.diskPath)) {
    return (
      <p className={cn(base, "text-muted-foreground")}>
        Only .svg files are replaced (.svgz skipped)
      </p>
    )
  }

  return null
}
