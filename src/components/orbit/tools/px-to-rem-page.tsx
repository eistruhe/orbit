import {
  ArrowLeftRight,
  Check,
  Clipboard,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToolSection } from "@/components/orbit/tools/tool-section"

const DEFAULT_BASE_PX = "16"

/**
 * Parses a numeric input string. Accepts both `,` and `.` as decimal separator
 * for input convenience; returns `null` for empty or non-finite values.
 * @param {string} value
 * @returns {number | null}
 */
function parseNumber(value: string): number | null {
  if (value.trim() === "") return null
  const normalized = value.replace(",", ".")
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * Formats a calculated number for display. Always uses a dot as the decimal
 * separator (locale-independent), trims trailing zeros, and rounds to 4
 * decimals to keep CSS-friendly values.
 * @param {number} value
 * @returns {string}
 */
function formatCalculated(value: number): string {
  if (!Number.isFinite(value)) return ""
  const fixed = value.toFixed(4)
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
}

type CopyTarget = "px" | "rem"

export function PxToRemPage() {
  const [pxInput, setPxInput] = useState<string>("")
  const [remInput, setRemInput] = useState<string>("")
  const [basePxInput, setBasePxInput] = useState<string>(DEFAULT_BASE_PX)
  const [copied, setCopied] = useState<CopyTarget | null>(null)

  const computeFromPx = useCallback((pxStr: string, baseStr: string) => {
    const px = parseNumber(pxStr)
    const base = parseNumber(baseStr) ?? 16
    if (px === null || base <= 0) {
      setRemInput("")
      return
    }
    setRemInput(formatCalculated(px / base))
  }, [])

  const computeFromRem = useCallback((remStr: string, baseStr: string) => {
    const rem = parseNumber(remStr)
    const base = parseNumber(baseStr) ?? 16
    if (rem === null || base <= 0) {
      setPxInput("")
      return
    }
    setPxInput(formatCalculated(rem * base))
  }, [])

  useEffect(() => {
    const initialPx = "16"
    setPxInput(initialPx)
    computeFromPx(initialPx, DEFAULT_BASE_PX)
  }, [computeFromPx])

  const handleCopy = useCallback(async (value: string, target: CopyTarget) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      window.setTimeout(() => {
        setCopied((current) => (current === target ? null : current))
      }, 1200)
    } catch {
      /* clipboard unavailable; fail silently */
    }
  }, [])

  const onPxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setPxInput(next)
    computeFromPx(next, basePxInput)
  }

  const onRemChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setRemInput(next)
    computeFromRem(next, basePxInput)
  }

  const onBaseChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setBasePxInput(next)
    computeFromPx(pxInput, next)
  }

  return (
    <ToolSection
      title="Px ↔ rem converter"
      description="Convert between pixels and rem with a configurable root font size."
      className="max-w-3xl"
    >
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <ConverterCard
          label="PX"
          unit="px"
          value={pxInput}
          onChange={onPxChange}
          accent={false}
          copied={copied === "px"}
          onCopy={() => handleCopy(pxInput, "px")}
        />

        <div className="hidden items-center justify-center text-muted-foreground sm:flex mt-[29px]">
          <ArrowLeftRight className="size-4" aria-hidden />
        </div>

        <ConverterCard
          label="REM"
          unit="rem"
          value={remInput}
          onChange={onRemChange}
          accent
          copied={copied === "rem"}
          onCopy={() => handleCopy(remInput, "rem")}
        />
      </div>

      <div className="mt-4 flex items-center gap-2 border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-[0.06em]">Root font-size</span>
        <Input
          type="text"
          inputMode="decimal"
          value={basePxInput}
          onChange={onBaseChange}
          aria-label="Root font size in pixels"
          className="h-7 w-20 text-center font-mono"
        />
        <span className="text-muted-foreground/80">px</span>
        <span
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70"
          aria-hidden
        >
          rem = px / base · px = rem * base
        </span>
      </div>
    </ToolSection>
  )
}

type ConverterCardProps = {
  label: string
  unit: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  accent: boolean
  copied: boolean
  onCopy: () => void
}

function ConverterCard({
  label,
  unit,
  value,
  onChange,
  accent,
  copied,
  onCopy,
}: ConverterCardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Copy ${label.toLowerCase()} value`}
          onClick={onCopy}
          disabled={!value}
        >
          {copied ? (
            <Check className="size-3 text-success" aria-hidden />
          ) : (
            <Clipboard className="size-3" aria-hidden />
          )}
        </Button>
      </div>
      <div className="relative border border-border bg-surface focus-within:border-foreground">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder="0"
          aria-label={`${label} value`}
          className={[
            "w-full border-none bg-transparent px-3 py-3 text-center font-mono text-3xl font-medium tabular-nums tracking-tight outline-none placeholder:text-muted-foreground/50",
            accent ? "text-highlight" : "text-foreground",
          ].join(" ")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  )
}
