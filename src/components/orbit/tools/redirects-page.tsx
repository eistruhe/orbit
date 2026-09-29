import { AlertTriangle, ArrowDown, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { UrlForm } from "@/components/orbit/tools/url-form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { type RedirectInspection, inspectRedirects } from "@/lib/api"
import { cue } from "@/lib/sound"
import { cn } from "@/lib/utils"

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return "border-success/40 bg-success/10 text-success"
  if (status >= 300 && status < 400) return "border-highlight/40 bg-highlight/10 text-highlight"
  return "border-destructive/40 bg-destructive/10 text-destructive"
}

/**
 * Redirect chain tracer with security/caching header analysis.
 */
export function RedirectsPage() {
  const [urlInput, setUrlInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<RedirectInspection | null>(null)

  const handleSubmit = () => {
    if (loading || !urlInput.trim()) return
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const next = await inspectRedirects(urlInput.trim())
        setData(next)
        cue(
          next.tooManyRedirects || next.redirectLoop || next.finalStatus >= 400
            ? "warning"
            : "ready",
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not inspect URL")
        cue("error")
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <div className="space-y-4">
      <ToolSection
        title="Redirects & headers"
        description="Trace the redirect chain and check security and caching headers of the final response."
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
          submitLabel="Inspect"
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
      </ToolSection>

      {data ? (
        <>
          <ToolSection
            title="Redirect chain"
            trailing={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {data.chain.length} {data.chain.length === 1 ? "hop" : "hops"}
              </span>
            }
          >
            <div className="space-y-1">
              {data.chain.map((hop, index) => (
                <div key={`${hop.url}-${index}`}>
                  <div className="flex items-center gap-2 border border-border bg-surface-2/40 px-2.5 py-1.5">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 border px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                        statusTone(hop.status),
                      )}
                    >
                      {hop.status}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                      {hop.url}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {hop.durationMs}ms
                    </span>
                  </div>
                  {index < data.chain.length - 1 ? (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="size-3 text-muted-foreground/60" aria-hidden />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {data.redirectLoop ? (
              <p className="mt-2 flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden />
                Redirect loop detected.
              </p>
            ) : null}
            {data.tooManyRedirects ? (
              <p className="mt-2 flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden />
                Stopped after 10 redirects.
              </p>
            ) : null}
          </ToolSection>

          <div className="grid gap-4 md:grid-cols-2">
            <ToolSection title="Security headers">
              <div className="space-y-1">
                {data.security.map((check) => (
                  <div
                    key={check.name}
                    className={cn(
                      "flex items-center gap-2 border px-2.5 py-1.5",
                      check.level === "pass"
                        ? "border-success/30 bg-success/5"
                        : "border-destructive/30 bg-destructive/5",
                    )}
                  >
                    {check.level === "pass" ? (
                      <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] text-foreground">
                        {check.name}
                      </span>
                      {check.value ? (
                        <span
                          className="block truncate text-[10px] text-muted-foreground"
                          title={check.value}
                        >
                          {check.value}
                        </span>
                      ) : (
                        <span className="block text-[10px] uppercase tracking-[0.06em] text-destructive/80">
                          missing
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </ToolSection>

            <ToolSection title="Caching headers">
              <div>
                {data.caching.map((header) => (
                  <div
                    key={header.name}
                    className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-2 border-b border-border/50 py-1.5 last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {header.name}
                    </span>
                    <span
                      className={cn(
                        "break-all font-mono text-[11px]",
                        header.value ? "text-foreground/90" : "text-muted-foreground/60",
                      )}
                    >
                      {header.value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </ToolSection>
          </div>

          <ToolSection
            title="All response headers"
            trailing={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {data.headers.length}
              </span>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Header</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.headers.map((header) => (
                  <TableRow key={header.name}>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {header.name}
                    </TableCell>
                    <TableCell className="break-all font-mono text-[11px]">
                      {header.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ToolSection>
        </>
      ) : null}
    </div>
  )
}
