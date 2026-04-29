import {
  Check,
  Copy,
  Download,
  RefreshCw,
  Upload,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  createDefaultSvgoSettings,
  mergeSvgoSettings,
  type SvgoUiSettings,
} from "@/lib/svgo/default-settings"
import { optimizeSvgString } from "@/lib/svgo/optimize-svg"
import { svgoPluginConfig } from "@/lib/svgo/svgo-plugin-config"
import { cn } from "@/lib/utils"

type SvgInputItem = {
  id: string
  name: string
  original: string
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
  const [dropActive, setDropActive] = useState(false)
  const [pluginQuery, setPluginQuery] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<CopyTarget>(null)

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

  const readSvgFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter(isSvgFile)
    if (list.length === 0) return

    const nextItems: SvgInputItem[] = []
    for (const file of list) {
      const text = await file.text()
      nextItems.push({
        id: makeId("svg"),
        name: file.name,
        original: text,
      })
    }

    setFiles((current) => [...current, ...nextItems])
  }, [])

  const updatePluginEnabled = useCallback((pluginId: string, enabled: boolean) => {
    setSettings((current) => {
      const nextPlugins = {
        ...current.plugins,
        [pluginId]: enabled,
      }
      return { ...current, plugins: nextPlugins }
    })
  }, [])

  const handleCopy = useCallback(async (value: string, target: CopyTarget) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      window.setTimeout(() => {
        setCopied((current) => (current === target ? null : current))
      }, 1400)
    } catch {
      /* clipboard unavailable */
    }
  }, [])

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
  }, [optimizedFiles])

  return (
    <div className="space-y-4">
      <ToolSection
        title="SVGO"
        description="Optimize one or many SVG files using SVGO settings."
        className="max-w-6xl"
        trailing={
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {totalOptimized}/{files.length} optimized
          </span>
        }
      >
        <div className="space-y-3">
          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDropActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDropActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDropActive(false)
              void readSvgFiles(event.dataTransfer.files)
            }}
            className={cn(
              "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border px-3 py-4 text-center transition-colors",
              dropActive ? "bg-muted/50" : "bg-background",
            )}
          >
            <Upload className="size-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              Drag SVG files here or click to upload.
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              multiple
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files
                if (!selected || selected.length === 0) return
                void readSvgFiles(selected)
                event.currentTarget.value = ""
              }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload SVGs
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFiles([])}
              disabled={files.length === 0}
            >
              Clear files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleCopy(copyAllText, "all")}
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
              size="sm"
              onClick={downloadAll}
              disabled={optimizedFiles.every((item) => !item.optimized)}
            >
              <Download className="size-3.5" />
              Download all SVGs
            </Button>
            {saving ? (
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Saving settings...
              </span>
            ) : null}
            <Button
              className="ml-auto"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSettings(createDefaultSvgoSettings())}
            >
              <RefreshCw className="size-3.5" />
              Reset settings
            </Button>
          </div>
          {saveError ? (
            <p className="text-[11px] text-destructive">{saveError}</p>
          ) : null}
        </div>
      </ToolSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <ToolSection
          title="Settings"
          description="SVGO optimizer controls (plugins + global precision controls)."
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
          description="Copy or download each optimized SVG output."
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
                    <p className="truncate text-[11px] font-medium text-foreground">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleCopy(item.optimized ?? "", item.id)
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
                        size="sm"
                        onClick={() =>
                          item.optimized
                            ? triggerSvgDownload(item.name, item.optimized)
                            : undefined
                        }
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
                    <pre className="max-h-44 overflow-auto border border-border bg-card p-2 text-[10px] leading-relaxed text-foreground">
                      {item.optimized}
                    </pre>
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
