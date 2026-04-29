import { ExternalLink, FileJson2, Loader2, Link2 } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setResult(null)
      setLoading(true)
      try {
        let next: SchemaViewerResponse
        if (mode === "url") {
          const url = urlInput.trim()
          if (url.length === 0) {
            setError("Enter a URL first.")
            return
          }
          next = await validateSchemaMarkup({ url })
        } else {
          const snippet = snippetInput.trim()
          if (snippet.length === 0) {
            setError("Paste markup first.")
            return
          }
          next = await validateSchemaMarkup({ snippet })
        }
        setResult(next)
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Schema validation failed.",
        )
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
        className="max-w-5xl"
        trailing={
          loading ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Validating
            </span>
          ) : null
        }
      >
        <form className="space-y-3" onSubmit={submit} aria-busy={loading}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "url" ? "highlight" : "outline"}
              onClick={() => setMode("url")}
            >
              <Link2 className="size-3.5" />
              URL
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "snippet" ? "highlight" : "outline"}
              onClick={() => setMode("snippet")}
            >
              <FileJson2 className="size-3.5" />
              Markup snippet
            </Button>
          </div>

          {mode === "url" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="url"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com/"
                autoComplete="url"
                className="flex-1"
              />
              <Button type="submit" variant="outline" disabled={loading}>
                Analyze
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={snippetInput}
                onChange={(event) => setSnippetInput(event.target.value)}
                rows={9}
                placeholder='Paste JSON-LD, HTML, or Microdata, e.g. {"@context":"https://schema.org","@type":"Organization","name":"Acme"}'
                className="block w-full border border-input bg-transparent px-2.5 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground/20 dark:bg-input/15"
              />
              <div className="flex items-center justify-end">
                <Button type="submit" variant="outline" disabled={loading}>
                  Analyze
                </Button>
              </div>
            </div>
          )}
        </form>

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
          <ToolSection title="Summary" className="max-w-5xl">
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

          <ToolSection title="Validation issues" className="max-w-5xl">
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

          <ToolSection title="Extracted schemas" className="max-w-5xl">
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
