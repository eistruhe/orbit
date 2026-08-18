import { Check, Clipboard } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToolSection } from "@/components/orbit/tools/tool-section"

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null
  const n = Number(value.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function toRem(px: number, root: number): string {
  const value = px / root
  const fixed = value.toFixed(4)
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
}

function formatNumber(value: number, decimals = 4): string {
  const fixed = value.toFixed(decimals)
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
}

type ClampResult = {
  css: string
  slope: number
  interceptPx: number
  loPx: number
  hiPx: number
}

function computeClamp(
  minVw: number,
  maxVw: number,
  minSize: number,
  maxSize: number,
  root: number,
): ClampResult | { error: string } {
  if (root <= 0) return { error: "Root font size must be positive." }
  if (minVw <= 0 || maxVw <= 0) return { error: "Viewport widths must be positive." }
  if (minVw >= maxVw) {
    return { error: "Min viewport must be smaller than max viewport." }
  }

  const slope = (maxSize - minSize) / (maxVw - minVw)
  const interceptPx = minSize - slope * minVw
  const loPx = Math.min(minSize, maxSize)
  const hiPx = Math.max(minSize, maxSize)

  const slopeVw = formatNumber(slope * 100)
  const interceptRem = toRem(interceptPx, root)
  const css = `clamp(${toRem(loPx, root)}rem, ${interceptRem}rem + ${slopeVw}vw, ${toRem(hiPx, root)}rem)`
  return { css, slope, interceptPx, loPx, hiPx }
}

/**
 * Fluid typography calculator: linear interpolation between two
 * viewport/size pairs expressed as a CSS clamp().
 */
export function ClampPage() {
  const [minVwInput, setMinVwInput] = useState("375")
  const [maxVwInput, setMaxVwInput] = useState("1440")
  const [minSizeInput, setMinSizeInput] = useState("16")
  const [maxSizeInput, setMaxSizeInput] = useState("24")
  const [rootInput, setRootInput] = useState("16")
  const [previewVw, setPreviewVw] = useState(768)
  const [copied, setCopied] = useState(false)

  const result = useMemo(() => {
    const minVw = parseNumber(minVwInput)
    const maxVw = parseNumber(maxVwInput)
    const minSize = parseNumber(minSizeInput)
    const maxSize = parseNumber(maxSizeInput)
    const root = parseNumber(rootInput) ?? 16
    if (minVw === null || maxVw === null || minSize === null || maxSize === null) {
      return { error: "Fill in all four values." }
    }
    return computeClamp(minVw, maxVw, minSize, maxSize, root)
  }, [minVwInput, maxVwInput, minSizeInput, maxSizeInput, rootInput])

  const previewPx = useMemo(() => {
    if ("error" in result) return null
    const raw = result.interceptPx + result.slope * previewVw
    return Math.min(Math.max(raw, result.loPx), result.hiPx)
  }, [result, previewVw])

  const handleCopy = useCallback(async () => {
    if ("error" in result) return
    try {
      await navigator.clipboard.writeText(result.css)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }, [result])

  return (
    <div className="max-w-3xl space-y-4">
      <ToolSection
        title="clamp() calculator"
        description="Fluid values that scale between two viewport widths — typography, spacing, anything in px."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup label="Viewport">
            <LabeledInput
              label="Min"
              value={minVwInput}
              onChange={setMinVwInput}
              unit="px"
            />
            <LabeledInput
              label="Max"
              value={maxVwInput}
              onChange={setMaxVwInput}
              unit="px"
            />
          </FieldGroup>
          <FieldGroup label="Size">
            <LabeledInput
              label="Min"
              value={minSizeInput}
              onChange={setMinSizeInput}
              unit="px"
            />
            <LabeledInput
              label="Max"
              value={maxSizeInput}
              onChange={setMaxSizeInput}
              unit="px"
            />
          </FieldGroup>
        </div>

        <div className="mt-3 flex items-center gap-2 border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.06em]">Root font-size</span>
          <Input
            type="text"
            inputMode="decimal"
            value={rootInput}
            onChange={(event) => setRootInput(event.target.value)}
            aria-label="Root font size in pixels"
            className="h-7 w-20 text-center font-mono"
          />
          <span className="text-muted-foreground/80">px</span>
          <span
            className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70"
            aria-hidden
          >
            size = intercept + slope · vw
          </span>
        </div>

        <div className="mt-4">
          {"error" in result ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {result.error}
            </div>
          ) : (
            <div className="flex items-center gap-2 border border-border bg-surface px-3 py-3">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-highlight">
                {result.css}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleCopy()}
                aria-label="Copy clamp() value"
              >
                {copied ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Clipboard className="size-3.5" aria-hidden />
                )}
              </Button>
            </div>
          )}
        </div>
      </ToolSection>

      {!("error" in result) ? (
        <ToolSection
          title="Preview"
          description="Drag to simulate the viewport width."
        >
          <div className="flex items-center gap-3">
            <Slider
              value={previewVw}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value
                if (typeof next === "number") setPreviewVw(next)
              }}
              min={240}
              max={1920}
              step={1}
              aria-label="Preview viewport width"
              className="flex-1"
            />
            <span className="w-24 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {previewVw}px vw
            </span>
            <span className="w-24 text-right font-mono text-[11px] tabular-nums text-foreground">
              {previewPx !== null ? `${formatNumber(previewPx, 2)}px` : "—"}
            </span>
          </div>
          <div className="mt-3 overflow-hidden border border-border bg-surface-2/40 px-3 py-4">
            <p
              className="truncate text-foreground"
              style={{ fontSize: previewPx ?? undefined }}
            >
              The quick brown fox jumps over the lazy dog
            </p>
          </div>
        </ToolSection>
      ) : null}
    </div>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-2 border border-border bg-surface-2/30 p-3">
      <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  unit,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  unit: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-8 font-mono"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground">
          {unit}
        </span>
      </div>
    </label>
  )
}
