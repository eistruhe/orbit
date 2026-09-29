import "react-image-crop/dist/ReactCrop.css"

import {
  Check,
  Clipboard,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { DropZone } from "@/components/orbit/drop-zone"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { decodeImageFile, downloadBlob } from "@/lib/image-encode"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"]

type ExportFormat = "png" | "jpeg" | "webp"

type AspectPreset = {
  label: string
  aspect: number | undefined
  circular?: boolean
}

const ASPECT_PRESETS: AspectPreset[] = [
  { label: "Free", aspect: undefined },
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "16:9", aspect: 16 / 9 },
  { label: "9:16", aspect: 9 / 16 },
  { label: "Circle", aspect: 1, circular: true },
]

function buildInitialCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number | undefined,
): Crop {
  if (!aspect) return { unit: "%", x: 5, y: 5, width: 90, height: 90 }
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  )
}

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".")
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName
}

/**
 * Interactive image cropper: fixed or free aspect ratios, circular mask,
 * 90° rotation and flipping, exports PNG/JPEG/WebP entirely client-side.
 */
export function ImageCropPage() {
  const [sourceBitmap, setSourceBitmap] = useState<ImageBitmap | null>(null)
  const [baseName, setBaseName] = useState("image")
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [bakedUrl, setBakedUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [presetIndex, setPresetIndex] = useState(0)
  const [format, setFormat] = useState<ExportFormat>("png")
  const [quality, setQuality] = useState(90)
  const [outputSize, setOutputSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const preset = ASPECT_PRESETS[presetIndex]
  const circular = Boolean(preset.circular)

  const loadFile = useCallback(async (file: File) => {
    setError(null)
    try {
      const bitmap = await decodeImageFile(file)
      setSourceBitmap((previous) => {
        previous?.close()
        return bitmap
      })
      setBaseName(stripExtension(file.name) || "image")
      setRotation(0)
      setFlipH(false)
      setFlipV(false)
      setCrop(undefined)
      setCompletedCrop(undefined)
      setOutputSize(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not load image")
    }
  }, [])

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = Array.from(files).find((entry) =>
        ACCEPTED_TYPES.includes(entry.type),
      )
      if (file) void loadFile(file)
    },
    [loadFile],
  )

  // Paste an image (e.g. a screenshot) from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      )
      if (file) {
        event.preventDefault()
        void loadFile(file)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [loadFile])

  // Bake rotation/flip into the displayed source so crop math stays axis-aligned.
  useEffect(() => {
    if (!sourceBitmap) return
    let cancelled = false
    const bake = async () => {
      const swapped = rotation % 180 !== 0
      const width = swapped ? sourceBitmap.height : sourceBitmap.width
      const height = swapped ? sourceBitmap.width : sourceBitmap.height
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d")
      if (!context) return
      context.translate(width / 2, height / 2)
      context.rotate((rotation * Math.PI) / 180)
      context.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      context.drawImage(
        sourceBitmap,
        -sourceBitmap.width / 2,
        -sourceBitmap.height / 2,
      )
      const blob = await canvas.convertToBlob({ type: "image/png" })
      if (cancelled) return
      const url = URL.createObjectURL(blob)
      setCrop(undefined)
      setCompletedCrop(undefined)
      setOutputSize(null)
      setBakedUrl(url)
    }
    void bake()
    return () => {
      cancelled = true
    }
  }, [sourceBitmap, rotation, flipH, flipV])

  useEffect(
    () => () => {
      sourceBitmap?.close()
    },
    [sourceBitmap],
  )

  // Revoke each object URL once it is replaced (or on unmount).
  useEffect(() => {
    if (!bakedUrl) return
    return () => URL.revokeObjectURL(bakedUrl)
  }, [bakedUrl])

  const onImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = event.currentTarget
      setCrop(buildInitialCrop(width, height, preset.aspect))
    },
    [preset.aspect],
  )

  const selectPreset = (index: number) => {
    setPresetIndex(index)
    const next = ASPECT_PRESETS[index]
    if (next.circular && format === "jpeg") setFormat("png")
    const image = imgRef.current
    if (image) setCrop(buildInitialCrop(image.width, image.height, next.aspect))
  }

  const clearImage = () => {
    setSourceBitmap((previous) => {
      previous?.close()
      return null
    })
    setBakedUrl(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setOutputSize(null)
    setError(null)
  }

  const onCropComplete = useCallback((pixelCrop: PixelCrop) => {
    setCompletedCrop(pixelCrop)
    const image = imgRef.current
    if (!image || pixelCrop.width < 1) {
      setOutputSize(null)
      return
    }
    setOutputSize({
      width: Math.round(pixelCrop.width * (image.naturalWidth / image.width)),
      height: Math.round(
        pixelCrop.height * (image.naturalHeight / image.height),
      ),
    })
  }, [])

  const renderCrop = useCallback(
    async (target: ExportFormat): Promise<Blob | null> => {
      const image = imgRef.current
      if (!image || !completedCrop || completedCrop.width < 1) return null
      const scaleX = image.naturalWidth / image.width
      const scaleY = image.naturalHeight / image.height
      const width = Math.max(1, Math.round(completedCrop.width * scaleX))
      const height = Math.max(1, Math.round(completedCrop.height * scaleY))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d")
      if (!context) return null
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
      context.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        width,
        height,
      )
      if (circular) {
        context.globalCompositeOperation = "destination-in"
        context.beginPath()
        context.ellipse(
          width / 2,
          height / 2,
          width / 2,
          height / 2,
          0,
          0,
          Math.PI * 2,
        )
        context.fill()
      }
      const type =
        target === "png"
          ? "image/png"
          : target === "jpeg"
            ? "image/jpeg"
            : "image/webp"
      return canvas.convertToBlob({
        type,
        quality: target === "png" ? undefined : quality / 100,
      })
    },
    [completedCrop, circular, quality],
  )

  const download = async () => {
    const blob = await renderCrop(format)
    if (!blob) return
    const extension = format === "jpeg" ? "jpg" : format
    downloadBlob(`${baseName}-crop.${extension}`, blob)
  }

  const copyToClipboard = async () => {
    const blob = await renderCrop("png")
    if (!blob) return
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ])
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const hasCrop = Boolean(outputSize)

  return (
    <div className="space-y-4">
      <ToolSection
        title="Image cropper"
        description="Crop interactively with resize handles — fixed ratios, free form, or a circular mask. Rotate and flip before cropping."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Aspect
            </span>
            <SegmentedControl
              options={ASPECT_PRESETS.map((entry, index) => ({
                value: String(index),
                label: entry.label,
              }))}
              value={String(presetIndex)}
              onValueChange={(value) => selectPreset(Number(value))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Transform
            </span>
            <div className="flex h-8 items-center border border-border px-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!sourceBitmap}
                aria-label="Rotate counter-clockwise"
                onClick={() => setRotation((value) => (value + 270) % 360)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!sourceBitmap}
                aria-label="Rotate clockwise"
                onClick={() => setRotation((value) => (value + 90) % 360)}
              >
                <RotateCw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!sourceBitmap}
                aria-label="Flip horizontally"
                onClick={() => setFlipH((value) => !value)}
              >
                <FlipHorizontal2
                  className={cn("size-3.5", flipH && "text-highlight")}
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!sourceBitmap}
                aria-label="Flip vertically"
                onClick={() => setFlipV((value) => !value)}
              >
                <FlipVertical2
                  className={cn("size-3.5", flipV && "text-highlight")}
                />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Format
            </span>
            <SegmentedControl
              options={(["png", "jpeg", "webp"] as const).map((value) => {
                const disabled = circular && value === "jpeg"
                return {
                  value,
                  label: value,
                  disabled,
                  title: disabled
                    ? "JPEG has no transparency — circle crops need PNG or WebP"
                    : undefined,
                }
              })}
              value={format}
              onValueChange={setFormat}
            />
          </div>

          {format !== "png" ? (
            <div className="flex min-w-40 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Quality ·{" "}
                <span className="font-mono tabular-nums">{quality}</span>
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
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-destructive">{error}</p>
        ) : null}

        {!bakedUrl ? (
          <DropZone
            className="mt-4"
            label="Drop an image, click to choose, or paste from clipboard"
            hint="PNG · JPG · WebP"
            accept={ACCEPTED_TYPES.join(",")}
            onFiles={handleFiles}
          />
        ) : (
          <>
            <div className="mt-4 flex justify-center border border-border bg-surface-2/40 p-3 [&_.ReactCrop]:max-w-full">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={onCropComplete}
                aspect={preset.aspect}
                circularCrop={circular}
                keepSelection
                minWidth={16}
                minHeight={16}
              >
                <img
                  ref={imgRef}
                  src={bakedUrl}
                  alt="Crop source"
                  onLoad={onImageLoad}
                  className="max-h-[62vh] w-auto max-w-full select-none"
                  draggable={false}
                />
              </ReactCrop>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-foreground">
                {baseName}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {outputSize
                  ? `output ${outputSize.width}×${outputSize.height}`
                  : "drag to select a crop"}
              </span>
              <span className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!hasCrop}
                onClick={() => void copyToClipboard()}
              >
                {copied ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Clipboard className="size-3 text-muted-foreground" />
                )}
                Copy PNG
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!hasCrop}
                onClick={() => void download()}
              >
                <Download className="size-3 text-muted-foreground" />
                Download {format === "jpeg" ? "jpg" : format}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={clearImage}
              >
                <Trash2 className="size-3 text-muted-foreground" />
                Clear
              </Button>
            </div>
          </>
        )}
      </ToolSection>
    </div>
  )
}
