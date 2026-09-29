import { Check, Clipboard } from "lucide-react"
import { useState } from "react"
import {
  converter,
  formatHex,
  formatHex8,
  formatHsl,
  formatRgb,
  parse,
} from "culori"
import type { Color } from "culori"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { cn } from "@/lib/utils"

const toRgb = converter("rgb")
const toHwb = converter("hwb")
const toLab = converter("lab")
const toLch = converter("lch")
const toOklab = converter("oklab")
const toOklch = converter("oklch")
const toP3 = converter("p3")

function round(value: number | undefined, decimals: number): string {
  if (value === undefined || Number.isNaN(value)) return "0"
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return String(rounded)
}

function alphaSuffix(color: Color): string {
  const alpha = color.alpha ?? 1
  return alpha < 1 ? ` / ${round(alpha, 3)}` : ""
}

type FormatDef = {
  id: string
  label: string
  format: (color: Color) => string
}

const FORMATS: FormatDef[] = [
  {
    id: "hex",
    label: "HEX",
    format: (color) =>
      (color.alpha ?? 1) < 1 ? formatHex8(color) : formatHex(color),
  },
  {
    id: "rgb",
    label: "RGB",
    format: (color) => formatRgb(color),
  },
  {
    id: "hsl",
    label: "HSL",
    format: (color) => formatHsl(color),
  },
  {
    id: "hwb",
    label: "HWB",
    format: (color) => {
      const hwb = toHwb(color)
      return `hwb(${round(hwb.h, 2)} ${round(hwb.w * 100, 2)}% ${round(hwb.b * 100, 2)}%${alphaSuffix(color)})`
    },
  },
  {
    id: "lab",
    label: "LAB",
    format: (color) => {
      const lab = toLab(color)
      return `lab(${round(lab.l, 2)}% ${round(lab.a, 3)} ${round(lab.b, 3)}${alphaSuffix(color)})`
    },
  },
  {
    id: "lch",
    label: "LCH",
    format: (color) => {
      const lch = toLch(color)
      return `lch(${round(lch.l, 2)}% ${round(lch.c, 3)} ${round(lch.h, 2)}${alphaSuffix(color)})`
    },
  },
  {
    id: "oklab",
    label: "OKLAB",
    format: (color) => {
      const oklab = toOklab(color)
      return `oklab(${round(oklab.l, 4)} ${round(oklab.a, 4)} ${round(oklab.b, 4)}${alphaSuffix(color)})`
    },
  },
  {
    id: "oklch",
    label: "OKLCH",
    format: (color) => {
      const oklch = toOklch(color)
      return `oklch(${round(oklch.l, 4)} ${round(oklch.c, 4)} ${round(oklch.h, 2)}${alphaSuffix(color)})`
    },
  },
  {
    id: "p3",
    label: "Display-P3",
    format: (color) => {
      const p3 = toP3(color)
      return `color(display-p3 ${round(p3.r, 4)} ${round(p3.g, 4)} ${round(p3.b, 4)}${alphaSuffix(color)})`
    },
  },
]

function buildValues(color: Color): Record<string, string> {
  return Object.fromEntries(FORMATS.map((def) => [def.id, def.format(color)]))
}

const INITIAL_COLOR = parse("#ff6b35") as Color

/**
 * Bidirectional color converter: every format row is editable; a valid value
 * in any syntax culori understands (including named colors) updates the rest.
 */
export function ColorConvertPage() {
  const [master, setMaster] = useState<Color>(INITIAL_COLOR)
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildValues(INITIAL_COLOR),
  )
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const applyColor = (color: Color, keepRawFor?: string, rawText?: string) => {
    setMaster(color)
    const next = buildValues(color)
    if (keepRawFor && rawText !== undefined) {
      next[keepRawFor] = rawText
    }
    setValues(next)
  }

  const handleEdit = (id: string, text: string) => {
    setValues((current) => ({ ...current, [id]: text }))
    const parsed = parse(text.trim())
    if (parsed) {
      // A valid edit rewrites every other field, so stale invalid flags go too.
      setInvalidIds(new Set())
      applyColor(parsed, id, text)
    } else {
      setInvalidIds((current) => new Set(current).add(id))
    }
  }

  const handleBlur = (id: string) => {
    if (invalidIds.has(id)) return
    setValues(buildValues(master))
  }

  const handleCopy = (id: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedId(id)
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1200,
      )
    })
  }

  const alpha = master.alpha ?? 1
  const rgb = toRgb(master)
  const swatchColor = formatRgb(master)
  const isDark = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b < 0.45

  return (
    <div className="space-y-4">
      <ToolSection
        title="Color converter"
        description="Paste or edit any format — HEX, RGB, HSL, HWB, LAB, LCH, OKLAB, OKLCH, Display-P3, or a named color — and the rest follow."
      >
        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div
              className="relative h-28 border border-border bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:14px_14px]"
              aria-hidden
            >
              <div
                className="absolute inset-0 flex items-end p-2"
                style={{ backgroundColor: swatchColor }}
              >
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    isDark ? "text-white/80" : "text-black/70",
                  )}
                >
                  {values.hex}
                </span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Picker
              <input
                type="color"
                value={formatHex(master)}
                onChange={(event) => {
                  const parsed = parse(event.target.value)
                  if (!parsed) return
                  parsed.alpha = alpha
                  setInvalidIds(new Set())
                  applyColor(parsed)
                }}
                className="h-7 w-full cursor-pointer border border-border bg-transparent p-0.5"
                aria-label="Native color picker"
              />
            </label>
            <div className="space-y-1">
              <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Alpha
                <span className="font-mono tabular-nums text-foreground">
                  {round(alpha * 100, 0)}%
                </span>
              </span>
              <Slider
                value={Math.round(alpha * 100)}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value
                  if (typeof next !== "number") return
                  const updated = { ...master, alpha: next / 100 }
                  setInvalidIds(new Set())
                  applyColor(updated)
                }}
                min={0}
                max={100}
                step={1}
                aria-label="Alpha"
              />
            </div>
          </div>

          <div>
            {FORMATS.map((def) => {
              const value = values[def.id] ?? ""
              const invalid = invalidIds.has(def.id)
              return (
                <div
                  key={def.id}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 py-1 last:border-b-0"
                >
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {def.label}
                  </span>
                  <Input
                    value={value}
                    onChange={(event) => handleEdit(def.id, event.target.value)}
                    onBlur={() => handleBlur(def.id)}
                    aria-label={`${def.label} value`}
                    aria-invalid={invalid}
                    spellCheck={false}
                    className="h-7 font-mono text-[11px]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Copy ${def.label} value`}
                    onClick={() => handleCopy(def.id, value)}
                    disabled={invalid}
                  >
                    {copiedId === def.id ? (
                      <Check className="size-3 text-success" aria-hidden />
                    ) : (
                      <Clipboard className="size-3" aria-hidden />
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-3 border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
          Wide-gamut values (LCH, OKLCH, Display-P3) can describe colors outside
          sRGB — HEX/RGB/HSL then show the nearest clipped color, so a round
          trip through them may shift slightly.
        </p>
      </ToolSection>
    </div>
  )
}
