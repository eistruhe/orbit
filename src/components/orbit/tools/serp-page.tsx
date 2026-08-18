import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { cn } from "@/lib/utils"

type Device = "desktop" | "mobile"

// Approximate Google truncation limits in pixels (Arial rendering).
const LIMITS: Record<Device, { title: number; description: number }> = {
  desktop: { title: 580, description: 990 },
  mobile: { title: 920, description: 1300 },
}

let measureContext: CanvasRenderingContext2D | null = null

function measureWidth(text: string, font: string): number {
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d")
  }
  if (!measureContext) return 0
  measureContext.font = font
  return Math.round(measureContext.measureText(text).width)
}

function breadcrumb(url: string): { domain: string; path: string } {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`)
    const segments = parsed.pathname.split("/").filter(Boolean)
    return {
      domain: parsed.hostname.replace(/^www\./, ""),
      path: segments.length > 0 ? ` › ${segments.join(" › ")}` : "",
    }
  } catch {
    return { domain: url || "example.com", path: "" }
  }
}

function LimitBar({
  label,
  pixels,
  limit,
  chars,
}: {
  label: string
  pixels: number
  limit: number
  chars: number
}) {
  const ratio = pixels / limit
  const tone =
    ratio > 1
      ? "bg-destructive"
      : ratio > 0.9
        ? "bg-highlight"
        : "bg-success"
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            ratio > 1 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {pixels} / {limit} px · {chars} chars
        </span>
      </div>
      <div className="h-1 w-full bg-border">
        <div
          className={cn("h-full transition-all", tone)}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Google SERP snippet preview with pixel-width measurement of title and
 * meta description against the (approximate) truncation limits.
 */
export function SerpPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [url, setUrl] = useState("")
  const [device, setDevice] = useState<Device>("desktop")

  const limits = LIMITS[device]
  const measurements = useMemo(
    () => ({
      title: measureWidth(title, "20px Arial"),
      description: measureWidth(description, "14px Arial"),
    }),
    [title, description],
  )
  const crumb = breadcrumb(url)

  const placeholderTitle = "Page title — brand"
  const placeholderDescription =
    "The meta description appears here. Around 155 characters usually fit before Google truncates with an ellipsis."

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="SERP preview"
        description="Preview a Google result snippet and check title/description pixel widths — limits are approximations."
        trailing={
          <SegmentedControl
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "mobile", label: "Mobile" },
            ]}
            value={device}
            onValueChange={setDevice}
          />
        }
      >
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Title
            </span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={placeholderTitle}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Meta description
            </span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder={placeholderDescription}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              URL
            </span>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/services/webdesign"
              className="font-mono"
            />
          </label>

          <div className="space-y-2 pt-1">
            <LimitBar
              label="Title width"
              pixels={measurements.title}
              limit={limits.title}
              chars={[...title].length}
            />
            <LimitBar
              label="Description width"
              pixels={measurements.description}
              limit={limits.description}
              chars={[...description].length}
            />
          </div>
        </div>
      </ToolSection>

      <ToolSection title="Preview">
        <div
          className={cn(
            "border border-border bg-card p-4",
            device === "mobile" ? "max-w-96" : "max-w-[600px]",
          )}
          style={{ fontFamily: "Arial, sans-serif" }}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px] text-muted-foreground">
              {crumb.domain.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 text-[12px] leading-tight">
              <span className="block truncate text-foreground">
                {crumb.domain}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {crumb.domain}
                {crumb.path}
              </span>
            </span>
          </div>
          <p
            className={cn(
              "mt-1.5 text-[20px] leading-6 text-[#1a0dab] dark:text-[#8ab4f8]",
              device === "desktop" ? "truncate" : "line-clamp-2",
            )}
          >
            {title || placeholderTitle}
          </p>
          <p className="mt-1 line-clamp-2 text-[14px] leading-[1.4] text-[#4d5156] dark:text-[#bdc1c6]">
            {description || placeholderDescription}
          </p>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          Rendering approximates Google's layout; actual truncation depends on
          the query and device.
        </p>
      </ToolSection>
    </div>
  )
}
