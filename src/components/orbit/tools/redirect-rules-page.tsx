import { Check, Clipboard, Download, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { downloadBlob } from "@/lib/image-encode"
import { cn } from "@/lib/utils"

type RedirectCode = "301" | "302" | "307" | "308"

type Rule = { id: string; from: string; to: string; code: RedirectCode }

type OutputFormat = "htaccess" | "nginx" | "vercel" | "netlify"

const OUTPUT_FILES: Record<OutputFormat, string> = {
  htaccess: ".htaccess",
  nginx: "redirects.nginx.conf",
  vercel: "vercel.json",
  netlify: "_redirects",
}

function newRule(from = "", to = "", code: RedirectCode = "301"): Rule {
  return { id: crypto.randomUUID(), from, to, code }
}

function normalizePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

/** Path portion of a source (full URLs keep only their pathname). */
function sourcePath(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname || "/"
    } catch {
      return value
    }
  }
  return value
}

function buildOutput(format: OutputFormat, rules: Rule[]): string {
  const active = rules.filter((rule) => rule.from.trim() && rule.to.trim())
  switch (format) {
    case "htaccess":
      return active
        .map(
          (rule) =>
            `Redirect ${rule.code} ${sourcePath(normalizePath(rule.from))} ${normalizePath(rule.to)}`,
        )
        .join("\n")
    case "nginx":
      return active
        .map(
          (rule) =>
            `location = ${sourcePath(normalizePath(rule.from))} {\n  return ${rule.code} ${normalizePath(rule.to)};\n}`,
        )
        .join("\n\n")
    case "vercel":
      return `${JSON.stringify(
        {
          redirects: active.map((rule) => ({
            source: sourcePath(normalizePath(rule.from)),
            destination: normalizePath(rule.to),
            ...(rule.code === "301" || rule.code === "308"
              ? { permanent: true }
              : { statusCode: Number(rule.code) }),
          })),
        },
        null,
        2,
      )}\n`
    case "netlify":
      return active
        .map(
          (rule) =>
            `${sourcePath(normalizePath(rule.from))} ${normalizePath(rule.to)} ${rule.code}`,
        )
        .join("\n")
  }
}

type Warning = { text: string }

function validate(rules: Rule[]): Warning[] {
  const warnings: Warning[] = []
  const active = rules.filter((rule) => rule.from.trim() && rule.to.trim())
  const seen = new Map<string, number>()
  for (const rule of active) {
    const source = sourcePath(normalizePath(rule.from))
    seen.set(source, (seen.get(source) ?? 0) + 1)
  }
  for (const [source, count] of seen) {
    if (count > 1) {
      warnings.push({ text: `Duplicate source: ${source} (${count}×)` })
    }
  }
  const targets = new Map(
    active.map((rule) => [
      sourcePath(normalizePath(rule.from)),
      normalizePath(rule.to),
    ]),
  )
  for (const [source, target] of targets) {
    if (sourcePath(target) === source) {
      warnings.push({ text: `Self-redirect: ${source} → itself` })
      continue
    }
    const next = targets.get(sourcePath(target))
    if (next !== undefined) {
      warnings.push({
        text: `Chain: ${source} → ${target} → ${next} — point ${source} directly at ${next}`,
      })
    }
  }
  return warnings
}

function parseBulk(text: string): Rule[] {
  const rules: Rule[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const parts = trimmed.split(/[\s,;\t]+/).filter(Boolean)
    if (parts.length < 2) continue
    const code: RedirectCode = ["301", "302", "307", "308"].includes(
      parts[2] ?? "",
    )
      ? (parts[2] as RedirectCode)
      : "301"
    rules.push(newRule(parts[0], parts[1], code))
  }
  return rules
}

/**
 * Redirect rule generator: maintain a source→target list and export it as
 * .htaccess, nginx, vercel.json, or Netlify/Cloudflare _redirects syntax.
 */
export function RedirectRulesPage() {
  const [rules, setRules] = useState<Rule[]>([newRule()])
  const [format, setFormat] = useState<OutputFormat>("htaccess")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [copied, setCopied] = useState(false)

  const updateRule = (id: string, patch: Partial<Rule>) => {
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    )
  }

  const output = useMemo(() => buildOutput(format, rules), [format, rules])
  const warnings = useMemo(() => validate(rules), [rules])
  const activeCount = rules.filter(
    (rule) => rule.from.trim() && rule.to.trim(),
  ).length

  const copyOutput = () => {
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  const importBulk = () => {
    const imported = parseBulk(bulkText)
    if (imported.length === 0) return
    setRules((current) => [
      ...current.filter((rule) => rule.from.trim() || rule.to.trim()),
      ...imported,
    ])
    setBulkText("")
    setBulkOpen(false)
  }

  return (
    <div className="space-y-4">
      <ToolSection
        title="Redirect rules"
        description="Collect old → new URL mappings and export them for Apache, nginx, Vercel, or Netlify/Cloudflare."
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setBulkOpen((current) => !current)}
          >
            {bulkOpen ? "Hide bulk import" : "Bulk import"}
          </Button>
        }
      >
        {bulkOpen ? (
          <div className="mb-4 space-y-2">
            <Textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={5}
              placeholder={
                "/old-page /new-page\n/old-shop https://shop.example.com 302\nOne rule per line: source target [code]"
              }
              spellCheck={false}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={importBulk}
              disabled={!bulkText.trim()}
            >
              Import {parseBulk(bulkText).length || ""} rules
            </Button>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8.5rem_2rem] gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>From (old path)</span>
            <span>To (new path or URL)</span>
            <span>Code</span>
            <span />
          </div>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8.5rem_2rem] items-center gap-1.5"
            >
              <Input
                value={rule.from}
                onChange={(event) =>
                  updateRule(rule.id, { from: event.target.value })
                }
                placeholder="/old-page"
                className="font-mono"
                spellCheck={false}
              />
              <Input
                value={rule.to}
                onChange={(event) =>
                  updateRule(rule.id, { to: event.target.value })
                }
                placeholder="/new-page"
                className="font-mono"
                spellCheck={false}
              />
              <SegmentedControl
                options={(["301", "302", "308"] as const).map((code) => ({
                  value: code,
                  label: code,
                }))}
                value={rule.code === "307" ? "302" : rule.code}
                onValueChange={(code) => updateRule(rule.id, { code })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove rule"
                onClick={() =>
                  setRules((current) =>
                    current.length > 1
                      ? current.filter((entry) => entry.id !== rule.id)
                      : [newRule()],
                  )
                }
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2"
          onClick={() => setRules((current) => [...current, newRule()])}
        >
          <Plus className="size-3 text-muted-foreground" />
          Add rule
        </Button>

        {warnings.length > 0 ? (
          <div className="mt-3 space-y-1 border border-highlight/40 bg-highlight/10 px-2.5 py-2">
            {warnings.map((warning) => (
              <p key={warning.text} className="text-[11px] text-highlight">
                {warning.text}
              </p>
            ))}
          </div>
        ) : null}
      </ToolSection>

      <ToolSection
        title="Output"
        trailing={
          <div className="flex items-center gap-2">
            <SegmentedControl
              options={[
                { value: "htaccess", label: ".htaccess" },
                { value: "nginx", label: "nginx" },
                { value: "vercel", label: "Vercel" },
                { value: "netlify", label: "Netlify" },
              ]}
              value={format}
              onValueChange={setFormat}
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={activeCount === 0}
              onClick={copyOutput}
            >
              {copied ? (
                <Check className="size-3 text-success" />
              ) : (
                <Clipboard className="size-3 text-muted-foreground" />
              )}
              Copy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={activeCount === 0}
              onClick={() =>
                downloadBlob(
                  OUTPUT_FILES[format],
                  new Blob([output], { type: "text/plain" }),
                )
              }
            >
              <Download className="size-3 text-muted-foreground" />
              Download
            </Button>
          </div>
        }
      >
        <pre
          className={cn(
            "max-h-96 overflow-auto border border-border bg-surface-2/20 p-2.5 font-mono text-[11px] leading-relaxed text-foreground",
            activeCount === 0 && "text-muted-foreground/60",
          )}
        >
          {activeCount > 0
            ? output
            : "Add at least one rule with source and target."}
        </pre>
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          The Netlify format also works for Cloudflare Pages. Sources with full
          URLs are reduced to their path.
        </p>
      </ToolSection>
    </div>
  )
}
