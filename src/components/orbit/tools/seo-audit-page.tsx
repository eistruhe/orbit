import { Check, Loader2, TriangleAlert, X } from "lucide-react"
import { useCallback, useState } from "react"

import { ToolSection } from "@/components/orbit/tools/tool-section"
import { UrlForm } from "@/components/orbit/tools/url-form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchSeoAudit,
  type SeoAuditResponse,
  type SeoCheckStatus,
} from "@/lib/api"
import { cn } from "@/lib/utils"

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-destructive"
}

function StatusIcon({ status }: { status: SeoCheckStatus }) {
  if (status === "pass") {
    return (
      <Check
        className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-label="Pass"
      />
    )
  }
  if (status === "warn") {
    return (
      <TriangleAlert
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-label="Warning"
      />
    )
  }
  return <X className="size-3.5 shrink-0 text-destructive" aria-label="Fail" />
}

function ScoreRing({ score }: { score: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(Math.max(score, 0), 100) / 100) * circumference

  return (
    <svg viewBox="0 0 84 84" className="size-24" role="img" aria-label={`SEO score ${score} of 100`}>
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        strokeWidth="6"
        className="stroke-border"
      />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        strokeWidth="6"
        strokeLinecap="butt"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 42 42)"
        className={cn("transition-all", scoreColorClass(score))}
        stroke="currentColor"
      />
      <text
        x="42"
        y="42"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-mono text-[20px] font-medium"
      >
        {score}
      </text>
    </svg>
  )
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-background p-3">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-[12px] leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  )
}

function DataLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-foreground">{children}</span>
    </p>
  )
}

export function SeoAuditPage() {
  const [url, setUrl] = useState<string>("")
  const [data, setData] = useState<SeoAuditResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const onSubmit = useCallback(
    async () => {
      setError(null)
      setData(null)
      if (!isValidHttpUrl(url)) {
        setError("Please enter a valid http(s) URL.")
        return
      }
      setLoading(true)
      try {
        const result = await fetchSeoAudit(url)
        setData(result)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load audit")
      } finally {
        setLoading(false)
      }
    },
    [url],
  )

  const audit = data?.audit
  const og = data?.og

  return (
    <div className="space-y-4">
      <ToolSection
        title="SEO audit"
        description="Audit a URL: SEO checks, headings, links, page weight, and social previews."
        className="max-w-4xl"
        trailing={
          loading ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading
            </span>
          ) : null
        }
      >
        <UrlForm
          value={url}
          onValueChange={setUrl}
          onSubmit={() => void onSubmit()}
          submitLabel="Audit"
          loading={loading}
          placeholder="https://example.com/"
        />
        {error ? (
          <p className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
        {!loading && !data && !error ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Enter a URL and submit to run the audit.
          </p>
        ) : null}
      </ToolSection>

      {audit ? (
        <ToolSection
          title="Checks"
          className="max-w-4xl"
          trailing={
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
              {audit.checks.filter((c) => c.status === "pass").length}/
              {audit.checks.length} passed
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex flex-col items-center justify-center gap-2 border border-border bg-background p-4 sm:min-w-36">
              <ScoreRing score={audit.score} />
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                SEO score
              </p>
            </div>
            <ul className="divide-y divide-border/60 border border-border bg-background">
              {audit.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2.5 px-3 py-2">
                  <span className="mt-0.5">
                    <StatusIcon status={check.status} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] text-foreground">
                      {check.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {check.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ToolSection>
      ) : null}

      {audit ? (
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Title tag">
            {audit.title.text ?? (
              <span className="text-muted-foreground">Missing</span>
            )}
          </StatCard>
          <StatCard label="Meta description">
            {audit.metaDescription.text ?? (
              <span className="text-muted-foreground">Missing</span>
            )}
          </StatCard>
          <StatCard label="Heading tags">
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
              {audit.headings.levels.map((count, index) => (
                <span key={index} className={cn(count === 0 && "opacity-40")}>
                  <span className="text-muted-foreground">H{index + 1}</span>{" "}
                  {count}
                </span>
              ))}
            </div>
          </StatCard>
          <StatCard label="Approx. word count">
            <span className="font-mono">{audit.wordCount}</span>
          </StatCard>
        </div>
      ) : null}

      {audit && audit.headings.structure.length > 0 ? (
        <ToolSection title="Heading structure" className="max-w-4xl">
          <ul className="space-y-1">
            {audit.headings.structure.map((heading, index) => (
              <li
                key={`${heading.level}-${index}`}
                className="flex items-baseline gap-2 text-[11px]"
                style={{ paddingLeft: `${(heading.level - 1) * 16}px` }}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px]",
                    heading.level === 1 ? "text-highlight" : "text-muted-foreground",
                  )}
                >
                  H{heading.level}
                </span>
                <span className="truncate text-foreground">
                  {heading.text || <span className="text-muted-foreground">(empty)</span>}
                </span>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      {audit ? (
        <div className="grid max-w-4xl gap-4 md:grid-cols-2">
          <ToolSection title="Links overview">
            <div className="space-y-1.5">
              <DataLine label="Internal">{audit.links.internal}</DataLine>
              <DataLine label="External">{audit.links.external}</DataLine>
              <DataLine label="Nofollow">{audit.links.nofollow}</DataLine>
              <DataLine label="Total">{audit.links.total}</DataLine>
            </div>
          </ToolSection>
          <ToolSection title="Page weight">
            <div className="space-y-1.5">
              <DataLine label="HTML size">{formatBytes(audit.htmlBytes)}</DataLine>
              <DataLine label="Text-to-HTML ratio">
                {(audit.textRatio * 100).toFixed(1)}%
              </DataLine>
              <DataLine label="Structured data (JSON-LD)">
                {audit.hasJsonLd ? "Present" : "Missing"}
              </DataLine>
              <DataLine label="Canonical">
                {audit.canonical ? "Present" : "Missing"}
              </DataLine>
              <DataLine label="Language">{audit.lang ?? "—"}</DataLine>
            </div>
          </ToolSection>
        </div>
      ) : null}

      {og ? (
        <ToolSection title="Social preview" className="max-w-4xl">
          <article className="max-w-xl border border-border bg-surface">
            {og.image ? (
              <img
                src={og.image}
                alt="Open Graph preview"
                className="aspect-1200/630 w-full border-b border-border object-cover"
              />
            ) : null}
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {og.favicon ? (
                  <img src={og.favicon} alt="" className="size-3.5" aria-hidden />
                ) : null}
                <span className="truncate">
                  {og.siteName ?? safeHostname(og.url)}
                </span>
              </div>
              <h3 className="text-sm font-medium text-foreground">
                {og.title ?? "Untitled"}
              </h3>
              {og.description ? (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {og.description}
                </p>
              ) : null}
            </div>
          </article>
        </ToolSection>
      ) : null}

      {og ? (
        <ToolSection
          title="Raw meta tags"
          description="Open Graph, Twitter, and other meta tags found on the page."
          className="max-w-4xl"
          trailing={
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
              {og.raw.length}
            </span>
          }
        >
          {og.raw.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%] text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Tag
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Value
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {og.raw.map((item, idx) => (
                  <TableRow key={`${item.tag}-${idx}`}>
                    <TableCell className="whitespace-normal align-top font-mono text-[11px] text-muted-foreground">
                      {item.tag}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top wrap-break-word text-[11px] text-foreground">
                      {item.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No meta tags found.
            </p>
          )}
        </ToolSection>
      ) : null}
    </div>
  )
}
