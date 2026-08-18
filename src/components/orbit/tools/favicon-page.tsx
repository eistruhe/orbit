import { Check, Clipboard, Download, FolderDown, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { zipSync } from "fflate"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropZone } from "@/components/orbit/drop-zone"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { writeBatchFiles } from "@/lib/api"
import { encodeIco } from "@/lib/ico"
import { blobToBase64, downloadBlob } from "@/lib/image-encode"
import { formatBytes } from "@/lib/format-size"
import { cn } from "@/lib/utils"

const ICO_SIZES = [16, 32, 48]
const PNG_OUTPUTS = [
  { name: "apple-touch-icon.png", size: 180, opaque: true },
  { name: "icon-192.png", size: 192, opaque: false },
  { name: "icon-512.png", size: 512, opaque: false },
]
const PREVIEW_SIZES = [16, 32, 48, 180]

type SourceImage = {
  fileName: string
  isSvg: boolean
  svgText: string | null
  objectUrl: string
  image: HTMLImageElement
}

type GeneratedFile = {
  name: string
  bytes: Uint8Array
  previewUrl: string | null
}

async function loadSourceImage(file: File): Promise<SourceImage> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
  const svgText = isSvg ? await file.text() : null
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.src = objectUrl
  await image.decode()
  return { fileName: file.name, isSvg, svgText, objectUrl, image }
}

async function rasterizeToPng(
  source: SourceImage,
  size: number,
  background: string | null,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas 2D context unavailable")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, size, size)
  }
  context.drawImage(source.image, 0, 0, size, size)
  const blob = await canvas.convertToBlob({ type: "image/png" })
  return new Uint8Array(await blob.arrayBuffer())
}

function buildManifest(name: string, shortName: string, themeColor: string): string {
  return `${JSON.stringify(
    {
      name: name || "My Site",
      short_name: shortName || name || "Site",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: themeColor,
      background_color: themeColor,
      display: "standalone",
    },
    null,
    2,
  )}\n`
}

function buildLinkSnippet(hasSvg: boolean): string {
  return [
    `<link rel="icon" href="/favicon.ico" sizes="48x48" />`,
    ...(hasSvg
      ? [`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`]
      : []),
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/site.webmanifest" />`,
  ].join("\n")
}

/**
 * Favicon generator: one SVG/PNG in → favicon.ico, PNG set, manifest, and
 * link boilerplate out — written to a folder or downloaded as ZIP.
 */
export function FaviconPage() {
  const [source, setSource] = useState<SourceImage | null>(null)
  const [files, setFiles] = useState<GeneratedFile[]>([])
  const [siteName, setSiteName] = useState("")
  const [shortName, setShortName] = useState("")
  const [appleBackground, setAppleBackground] = useState("#ffffff")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [writeMessage, setWriteMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const canWriteToDisk = Boolean(window.orbitFiles?.pickDirectory)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setWriteMessage(null)
    try {
      const loaded = await loadSourceImage(file)
      setSource((previous) => {
        if (previous) URL.revokeObjectURL(previous.objectUrl)
        return loaded
      })
    } catch {
      setError("Could not read this image. Use an SVG or PNG file.")
    }
  }, [])

  // Regenerate all raster outputs whenever the source or the apple-touch
  // background changes.
  useEffect(() => {
    if (!source) return
    let cancelled = false
    setBusy(true)
    void (async () => {
      try {
        const icoPngs = await Promise.all(
          ICO_SIZES.map(async (size) => ({
            size,
            png: await rasterizeToPng(source, size, null),
          })),
        )
        const pngs = await Promise.all(
          PNG_OUTPUTS.map(async (output) => ({
            name: output.name,
            bytes: await rasterizeToPng(
              source,
              output.size,
              output.opaque ? appleBackground : null,
            ),
          })),
        )
        if (cancelled) return

        const generated: GeneratedFile[] = [
          {
            name: "favicon.ico",
            bytes: encodeIco(icoPngs),
            previewUrl: null,
          },
          ...pngs.map((png) => ({
            name: png.name,
            bytes: png.bytes,
            previewUrl: URL.createObjectURL(
              new Blob([png.bytes.slice().buffer], { type: "image/png" }),
            ),
          })),
        ]
        if (source.isSvg && source.svgText) {
          generated.push({
            name: "favicon.svg",
            bytes: new TextEncoder().encode(source.svgText),
            previewUrl: null,
          })
        }
        setFiles((previous) => {
          previous.forEach((file) => {
            if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
          })
          return generated
        })
        setError(null)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not generate icons")
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, appleBackground])

  const allFiles = useMemo(() => {
    if (files.length === 0) return []
    return [
      ...files,
      {
        name: "site.webmanifest",
        bytes: new TextEncoder().encode(
          buildManifest(siteName, shortName, appleBackground),
        ),
        previewUrl: null,
      },
    ]
  }, [files, siteName, shortName, appleBackground])

  const linkSnippet = useMemo(
    () => buildLinkSnippet(Boolean(source?.isSvg)),
    [source?.isSvg],
  )

  const handleDownloadZip = () => {
    const entries = Object.fromEntries(
      allFiles.map((file) => [file.name, [file.bytes, { level: 0 }] as const]),
    )
    const zipped = zipSync(entries as Parameters<typeof zipSync>[0])
    downloadBlob(
      "favicons.zip",
      new Blob([zipped.slice().buffer], { type: "application/zip" }),
    )
  }

  const handleWriteToFolder = () => {
    setWriteMessage(null)
    setError(null)
    void (async () => {
      const dirPath = await window.orbitFiles?.pickDirectory()
      if (!dirPath) return
      setBusy(true)
      try {
        const payload = await Promise.all(
          allFiles.map(async (file) => ({
            name: file.name,
            dataBase64: await blobToBase64(
              new Blob([file.bytes.slice().buffer]),
            ),
          })),
        )
        const written = await writeBatchFiles(dirPath, payload)
        setWriteMessage(`Wrote ${written.length} files to ${dirPath}`)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not write files")
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="Favicon generator"
        description="One SVG or PNG in — favicon.ico, touch icons, web manifest, and link tags out."
        trailing={
          busy ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <DropZone
            label={
              source
                ? source.fileName
                : "Drop an SVG or PNG (ideally square, ≥512px)"
            }
            accept="image/svg+xml,image/png,.svg,.png"
            onFiles={(files) => {
              const file = files[0]
              if (file) void handleFile(file)
            }}
            icon={
              source ? (
                <img
                  src={source.objectUrl}
                  alt="Source icon"
                  className="size-16 object-contain"
                />
              ) : undefined
            }
          />

          <div className="space-y-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Site name
              </span>
              <Input
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="My Site"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Short name
              </span>
              <Input
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                placeholder="Site"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Apple-touch background
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="size-7 shrink-0 border border-border"
                  style={{ backgroundColor: appleBackground }}
                  aria-hidden
                />
                <Input
                  value={appleBackground}
                  onChange={(event) => setAppleBackground(event.target.value)}
                  className="font-mono"
                />
              </div>
            </label>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          >
            {error}
          </div>
        ) : null}
      </ToolSection>

      {source && files.length > 0 ? (
        <>
          <ToolSection
            title="Preview"
            description="Rendered at true pixel sizes on a checkerboard."
          >
            <div className="flex flex-wrap items-end gap-6">
              {PREVIEW_SIZES.map((size) => (
                <figure key={size} className="flex flex-col items-center gap-1.5">
                  <span
                    className="flex items-center justify-center border border-border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] p-2"
                  >
                    <img
                      src={source.objectUrl}
                      alt=""
                      width={size}
                      height={size}
                      style={{ width: size, height: size }}
                      className="object-contain"
                    />
                  </span>
                  <figcaption className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {size}px
                  </figcaption>
                </figure>
              ))}
            </div>
          </ToolSection>

          <ToolSection
            title="Output"
            trailing={
              <div className="flex items-center gap-1.5">
                {canWriteToDisk ? (
                  <Button
                    type="button"
                    variant="highlight"
                    size="sm"
                    disabled={busy}
                    onClick={handleWriteToFolder}
                  >
                    <FolderDown className="size-3.5" />
                    Write to folder…
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={handleDownloadZip}
                >
                  <Download className="size-3.5 text-muted-foreground" />
                  Download ZIP
                </Button>
              </div>
            }
          >
            {writeMessage ? (
              <p
                role="status"
                className="mb-2 border border-highlight/35 bg-highlight/10 px-2.5 py-1.5 text-[11px] text-foreground"
              >
                {writeMessage}
              </p>
            ) : null}
            <div>
              {allFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-b-0"
                >
                  {file.previewUrl ? (
                    <img
                      src={file.previewUrl}
                      alt=""
                      className="size-5 border border-border object-contain"
                    />
                  ) : (
                    <span className="size-5 border border-border bg-surface-2" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                    {file.name}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatBytes(file.bytes.length)}
                  </span>
                </div>
              ))}
            </div>
          </ToolSection>

          <ToolSection
            title="HTML boilerplate"
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Copy link tags"
                onClick={() => {
                  void navigator.clipboard.writeText(linkSnippet).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1200)
                  })
                }}
              >
                {copied ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Clipboard className="size-3.5" aria-hidden />
                )}
              </Button>
            }
          >
            <pre
              className={cn(
                "overflow-x-auto border border-border bg-surface-2/60 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90",
              )}
            >
              {linkSnippet}
            </pre>
          </ToolSection>
        </>
      ) : null}
    </div>
  )
}
