import { ExternalLink, FileJson2, Loader2, Link2 } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { ToolSection } from "@/components/orbit/tools/tool-section"
import { UrlForm } from "@/components/orbit/tools/url-form"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type ExtractedSchemaItem,
  type SchemaIssue,
  type SchemaViewerResponse,
  validateSchemaMarkup,
} from "@/lib/api"
import { cue } from "@/lib/sound"
import { cn } from "@/lib/utils"

type InputMode = "url" | "snippet"

function formatIssuePath(path: SchemaIssue["path"]): string {
  if (!Array.isArray(path) || path.length === 0) return "—"
  return path
    .map((entry) => {
      if (!entry || typeof entry !== "object") return ""
      if (typeof entry.property === "string") return entry.property
      if (typeof entry.type === "string") return entry.type
      return ""
    })
    .filter(Boolean)
    .join(" → ")
}

function prettySchemaData(item: ExtractedSchemaItem): string {
  const clone: Record<string, unknown> = { ...item.data }
  delete clone["@location"]
  delete clone["@source"]
  return JSON.stringify(clone, null, 2)
}

export function SchemaViewerPage() {
  const [mode, setMode] = useState<InputMode>("url")
  const [urlInput, setUrlInput] = useState("")
  const [snippetInput, setSnippetInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SchemaViewerResponse | null>(null)

  const submit = useCallback(
    async () => {
      setError(null)
      setResult(null)
      setLoading(true)
      try {
        let next: SchemaViewerResponse
        if (mode === "url") {
          const url = urlInput.trim()
          if (url.length === 0) {
            setError("Enter a URL first.")
            cue("error", { emphasis: "subtle" })
            return
          }
          next = await validateSchemaMarkup({ url })
        } else {
          const snippet = snippetInput.trim()
          if (snippet.length === 0) {
            setError("Paste markup first.")
            cue("error", { emphasis: "subtle" })
            return
          }
          next = await validateSchemaMarkup({ snippet })
        }
        setResult(next)
        cue(
          next.issues.length > 0
            ? "warning"
            : next.extractedSchemas.length > 0
              ? "success"
              : "ready",
        )
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Schema validation failed.",
        )
        cue("error")
      } finally {
        setLoading(false)
      }
    },
    [mode, snippetInput, urlInput],
  )

  const extractedCount = result?.extractedSchemas.length ?? 0
  const issueCount = result?.issues.length ?? 0
  const errorCount = useMemo(
    () =>
      result?.issues.filter((issue) => issue.severity === "ERROR").length ?? 0,
    [result?.issues],
  )
  const warningCount = issueCount - errorCount

  return (
    <div className="space-y-4">
      <ToolSection
        title="Schema viewer"
        description="Paste a URL or schema markup and validate extracted JSON-LD, Microdata, and RDFa."
        trailing={
          loading ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Validating
            </span>
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={mode === "url" ? "highlight" : "outline"}
              onClick={() => setMode("url")}
            >
              <Link2 className="size-3.5" />
              URL
            </Button>
            <Button
              type="button"
              variant={mode === "snippet" ? "highlight" : "outline"}
              onClick={() => setMode("snippet")}
            >
              <FileJson2 className="size-3.5" />
              Markup snippet
            </Button>
          </div>

          {mode === "url" ? (
            <UrlForm
              value={urlInput}
              onValueChange={setUrlInput}
              onSubmit={() => void submit()}
              submitLabel="Analyze"
              loading={loading}
              placeholder="https://example.com/"
            />
          ) : (
            <form
              className="space-y-2"
              aria-busy={loading}
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <Textarea
                value={snippetInput}
                onChange={(event) => setSnippetInput(event.target.value)}
                rows={9}
                placeholder='Paste JSON-LD, HTML, or Microdata, e.g. {"@context":"https://schema.org","@type":"Organization","name":"Acme"}'
              />
              <div className="flex items-center justify-end">
                <Button type="submit" variant="highlight" disabled={loading}>
                  Analyze
                </Button>
              </div>
            </form>
          )}
        </div>

        {error ? (
          <p className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
        {!loading && !result && !error ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Choose URL or snippet mode, then run validation.
          </p>
        ) : null}
      </ToolSection>

      {result ? (
        <>
          <ToolSection title="Summary">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="border border-border px-2 py-2 text-[11px]">
                <p className="text-muted-foreground">Schemas found</p>
                <p className="mt-1 font-mono text-foreground">{extractedCount}</p>
              </div>
              <div className="border border-border px-2 py-2 text-[11px]">
                <p className="text-muted-foreground">Issues</p>
                <p className="mt-1 font-mono text-foreground">{issueCount}</p>
              </div>
              <div className="border border-border px-2 py-2 text-[11px]">
                <p className="text-muted-foreground">Errors / Warnings</p>
                <p className="mt-1 font-mono text-foreground">
                  {errorCount} / {warningCount}
                </p>
              </div>
              <div className="border border-border px-2 py-2 text-[11px]">
                <p className="text-muted-foreground">Schema.org vocabulary</p>
                <p className="mt-1 font-mono text-foreground">
                  {result.usedSchemaOrgVocabulary ? "Loaded" : "Fallback mode"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              For exact parity checks, compare with{" "}
              <a
                href="https://validator.schema.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                Schema Markup Validator
                <ExternalLink className="size-3" />
              </a>
              .
            </p>
            {result.extractionErrors.length > 0 ? (
              <div className="mt-2 border border-destructive/30 bg-destructive/5 px-2 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-destructive">
                  Extraction errors
                </p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-destructive">
                  {result.extractionErrors.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ToolSection>

          <ToolSection title="Validation issues">
            {result.issues.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No validation issues returned.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Path</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.issues.map((issue, index) => (
                    <TableRow key={`${issue.issueMessage}-${index}`}>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex border px-1 py-0.5 text-[10px] uppercase tracking-[0.06em]",
                            issue.severity === "ERROR"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {issue.severity}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal">{issue.issueMessage}</TableCell>
                      <TableCell>
                        {[issue.dataFormat, issue.rootType].filter(Boolean).join(" · ") ||
                          "—"}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {formatIssuePath(issue.path)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ToolSection>

          <ToolSection title="Extracted schemas">
            {result.extractedSchemas.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No schema objects were extracted from this input.
              </p>
            ) : (
              <div className="space-y-2">
                {result.extractedSchemas.map((schema) => (
                  <details key={schema.id} className="border border-border bg-card">
                    <summary className="cursor-pointer px-2 py-1.5 text-[11px] uppercase tracking-[0.06em] text-foreground">
                      {schema.dataFormat} · {schema.rootType} #{schema.index + 1}
                    </summary>
                    <pre className="overflow-auto border-t border-border p-2 text-[11px] leading-relaxed text-foreground">
                      {prettySchemaData(schema)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </ToolSection>
        </>
      ) : null}
    </div>
  )
}
