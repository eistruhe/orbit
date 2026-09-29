import { Check, Clipboard, Undo2 } from "lucide-react"
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

  const slopeVw = formatNumber(Math.abs(slope * 100))
  const slopeSign = slope < 0 ? "-" : "+"
  const interceptRem = toRem(interceptPx, root)
  const css = `clamp(${toRem(loPx, root)}rem, ${interceptRem}rem ${slopeSign} ${slopeVw}vw, ${toRem(hiPx, root)}rem)`
  return { css, slope, interceptPx, loPx, hiPx }
}

type ParsedClamp = {
  minVw: number
  maxVw: number
  minSize: number
  maxSize: number
}

type ParseOutcome = ParsedClamp | { error: string }

/** Rounds to `decimals`, snapping to an integer when within `snap`. */
function tidy(value: number, decimals: number, snap: number): number {
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < snap) return rounded
  return Number(value.toFixed(decimals))
}

/**
 * Splits `input` on top-level commas, ignoring commas nested in parens
 * (e.g. inside a wrapped calc()).
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of input) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim())
}

/** Strips a single wrapping `calc( … )` if present. */
function unwrapCalc(input: string): string {
  const match = /^calc\((.*)\)$/i.exec(input.trim())
  return match ? match[1].trim() : input.trim()
}

/**
 * Sums the terms of a linear expression such as `0.8rem + 0.5vw` into a
 * pixel intercept and a slope (px per px of viewport width).
 */
function parseLinearExpression(
  input: string,
  root: number,
): { interceptPx: number; slope: number } | { error: string } {
  const compact = unwrapCalc(input).replace(/\s+/g, "")
  if (!compact) return { error: "Preferred value is empty." }

  const termPattern = /([+-]?)(\d*\.?\d+(?:e[+-]?\d+)?)([a-z%]*)/gi
  let consumed = ""
  let interceptPx = 0
  let slope = 0

  for (const match of compact.matchAll(termPattern)) {
    const [whole, sign, digits, unitRaw] = match
    consumed += whole
    const magnitude = Number(digits)
    if (!Number.isFinite(magnitude)) return { error: `Bad number "${digits}".` }
    const value = sign === "-" ? -magnitude : magnitude
    const unit = unitRaw.toLowerCase()

    if (unit === "vw" || unit === "vi") slope += value / 100
    else if (unit === "px") interceptPx += value
    else if (unit === "rem" || unit === "em") interceptPx += value * root
    else if (unit === "" && value === 0) {
      /* unitless zero is fine */
    } else return { error: `Unsupported unit "${unitRaw || "none"}" in "${whole}".` }
  }

  if (consumed !== compact) {
    return { error: "Preferred value must be like 0.8rem + 0.5vw." }
  }
  return { interceptPx, slope }
}

/** Parses a single length (px, rem, em, or unitless 0) into pixels. */
function parseLength(input: string, root: number): number | null {
  const match = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em)?$/i.exec(
    input.trim(),
  )
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const unit = (match[2] ?? "").toLowerCase()
  if (unit === "px") return value
  if (unit === "rem" || unit === "em") return value * root
  return value === 0 ? 0 : null
}

/**
 * Reverse-engineers a `clamp(min, intercept + slope·vw, max)` expression
 * back into the two viewport/size pairs that produce it.
 */
function parseClampExpression(input: string, root: number): ParseOutcome {
  const start = input.toLowerCase().indexOf("clamp(")
  if (start < 0) return { error: "No clamp( … ) found." }

  let depth = 0
  let end = -1
  for (let index = start + "clamp".length; index < input.length; index += 1) {
    const char = input[index]
    if (char === "(") depth += 1
    if (char === ")") {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end < 0) return { error: "Unbalanced parentheses in clamp()." }

  const inner = input.slice(start + "clamp(".length, end)
  const parts = splitTopLevel(inner)
  if (parts.length !== 3) {
    return { error: "clamp() needs exactly three comma-separated values." }
  }

  const minPx = parseLength(parts[0], root)
  const maxPx = parseLength(parts[2], root)
  if (minPx === null) return { error: `Cannot read min value "${parts[0]}".` }
  if (maxPx === null) return { error: `Cannot read max value "${parts[2]}".` }

  const preferred = parseLinearExpression(parts[1], root)
  if ("error" in preferred) return preferred
  if (preferred.slope === 0) {
    return { error: "Preferred value has no vw term, so there is no fluid range." }
  }

  const loPx = Math.min(minPx, maxPx)
  const hiPx = Math.max(minPx, maxPx)
  if (loPx === hiPx) {
    return { error: "Min and max are equal, so there is no fluid range." }
  }

  const vwAtLo = (loPx - preferred.interceptPx) / preferred.slope
  const vwAtHi = (hiPx - preferred.interceptPx) / preferred.slope
  const minVw = Math.min(vwAtLo, vwAtHi)
  const maxVw = Math.max(vwAtLo, vwAtHi)

  return {
    minVw: tidy(minVw, 2, 0.05),
    maxVw: tidy(maxVw, 2, 0.05),
    minSize: tidy(preferred.interceptPx + preferred.slope * minVw, 2, 0.01),
    maxSize: tidy(preferred.interceptPx + preferred.slope * maxVw, 2, 0.01),
  }
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
  const [pasteInput, setPasteInput] = useState("")
  const [pasteStatus, setPasteStatus] = useState<
    { kind: "ok"; parsed: ParsedClamp } | { kind: "error"; message: string } | null
  >(null)

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

  /**
   * Parses a pasted clamp() against the given root size and, on success,
   * fills the four fields with the recovered viewport/size pairs.
   */
  const fillFromClamp = useCallback((text: string, rootValue: string) => {
    if (text.trim() === "") {
      setPasteStatus(null)
      return
    }
    const root = parseNumber(rootValue) ?? 16
    const outcome = parseClampExpression(text, root)
    if ("error" in outcome) {
      setPasteStatus({ kind: "error", message: outcome.error })
      return
    }
    setMinVwInput(formatNumber(outcome.minVw, 2))
    setMaxVwInput(formatNumber(outcome.maxVw, 2))
    setMinSizeInput(formatNumber(outcome.minSize, 2))
    setMaxSizeInput(formatNumber(outcome.maxSize, 2))
    setPasteStatus({ kind: "ok", parsed: outcome })
  }, [])

  const applyPastedClamp = useCallback(
    (text: string) => {
      setPasteInput(text)
      fillFromClamp(text, rootInput)
    },
    [fillFromClamp, rootInput],
  )

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
    <div className="space-y-4">
      <ToolSection
        title="clamp() calculator"
        description="Fluid values that scale between two viewport widths — typography, spacing, anything in px."
      >
        <div className="mb-3 space-y-1.5 border border-dashed border-border-strong bg-surface-2/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Undo2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              Paste clamp()
            </span>
            <Input
              type="text"
              value={pasteInput}
              onChange={(event) => applyPastedClamp(event.target.value)}
              placeholder="clamp(1rem, 0.8235rem + 0.7529vw, 1.5rem)"
              aria-label="Paste an existing clamp() to fill the fields"
              spellCheck={false}
              className="h-7 flex-1 font-mono"
            />
            {pasteInput ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => applyPastedClamp("")}
              >
                Clear
              </Button>
            ) : null}
          </div>
          {pasteStatus?.kind === "ok" ? (
            <p className="font-mono text-[10px] text-success">
              Resolved: {formatNumber(pasteStatus.parsed.minSize, 2)}px @{" "}
              {formatNumber(pasteStatus.parsed.minVw, 2)}px →{" "}
              {formatNumber(pasteStatus.parsed.maxSize, 2)}px @{" "}
              {formatNumber(pasteStatus.parsed.maxVw, 2)}px
              <span className="text-muted-foreground"> (using the root font-size below)</span>
            </p>
          ) : pasteStatus?.kind === "error" ? (
            <p className="text-[10px] text-destructive">{pasteStatus.message}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground/80">
              Paste an existing value like <code>clamp(1rem, 0.5rem + 1.5vw, 2rem)</code> to
              reverse it into the fields below. px, rem and em are supported.
            </p>
          )}
        </div>

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
            onChange={(event) => {
              setRootInput(event.target.value)
              // A pasted clamp() in rem depends on the root size, so re-resolve it.
              fillFromClamp(pasteInput, event.target.value)
            }}
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
