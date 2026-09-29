import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { cn } from "@/lib/utils"

const FLAGS = ["g", "i", "m", "s", "u", "y"] as const

const MAX_MATCHES = 1000

type Preset = { label: string; pattern: string; flags: string }

const PRESETS: Preset[] = [
  {
    label: "Email",
    pattern: String.raw`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`,
    flags: "g",
  },
  {
    label: "URL",
    pattern: String.raw`https?:\/\/[^\s"'<>]+`,
    flags: "g",
  },
  {
    label: "IPv4",
    pattern: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
    flags: "g",
  },
  {
    label: "ISO date",
    pattern: String.raw`\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])`,
    flags: "g",
  },
  {
    label: "Hex color",
    pattern: String.raw`#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b`,
    flags: "g",
  },
  {
    label: "Trailing whitespace",
    pattern: String.raw`[ \t]+$`,
    flags: "gm",
  },
]

type MatchInfo = {
  text: string
  index: number
  groups: { name: string; value: string | undefined }[]
}

function collectMatches(regex: RegExp, input: string): MatchInfo[] {
  const matches: MatchInfo[] = []
  const worker = new RegExp(
    regex.source,
    regex.flags.includes("g") ? regex.flags : `${regex.flags}g`,
  )
  let match: RegExpExecArray | null
  while ((match = worker.exec(input)) !== null) {
    const named = match.groups
      ? Object.entries(match.groups).map(([name, value]) => ({ name, value }))
      : []
    const numbered = match
      .slice(1)
      .map((value, index) => ({ name: `$${index + 1}`, value }))
    matches.push({
      text: match[0],
      index: match.index,
      groups: [...numbered, ...named],
    })
    if (match[0].length === 0) worker.lastIndex += 1
    if (matches.length >= MAX_MATCHES) break
    // Without the g flag only the first match is reported.
    if (!regex.flags.includes("g")) break
  }
  return matches
}

/**
 * Regular-expression tester: live match highlighting, group table, replace
 * preview, and a handful of common presets.
 */
export function RegexPage() {
  const [pattern, setPattern] = useState("")
  const [flags, setFlags] = useState<Set<string>>(new Set(["g"]))
  const [testText, setTestText] = useState("")
  const [mode, setMode] = useState<"match" | "replace">("match")
  const [replacement, setReplacement] = useState("")

  const toggleFlag = (flag: string) => {
    setFlags((current) => {
      const next = new Set(current)
      if (next.has(flag)) next.delete(flag)
      else next.add(flag)
      return next
    })
  }

  const result = useMemo(() => {
    if (!pattern) return null
    let regex: RegExp
    try {
      regex = new RegExp(pattern, [...flags].join(""))
    } catch (cause: unknown) {
      return {
        error: cause instanceof Error ? cause.message : "Invalid pattern",
      }
    }
    const matches = collectMatches(regex, testText)
    let replaced: string | null = null
    if (mode === "replace") {
      try {
        replaced = testText.replace(regex, replacement)
      } catch (cause: unknown) {
        return {
          error: cause instanceof Error ? cause.message : "Replace failed",
        }
      }
    }
    return { matches, replaced }
  }, [pattern, flags, testText, mode, replacement])

  const matches = useMemo(
    () => (result && "matches" in result ? (result.matches ?? []) : []),
    [result],
  )
  const hasGroups = matches.some((match) => match.groups.length > 0)

  // Split the test text into plain/highlighted segments.
  const segments = useMemo(() => {
    if (matches.length === 0) return null
    const parts: { text: string; hit: boolean }[] = []
    let cursor = 0
    for (const match of matches) {
      if (match.index > cursor) {
        parts.push({ text: testText.slice(cursor, match.index), hit: false })
      }
      parts.push({ text: match.text, hit: true })
      cursor = match.index + match.text.length
    }
    if (cursor < testText.length) {
      parts.push({ text: testText.slice(cursor), hit: false })
    }
    return parts
  }, [matches, testText])

  return (
    <div className="space-y-4">
      <ToolSection
        title="Regex tester"
        description="Test JavaScript regular expressions with live highlighting, groups, and replace preview."
        trailing={
          <SegmentedControl
            options={[
              { value: "match", label: "Match" },
              { value: "replace", label: "Replace" },
            ]}
            value={mode}
            onValueChange={setMode}
          />
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-64 flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Pattern
              </span>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-muted-foreground">/</span>
                <Input
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  placeholder={String.raw`(\w+)@(\w+\.\w+)`}
                  className="font-mono"
                  spellCheck={false}
                  autoFocus
                />
                <span className="text-muted-foreground">
                  /{[...flags].join("")}
                </span>
              </div>
            </label>
            <div className="flex h-8 items-center gap-3 border border-border px-2.5">
              {FLAGS.map((flag) => (
                <label
                  key={flag}
                  className="flex cursor-pointer items-center gap-1"
                  title={`Flag ${flag}`}
                >
                  <Checkbox
                    checked={flags.has(flag)}
                    onCheckedChange={() => toggleFlag(flag)}
                    aria-label={`Flag ${flag}`}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {flag}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Presets
            </span>
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setPattern(preset.pattern)
                  setFlags(new Set(preset.flags.split("")))
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {mode === "replace" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Replacement{" "}
                <span className="normal-case text-muted-foreground/60">
                  ($1, $&lt;name&gt;, $& supported)
                </span>
              </span>
              <Input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                className="font-mono"
                spellCheck={false}
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Test text
            </span>
            <Textarea
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
              rows={6}
              placeholder="Paste text to test against…"
              spellCheck={false}
            />
          </label>

          {result && "error" in result ? (
            <p className="text-[11px] text-destructive">{result.error}</p>
          ) : null}
        </div>
      </ToolSection>

      {pattern && testText && result && !("error" in result) ? (
        <>
          <ToolSection
            title={mode === "replace" ? "Result" : "Highlighted"}
            trailing={
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {matches.length}
                {matches.length >= MAX_MATCHES ? "+" : ""} match
                {matches.length === 1 ? "" : "es"}
              </span>
            }
          >
            {mode === "replace" ? (
              <pre className="max-h-80 overflow-auto border border-border bg-surface-2/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                {result.replaced}
              </pre>
            ) : segments ? (
              <pre className="max-h-80 overflow-auto border border-border bg-surface-2/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                {segments.map((segment, index) =>
                  segment.hit ? (
                    <mark
                      key={index}
                      className="bg-highlight/25 text-highlight"
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </pre>
            ) : (
              <p className="text-[11px] text-muted-foreground">No matches.</p>
            )}
          </ToolSection>

          {matches.length > 0 ? (
            <ToolSection title="Matches">
              <div className="max-h-80 overflow-auto border border-border">
                <div
                  className={cn(
                    "sticky top-0 z-10 grid border-b border-border bg-card text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
                    hasGroups
                      ? "grid-cols-[3rem_1fr_5rem_1fr]"
                      : "grid-cols-[3rem_1fr_5rem]",
                  )}
                >
                  <span className="px-2 py-1.5">#</span>
                  <span className="px-2 py-1.5">Match</span>
                  <span className="px-2 py-1.5">Index</span>
                  {hasGroups ? <span className="px-2 py-1.5">Groups</span> : null}
                </div>
                {matches.map((match, index) => (
                  <div
                    key={`${match.index}-${index}`}
                    className={cn(
                      "grid border-b border-border/40 font-mono text-[11px]",
                      hasGroups
                        ? "grid-cols-[3rem_1fr_5rem_1fr]"
                        : "grid-cols-[3rem_1fr_5rem]",
                      index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
                    )}
                  >
                    <span className="px-2 py-1 tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="truncate px-2 py-1 text-foreground" title={match.text}>
                      {match.text}
                    </span>
                    <span className="px-2 py-1 tabular-nums text-muted-foreground">
                      {match.index}
                    </span>
                    {hasGroups ? (
                      <span className="truncate px-2 py-1 text-muted-foreground">
                        {match.groups
                          .map((group) => `${group.name}=${group.value ?? "∅"}`)
                          .join("  ")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </ToolSection>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
