import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { type SslCertificate, checkSsl } from "@/lib/api"
import { cue } from "@/lib/sound"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "orbit-ssl-domains"
const WARN_DAYS = 30

type Tone = "ok" | "warn" | "bad"

function tone(cert: SslCertificate): Tone {
  if (!cert.ok || cert.daysLeft === null || cert.daysLeft <= 0) return "bad"
  if (cert.daysLeft <= WARN_DAYS) return "warn"
  return "ok"
}

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-success shadow-[0_0_6px_var(--success)]",
  warn: "bg-highlight shadow-[0_0_6px_var(--highlight)]",
  bad: "bg-destructive shadow-[0_0_6px_var(--destructive)]",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return iso.slice(0, 10)
}

/**
 * SSL certificate check for one or many domains: expiry, issuer, chain, and
 * SANs — with a warning window for certificates expiring soon.
 */
export function SslPage() {
  const [input, setInput] = useState(
    () => window.localStorage.getItem(STORAGE_KEY) ?? "",
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SslCertificate[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Remember the domain list for recurring checks.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, input)
  }, [input])

  const domains = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))

  const run = () => {
    if (loading || domains.length === 0) return
    setLoading(true)
    setError(null)
    void checkSsl(domains)
      .then((next) => {
        setResults(next)
        setExpanded(new Set())
        cue(next.some((cert) => tone(cert) !== "ok") ? "warning" : "success")
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Check failed")
        cue("error")
        setResults(null)
      })
      .finally(() => setLoading(false))
  }

  const toggle = (domain: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <ToolSection
        title="SSL check"
        description="Inspect certificates for a list of domains: expiry, issuer, chain, and SANs. The list is remembered locally."
        trailing={
          loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder={"example.com\nshop.example.com\nOne domain per line — # comments allowed"}
            spellCheck={false}
            className="font-mono"
            autoFocus
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="highlight"
              disabled={loading || domains.length === 0}
              onClick={run}
            >
              Check {domains.length > 0 ? `${domains.length} ` : ""}
              {domains.length === 1 ? "domain" : "domains"}
            </Button>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Max 20 per run
            </span>
          </div>
          {error ? (
            <p className="text-[11px] text-destructive">{error}</p>
          ) : null}
        </div>
      </ToolSection>

      {results ? (
        <ToolSection
          title="Certificates"
          trailing={
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {results.filter((cert) => tone(cert) === "ok").length}/
              {results.length} ok
            </span>
          }
        >
          <div className="border border-border">
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,12rem)_7rem_5rem_1.5rem] border-b border-border bg-card text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <span />
              <span className="px-2 py-1.5">Domain</span>
              <span className="px-2 py-1.5">Issuer</span>
              <span className="px-2 py-1.5">Valid to</span>
              <span className="px-2 py-1.5">Days</span>
              <span />
            </div>
            {results.map((cert, index) => {
              const certTone = tone(cert)
              const isOpen = expanded.has(cert.domain)
              return (
                <div key={cert.domain}>
                  <button
                    type="button"
                    onClick={() => toggle(cert.domain)}
                    className={cn(
                      "grid w-full grid-cols-[2rem_minmax(0,1fr)_minmax(0,12rem)_7rem_5rem_1.5rem] items-center border-b border-border/40 text-left transition-colors hover:bg-muted/60",
                      index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
                    )}
                  >
                    <span className="flex justify-center">
                      <span
                        className={cn("size-1.5", TONE_DOT[certTone])}
                        aria-hidden
                      />
                    </span>
                    <span className="truncate px-2 py-1.5 font-mono text-[11px] text-foreground">
                      {cert.domain}
                    </span>
                    <span className="truncate px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {cert.issuer ?? cert.error ?? "—"}
                    </span>
                    <span className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(cert.validTo)}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-1.5 font-mono text-[11px] tabular-nums",
                        certTone === "ok"
                          ? "text-success"
                          : certTone === "warn"
                            ? "text-highlight"
                            : "text-destructive",
                      )}
                    >
                      {cert.daysLeft ?? "—"}
                    </span>
                    <span className="flex justify-center text-muted-foreground">
                      {isOpen ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-1.5 border-b border-border/40 bg-surface-2/20 px-4 py-2.5 text-[11px]">
                      {cert.error ? (
                        <p className="text-destructive">{cert.error}</p>
                      ) : null}
                      {cert.selfSigned ? (
                        <p className="text-highlight">Self-signed certificate</p>
                      ) : null}
                      {cert.subject ? (
                        <p className="font-mono text-muted-foreground">
                          <span className="uppercase text-muted-foreground/60">
                            subject{" "}
                          </span>
                          {cert.subject}
                          {cert.protocol ? ` · ${cert.protocol}` : ""}
                        </p>
                      ) : null}
                      {cert.validFrom ? (
                        <p className="font-mono text-muted-foreground">
                          <span className="uppercase text-muted-foreground/60">
                            valid{" "}
                          </span>
                          {formatDate(cert.validFrom)} →{" "}
                          {formatDate(cert.validTo)}
                        </p>
                      ) : null}
                      {cert.chain.length > 0 ? (
                        <p className="font-mono text-muted-foreground">
                          <span className="uppercase text-muted-foreground/60">
                            chain{" "}
                          </span>
                          {cert.chain.join(" → ")}
                        </p>
                      ) : null}
                      {cert.altNames.length > 0 ? (
                        <p className="font-mono text-muted-foreground">
                          <span className="uppercase text-muted-foreground/60">
                            sans{" "}
                          </span>
                          {cert.altNames.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </ToolSection>
      ) : null}
    </div>
  )
}
