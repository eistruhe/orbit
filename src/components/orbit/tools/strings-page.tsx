import { Check, Clipboard } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ToolSection } from "@/components/orbit/tools/tool-section"

const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
}

function transliterate(text: string): string {
  return text.replace(/[äöüÄÖÜß]/g, (char) => TRANSLITERATIONS[char] ?? char)
}

/** Splits into words on whitespace, punctuation, and camelCase boundaries. */
function tokenize(text: string): string[] {
  return transliterate(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .filter(Boolean)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

type Conversion = { id: string; label: string; convert: (text: string) => string }

const CONVERSIONS: Conversion[] = [
  {
    id: "slug",
    label: "Slug",
    convert: (text) => tokenize(text).join("-").toLowerCase(),
  },
  {
    id: "camel",
    label: "camelCase",
    convert: (text) =>
      tokenize(text)
        .map((word, index) =>
          index === 0 ? word.toLowerCase() : capitalize(word),
        )
        .join(""),
  },
  {
    id: "pascal",
    label: "PascalCase",
    convert: (text) => tokenize(text).map(capitalize).join(""),
  },
  {
    id: "kebab",
    label: "kebab-case",
    convert: (text) => tokenize(text).join("-").toLowerCase(),
  },
  {
    id: "snake",
    label: "snake_case",
    convert: (text) => tokenize(text).join("_").toLowerCase(),
  },
  {
    id: "constant",
    label: "CONSTANT_CASE",
    convert: (text) => tokenize(text).join("_").toUpperCase(),
  },
  {
    id: "title",
    label: "Title Case",
    convert: (text) => tokenize(text).map(capitalize).join(" "),
  },
  {
    id: "lower",
    label: "lowercase",
    convert: (text) => text.toLowerCase(),
  },
  {
    id: "upper",
    label: "UPPERCASE",
    convert: (text) => text.toUpperCase(),
  },
]

/**
 * String utilities: slug + case conversions with umlaut transliteration,
 * plus character/word/line/byte counts. Everything runs locally and live.
 */
export function StringsPage() {
  const [input, setInput] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const chars = [...input].length
    return {
      chars,
      charsNoSpaces: [...input.replace(/\s/g, "")].length,
      words: input.split(/\s+/).filter(Boolean).length,
      lines: input.length === 0 ? 0 : input.split(/\n/).length,
      bytes: new TextEncoder().encode(input).length,
    }
  }, [input])

  const copy = (id: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedId(id)
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1200,
      )
    })
  }

  return (
    <div className="space-y-4">
      <ToolSection
        title="String utils"
        description="Slug, case conversions (with ä→ae transliteration), and text counts — all live."
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder="Type or paste any text…"
          autoFocus
        />

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{counts.chars} chars</span>
          <span>{counts.charsNoSpaces} without spaces</span>
          <span>{counts.words} words</span>
          <span>{counts.lines} lines</span>
          <span>{counts.bytes} bytes (UTF-8)</span>
        </div>
      </ToolSection>

      <ToolSection title="Conversions">
        <div className="divide-y divide-border/60 border border-border">
          {CONVERSIONS.map((conversion) => {
            const value = input ? conversion.convert(input) : ""
            return (
              <div
                key={conversion.id}
                className="flex items-center gap-3 px-2.5 py-1.5"
              >
                <span className="w-32 shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {conversion.label}
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
                  title={value}
                >
                  {value || (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Copy ${conversion.label}`}
                  disabled={!value}
                  onClick={() => copy(conversion.id, value)}
                >
                  {copiedId === conversion.id ? (
                    <Check className="size-3 text-success" />
                  ) : (
                    <Clipboard className="size-3 text-muted-foreground" />
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </ToolSection>
    </div>
  )
}
