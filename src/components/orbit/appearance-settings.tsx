import { Image as ImageIcon, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { DropZone } from "@/components/orbit/drop-zone"
import { SegmentedControl, type SegmentedOption } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  getAppearance,
  MIN_PANEL_OPACITY,
  resetAppearance,
  updateAppearance,
  updateBackdrop,
  useAppearance,
  type BackdropEffect,
  type BackdropPalette,
  type ContentLayout,
  type SurfaceMode,
} from "@/lib/appearance"
import {
  deleteBackdropImage,
  loadBackdropImage,
  saveBackdropImage,
} from "@/lib/backdrop-image-store"

const LAYOUT_OPTIONS: SegmentedOption<ContentLayout>[] = [
  { value: "centered", label: "Centered" },
  { value: "left", label: "Left" },
  { value: "full", label: "Full width" },
]

const SURFACE_OPTIONS: SegmentedOption<SurfaceMode>[] = [
  { value: "opaque", label: "Opaque", title: "Solid panels" },
  { value: "tinted", label: "Tinted", title: "Translucent panels, background stays sharp" },
  { value: "frosted", label: "Frosted", title: "Translucent panels with background blur" },
]

const EFFECT_OPTIONS: SegmentedOption<BackdropEffect>[] = [
  { value: "none", label: "None" },
  { value: "dither", label: "Dither" },
  { value: "halftone", label: "Halftone" },
  { value: "pixelate", label: "Pixelate" },
  { value: "grain", label: "Grain" },
]

const PALETTE_OPTIONS: SegmentedOption<BackdropPalette>[] = [
  { value: "color", label: "Color" },
  { value: "mono", label: "Mono" },
  { value: "duotone", label: "Duotone", title: "Black and the Orbit highlight color" },
]

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

type SliderRowProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

function SliderRow({ label, value, min, max, step = 1, unit = "", disabled, onChange }: SliderRowProps) {
  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-3">
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={(next) => {
            const resolved = Array.isArray(next) ? next[0] : next
            if (typeof resolved === "number") onChange(resolved)
          }}
        />
        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-foreground">
          {value}
          {unit}
        </span>
      </div>
    </FieldRow>
  )
}

/** Object URL preview of the stored backdrop image. */
function useStoredImagePreview(version: number | null) {
  const [preview, setPreview] = useState<{ version: number; url: string } | null>(null)

  useEffect(() => {
    if (version === null) return
    let cancelled = false
    let objectUrl: string | null = null
    void loadBackdropImage().then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setPreview({ version, url: objectUrl })
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [version])

  return preview && preview.version === version ? preview.url : null
}

/**
 * Appearance settings: content alignment, panel surfaces, and the optional
 * background image with effect. Changes apply instantly and are stored on
 * this machine (localStorage + IndexedDB), independent of "Save settings".
 */
export function AppearanceSettings() {
  const appearance = useAppearance()
  const { backdrop, image } = appearance
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const previewUrl = useStoredImagePreview(image?.updatedAt ?? null)

  const storeImage = async (files: FileList) => {
    const file = Array.from(files).find((entry) => entry.type.startsWith("image/"))
    if (!file) {
      setError("Choose an image file (PNG, JPG, WebP, …).")
      return
    }
    try {
      setBusy(true)
      setError(null)
      await saveBackdropImage(file)
      updateAppearance({
        image: { name: file.name, updatedAt: Date.now() },
        // Opaque panels would hide the new image almost entirely.
        ...(getAppearance().surface === "opaque" ? { surface: "tinted" as const } : {}),
      })
    } catch (storeError) {
      setError(storeError instanceof Error ? storeError.message : "Could not store the image.")
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async () => {
    try {
      setBusy(true)
      setError(null)
      await deleteBackdropImage()
      updateAppearance({ image: null })
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove the image.")
    } finally {
      setBusy(false)
    }
  }

  const hasEffect = backdrop.effect !== "none"

  return (
    <ToolSection
      title="Appearance"
      description="Layout, panel surfaces, and background image. Applies instantly and is stored on this machine."
      footer={
        <Button type="button" variant="outline" size="sm" onClick={resetAppearance}>
          Reset appearance
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <FieldRow label="Content">
            <SegmentedControl
              options={LAYOUT_OPTIONS}
              value={appearance.layout}
              onValueChange={(layout) => updateAppearance({ layout })}
              className="w-fit"
            />
          </FieldRow>
          <FieldRow label="Panels">
            <SegmentedControl
              options={SURFACE_OPTIONS}
              value={appearance.surface}
              onValueChange={(surface) => updateAppearance({ surface })}
              className="w-fit"
            />
          </FieldRow>
          {appearance.surface !== "opaque" ? (
            <SliderRow
              label="Panel opacity"
              value={appearance.panelOpacity}
              min={MIN_PANEL_OPACITY}
              max={100}
              unit="%"
              onChange={(panelOpacity) => updateAppearance({ panelOpacity })}
            />
          ) : null}
          {appearance.surface === "frosted" ? (
            <SliderRow
              label="Blur"
              value={appearance.panelBlur}
              min={0}
              max={40}
              unit="px"
              onChange={(panelBlur) => updateAppearance({ panelBlur })}
            />
          ) : null}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <FieldRow label="Background">
            {image ? (
              <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden border border-border bg-surface-2">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="m-auto mt-3.5 size-4 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                  {image.name}
                </span>
                {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void removeImage()}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            <DropZone
              label={busy ? "Storing image…" : "Drop an image here or click to choose"}
              hint="Scaled to max. 2560 px and kept locally"
              accept="image/*"
              inputRef={inputRef}
              onFiles={(files) => void storeImage(files)}
              className={image ? "hidden" : "py-6"}
            />
          </FieldRow>

          {error ? (
            <p className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}

          {image ? (
            <>
              <FieldRow label="Effect">
                <SegmentedControl
                  options={EFFECT_OPTIONS}
                  value={backdrop.effect}
                  onValueChange={(effect) => updateBackdrop({ effect })}
                  className="w-fit"
                />
              </FieldRow>
              <FieldRow label="Palette">
                <SegmentedControl
                  options={PALETTE_OPTIONS}
                  value={backdrop.palette}
                  onValueChange={(palette) => updateBackdrop({ palette })}
                  className="w-fit"
                />
              </FieldRow>
              <SliderRow
                label="Cell size"
                value={backdrop.cellSize}
                min={1}
                max={12}
                disabled={!hasEffect}
                onChange={(cellSize) => updateBackdrop({ cellSize })}
              />
              <SliderRow
                label="Contrast"
                value={backdrop.contrast}
                min={50}
                max={200}
                unit="%"
                onChange={(contrast) => updateBackdrop({ contrast })}
              />
              <SliderRow
                label="Brightness"
                value={backdrop.brightness}
                min={30}
                max={170}
                unit="%"
                onChange={(brightness) => updateBackdrop({ brightness })}
              />
              <SliderRow
                label="Fade"
                value={backdrop.fade}
                min={0}
                max={100}
                unit="%"
                onChange={(fade) => updateBackdrop({ fade })}
              />
              <SliderRow
                label="Dim · light"
                value={backdrop.dimLight}
                min={0}
                max={95}
                unit="%"
                onChange={(dimLight) => updateBackdrop({ dimLight })}
              />
              <SliderRow
                label="Dim · dark"
                value={backdrop.dimDark}
                min={0}
                max={95}
                unit="%"
                onChange={(dimDark) => updateBackdrop({ dimDark })}
              />
            </>
          ) : null}
        </div>
      </div>
    </ToolSection>
  )
}
