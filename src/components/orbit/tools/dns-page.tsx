import { Check, Clipboard, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { type DnsLookup, type DnsRecord, lookupDns } from "@/lib/api"
import { cue } from "@/lib/sound"
import { cn } from "@/lib/utils"

const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "CAA",
  "ANY",
] as const

function recordKey(record: DnsRecord): string {
  return `${record.type}|${record.name}|${record.data}`
}

function sameRecords(a: DnsRecord[], b: DnsRecord[]): boolean {
  if (a.length !== b.length) return false
  const keys = new Set(a.map(recordKey))
  return b.every((record) => keys.has(recordKey(record)))
}

function RecordTable({
  records,
  copiedKey,
  onCopy,
}: {
  records: DnsRecord[]
  copiedKey: string | null
  onCopy: (record: DnsRecord) => void
}) {
  if (records.length === 0) {
    return (
      <p className="border border-border px-4 py-6 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        No records.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto border border-border">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[4.5rem_minmax(0,14rem)_4.5rem_minmax(0,1fr)_2rem] border-b border-border bg-card text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="px-2 py-1.5">Type</span>
          <span className="px-2 py-1.5">Name</span>
          <span className="px-2 py-1.5">TTL</span>
          <span className="px-2 py-1.5">Data</span>
          <span />
        </div>
        {records.map((record, index) => {
          const key = recordKey(record)
          return (
            <div
              key={`${key}-${index}`}
              className={cn(
                "grid grid-cols-[4.5rem_minmax(0,14rem)_4.5rem_minmax(0,1fr)_2rem] items-center border-b border-border/40 font-mono text-[11px]",
                index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
              )}
            >
              <span className="px-2 py-1 text-highlight">{record.type}</span>
              <span
                className="truncate px-2 py-1 text-muted-foreground"
                title={record.name}
              >
                {record.name}
              </span>
              <span className="px-2 py-1 tabular-nums text-muted-foreground">
                {record.ttl}
              </span>
              <span
                className="truncate px-2 py-1 text-foreground"
                title={record.data}
              >
                {record.data}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy record data"
                onClick={() => onCopy(record)}
              >
                {copiedKey === key ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Clipboard className="size-3 text-muted-foreground" />
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * DNS lookup over DNS-over-HTTPS, queried against Cloudflare and Google in
 * parallel — differing answers reveal propagation issues.
 */
export function DnsPage() {
  const [domain, setDomain] = useState("")
  const [type, setType] = useState<(typeof RECORD_TYPES)[number]>("A")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DnsLookup | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const run = (nextType = type) => {
    if (loading || !domain.trim()) return
    setLoading(true)
    setError(null)
    void lookupDns(domain.trim(), nextType)
      .then((next) => {
        setData(next)
        cue("ready")
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Lookup failed")
        cue("error")
        setData(null)
      })
      .finally(() => setLoading(false))
  }

  const copyRecord = (record: DnsRecord) => {
    void navigator.clipboard.writeText(record.data).then(() => {
      const key = recordKey(record)
      setCopiedKey(key)
      window.setTimeout(
        () => setCopiedKey((current) => (current === key ? null : current)),
        1200,
      )
    })
  }

  const cloudflare = data?.results.find(
    (entry) => entry.resolver === "cloudflare",
  )
  const google = data?.results.find((entry) => entry.resolver === "google")
  const agree =
    cloudflare &&
    google &&
    !cloudflare.error &&
    !google.error &&
    sameRecords(cloudflare.records, google.records)

  return (
    <div className="space-y-4">
      <ToolSection
        title="DNS lookup"
        description="Resolve records via DNS-over-HTTPS — Cloudflare and Google are queried in parallel to spot propagation differences."
        trailing={
          loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          aria-busy={loading}
          onSubmit={(event) => {
            event.preventDefault()
            run()
          }}
        >
          <Input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            className="flex-1 font-mono"
            autoFocus
            spellCheck={false}
          />
          <Button
            type="submit"
            variant="highlight"
            disabled={loading || !domain.trim()}
          >
            Lookup
          </Button>
        </form>

        <div className="mt-3 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Record type
          </span>
          <SegmentedControl
            options={RECORD_TYPES.map((entry) => ({
              value: entry,
              label: entry,
            }))}
            value={type}
            onValueChange={(next) => {
              setType(next)
              if (data) run(next)
            }}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-destructive">{error}</p>
        ) : null}
      </ToolSection>

      {data ? (
        agree && cloudflare ? (
          <ToolSection
            title={`${data.domain} · ${data.type}`}
            trailing={
              <span className="text-[10px] uppercase tracking-[0.06em] text-success">
                Cloudflare and Google agree
              </span>
            }
          >
            <RecordTable
              records={cloudflare.records}
              copiedKey={copiedKey}
              onCopy={copyRecord}
            />
          </ToolSection>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[cloudflare, google].map((result) =>
              result ? (
                <ToolSection
                  key={result.resolver}
                  title={
                    result.resolver === "cloudflare"
                      ? "Cloudflare (1.1.1.1)"
                      : "Google (8.8.8.8)"
                  }
                  trailing={
                    <span className="text-[10px] uppercase tracking-[0.06em] text-highlight">
                      Answers differ
                    </span>
                  }
                >
                  {result.error ? (
                    <p className="text-[11px] text-destructive">
                      {result.error}
                    </p>
                  ) : (
                    <RecordTable
                      records={result.records}
                      copiedKey={copiedKey}
                      onCopy={copyRecord}
                    />
                  )}
                </ToolSection>
              ) : null,
            )}
          </div>
        )
      ) : null}
    </div>
  )
}
