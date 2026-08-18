import { Check, Clipboard } from "lucide-react"
import { useMemo, useState } from "react"
import {
  converter,
  formatHex,
  formatHsl,
  formatRgb,
  parse,
  type Rgb,
} from "culori"

import { Input } from "@/components/ui/input"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const toRgb = converter("rgb")
const toOklch = converter("oklch")

type ParsedColor = {
  input: string
  rgb: Rgb
  hex: string
  rgbCss: string
  hslCss: string
  oklchCss: string
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function parseColor(input: string): ParsedColor | null {
  const parsed = parse(input.trim())
  if (!parsed) return null
  const rgb = toRgb(parsed)
  if (!rgb) return null
  const oklch = toOklch(parsed)
  const oklchCss = oklch
    ? `oklch(${round(oklch.l ?? 0, 4)} ${round(oklch.c ?? 0, 4)} ${round(oklch.h ?? 0, 2)})`
    : "—"
  return {
    input: input.trim(),
    rgb,
    hex: formatHex(rgb) ?? "—",
    rgbCss: formatRgb(rgb) ?? "—",
    hslCss: formatHsl(rgb) ?? "—",
    oklchCss,
  }
}

/** WCAG 2.1 relative luminance from gamma-encoded sRGB channels. */
function relativeLuminance(rgb: Rgb): number {
  const linearize = (channel: number) => {
    const c = Math.min(Math.max(channel, 0), 1)
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  )
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG contrast checker and CSS color format converter (culori-backed).
 */
export function ContrastPage() {
  const [fgInput, setFgInput] = useState("#1a1a1a")
  const [bgInput, setBgInput] = useState("#ffffff")

  const fg = useMemo(() => parseColor(fgInput), [fgInput])
  const bg = useMemo(() => parseColor(bgInput), [bgInput])
  const ratio = fg && bg ? contrastRatio(fg.rgb, bg.rgb) : null

  return (
    <div className="max-w-3xl space-y-4">
      <ToolSection
        title="Contrast checker"
        description="WCAG 2.1 contrast ratio for any two CSS colors — hex, rgb(), hsl(), oklch(), named."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField
            label="Foreground"
            value={fgInput}
            onChange={setFgInput}
            color={fg}
          />
          <ColorField
            label="Background"
            value={bgInput}
            onChange={setBgInput}
            color={bg}
          />
        </div>

        <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center justify-center border border-border bg-surface px-6 py-4">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Ratio
            </span>
            <span className="font-mono text-3xl font-medium tabular-nums text-foreground">
              {ratio !== null ? `${round(ratio, 2)}:1` : "—"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <WcagBadge label="AA · Normal" pass={ratio !== null && ratio >= 4.5} />
            <WcagBadge label="AAA · Normal" pass={ratio !== null && ratio >= 7} />
            <WcagBadge label="AA · Large" pass={ratio !== null && ratio >= 3} />
            <WcagBadge label="AAA · Large" pass={ratio !== null && ratio >= 4.5} />
          </div>
        </div>

        {fg && bg ? (
          <div
            className="mt-3 space-y-1 border border-border px-4 py-4"
            style={{ backgroundColor: bg.hex }}
          >
            <p style={{ color: fg.hex, fontSize: 14 }}>
              Normal text — The quick brown fox jumps over the lazy dog.
            </p>
            <p style={{ color: fg.hex, fontSize: 24 }}>Large text — 24px sample</p>
          </div>
        ) : null}
      </ToolSection>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Foreground formats", color: fg },
          { title: "Background formats", color: bg },
        ].map(({ title, color }) => (
          <ToolSection key={title} title={title}>
            {color ? (
              <div>
                <FormatRow label="HEX" value={color.hex} />
                <FormatRow label="RGB" value={color.rgbCss} />
                <FormatRow label="HSL" value={color.hslCss} />
                <FormatRow label="OKLCH" value={color.oklchCss} />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Enter a valid CSS color.
              </p>
            )}
          </ToolSection>
        ))}
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  color: ParsedColor | null
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-8 shrink-0 border border-border",
            !color && "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--border)_3px,var(--border)_6px)]",
          )}
          style={color ? { backgroundColor: color.hex } : undefined}
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#333, rgb(…), oklch(…)"
          aria-invalid={value.trim() !== "" && !color}
          className="font-mono"
        />
      </div>
    </label>
  )
}

function WcagBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-between gap-2 border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em]",
        pass
          ? "border-success/40 bg-success/10 text-success"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {label}
      <span className="font-mono">{pass ? "PASS" : "FAIL"}</span>
    </span>
  )
}

function FormatRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <code className="truncate font-mono text-[11px] text-foreground">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${label} value`}
        disabled={value === "—"}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? (
          <Check className="size-3 text-success" aria-hidden />
        ) : (
          <Clipboard className="size-3" aria-hidden />
        )}
      </Button>
    </div>
  )
}
