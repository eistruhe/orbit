import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Map as MapIcon,
} from "lucide-react"
import { useState } from "react"

import { ToolSection } from "@/components/orbit/tools/tool-section"
import { UrlForm } from "@/components/orbit/tools/url-form"
import { type RobotsValidation, validateRobots } from "@/lib/api"
import { cn } from "@/lib/utils"

function sampleTone(status: number | null): string {
  if (status === null) return "border-destructive/40 bg-destructive/10 text-destructive"
  if (status >= 200 && status < 300) return "border-success/40 bg-success/10 text-success"
  if (status === 405 || (status >= 300 && status < 400))
    return "border-highlight/40 bg-highlight/10 text-highlight"
  return "border-destructive/40 bg-destructive/10 text-destructive"
}

/**
 * robots.txt and sitemap validator.
 */
export function RobotsPage() {
  const [urlInput, setUrlInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<RobotsValidation | null>(null)

  const handleSubmit = () => {
    if (loading || !urlInput.trim()) return
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        setData(await validateRobots(urlInput.trim()))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Validation failed")
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="Robots & sitemap"
        description="Fetch robots.txt, parse its rules, and validate every referenced sitemap."
        trailing={
          loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <UrlForm
          value={urlInput}
          onValueChange={setUrlInput}
          onSubmit={handleSubmit}
          submitLabel="Validate"
          loading={loading}
          autoFocus
        />
        {error ? (
          <div
            role="alert"
            className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          >
            {error}
          </div>
        ) : null}
        {loading ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Fetching robots.txt and sitemaps — large sites can take up to 30
            seconds…
          </p>
        ) : null}
      </ToolSection>

      {data ? (
        <>
          <ToolSection
            title="robots.txt"
            trailing={
              <span
                className={cn(
                  "border px-1.5 py-0.5 font-mono text-[10px]",
                  data.robotsFound
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {data.robotsStatus ?? "unreachable"}
              </span>
            }
          >
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <FileText className="size-3.5" aria-hidden />
              {data.robotsUrl}
            </p>
            {!data.robotsFound ? (
              <p className="border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
                No robots.txt found — crawlers assume everything is allowed.
              </p>
            ) : data.groups.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                robots.txt has no user-agent groups.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.groups.map((group, index) => (
                  <div
                    key={`${group.userAgents.join(",")}-${index}`}
                    className="border border-border bg-surface-2/40"
                  >
                    <div className="border-b border-border px-2 py-1">
                      <span className="font-mono text-[10px] text-foreground">
                        User-agent: {group.userAgents.join(", ") || "*"}
                      </span>
                    </div>
                    {group.rules.length === 0 ? (
                      <p className="px-2 py-2 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                        No rules
                      </p>
                    ) : (
                      <ul className="max-h-48 overflow-y-auto">
                        {group.rules.map((rule, ruleIndex) => (
                          <li
                            key={`${rule.type}-${rule.value}-${ruleIndex}`}
                            className="flex items-baseline gap-2 border-b border-border/40 px-2 py-1 font-mono text-[10.5px] last:border-b-0"
                          >
                            <span
                              className={cn(
                                "shrink-0 uppercase",
                                rule.type === "disallow"
                                  ? "text-destructive"
                                  : rule.type === "allow"
                                    ? "text-success"
                                    : "text-muted-foreground",
                              )}
                            >
                              {rule.type}
                            </span>
                            <span className="min-w-0 break-all text-foreground/85">
                              {rule.value || '""'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ToolSection>

          <ToolSection
            title="Sitemaps"
            trailing={
              <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {data.sitemapDiscovery === "fallback" ? (
                  <span className="border border-highlight/40 bg-highlight/10 px-1.5 py-0.5 uppercase tracking-[0.06em] text-highlight">
                    probed /sitemap.xml
                  </span>
                ) : null}
                <span className="tabular-nums">{data.sitemaps.length}</span>
              </span>
            }
          >
            {data.truncated ? (
              <p className="mb-2 border border-highlight/40 bg-highlight/10 px-2 py-1 text-[11px] text-highlight">
                Output truncated — checked the first {data.sitemaps.length} sitemaps.
              </p>
            ) : null}
            <div className="space-y-1.5">
              {data.sitemaps.map((sitemap) => (
                <div
                  key={sitemap.url}
                  className="border border-border bg-surface-2/40 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    {sitemap.ok ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden />
                    )}
                    <MapIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                      {sitemap.url}
                    </span>
                    {sitemap.status !== null ? (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {sitemap.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5.5 text-[10px] text-muted-foreground">
                    {sitemap.isIndex ? (
                      <span className="uppercase tracking-[0.06em] text-highlight">
                        sitemap index · {sitemap.urlCount ?? 0} children
                      </span>
                    ) : sitemap.urlCount !== null ? (
                      <span className="tabular-nums">{sitemap.urlCount} URLs</span>
                    ) : null}
                    {sitemap.lastmodPct !== null ? (
                      <span className="tabular-nums">
                        lastmod on {sitemap.lastmodPct}%
                      </span>
                    ) : null}
                    {sitemap.errors.map((message) => (
                      <span key={message} className="text-destructive">
                        {message}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ToolSection>

          {data.sampleChecks.length > 0 ? (
            <ToolSection
              title="Sample URL checks"
              description="HEAD requests against the first URLs of the first sitemap. 405 means the server rejects HEAD, not that the page is broken."
              trailing={
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {data.sampleChecks.length}
                </span>
              }
            >
              <div className="space-y-1">
                {data.sampleChecks.map((check) => (
                  <div
                    key={check.url}
                    className="flex items-center gap-2 border-b border-border/40 py-1 last:border-b-0"
                  >
                    <span
                      className={cn(
                        "w-14 shrink-0 border px-1.5 py-0.5 text-center font-mono text-[10px] tabular-nums",
                        sampleTone(check.status),
                      )}
                    >
                      {check.status ?? "ERR"}
                    </span>
                    <Globe className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/85">
                      {check.url}
                    </span>
                    {check.error ? (
                      <span
                        className="max-w-48 truncate text-[10px] text-destructive"
                        title={check.error}
                      >
                        {check.error}
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
