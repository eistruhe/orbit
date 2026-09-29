import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  ClipboardPaste,
  Download,
  Loader2,
  Trash2,
} from "lucide-react"
import Papa from "papaparse"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DropZone } from "@/components/orbit/drop-zone"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { downloadBlob } from "@/lib/image-encode"
import { cn } from "@/lib/utils"

const DELIMITERS = [
  { id: "auto", label: "Auto", value: "" },
  { id: "comma", label: ",", value: "," },
  { id: "semicolon", label: ";", value: ";" },
  { id: "tab", label: "Tab", value: "\t" },
  { id: "pipe", label: "|", value: "|" },
] as const

type DelimiterId = (typeof DELIMITERS)[number]["id"]

const EXPORT_DELIMITERS = DELIMITERS.filter((entry) => entry.id !== "auto")

type ExportDelimiterId = Exclude<DelimiterId, "auto">

type ParsedData = {
  grid: string[][]
  detectedDelimiter: string
  sourceName: string
  errorCount: number
}

type SortState = { column: number; direction: "asc" | "desc" }

type ColumnStat = {
  type: "number" | "text" | "mixed" | "empty"
  emptyCount: number
  uniqueCount: number
}

const ROW_PX = 28

function parseNumeric(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function delimiterName(value: string): string {
  if (value === "\t") return "Tab"
  return value || "?"
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

/**
 * CSV/TSV viewer for files and clipboard text: configurable delimiter with
 * auto-detect, search, per-column sorting, column stats, and JSON/Markdown
 * export. Rows are virtualized so large files stay responsive.
 */
export function CsvViewerPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [delimiterId, setDelimiterId] = useState<DelimiterId>("auto")
  const [hasHeader, setHasHeader] = useState(true)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [exportDelimiterId, setExportDelimiterId] =
    useState<ExportDelimiterId>("comma")
  const inputRef = useRef<{ source: File | string; name: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const runParse = useCallback(
    (source: File | string, name: string, delimiter: DelimiterId) => {
      const config = DELIMITERS.find((entry) => entry.id === delimiter)
      setBusy(true)
      setError(null)
      const options = {
        delimiter: config?.value ?? "",
        skipEmptyLines: "greedy" as const,
        complete: (results: Papa.ParseResult<string[]>) => {
          setBusy(false)
          setParsed({
            grid: results.data,
            detectedDelimiter: results.meta.delimiter ?? ",",
            sourceName: name,
            errorCount: results.errors.length,
          })
          setSort(null)
          setHiddenColumns(new Set())
          setQuery("")
        },
        error: (cause: Error) => {
          setBusy(false)
          setError(cause.message || "Could not parse input")
        },
      }
      if (typeof source === "string") Papa.parse<string[]>(source, options)
      else Papa.parse<string[]>(source, { ...options, worker: true })
    },
    [],
  )

  const loadSource = useCallback(
    (source: File | string, name: string) => {
      inputRef.current = { source, name }
      runParse(source, name, delimiterId)
    },
    [runParse, delimiterId],
  )

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = Array.from(files)[0]
      if (file) loadSource(file, file.name)
    },
    [loadSource],
  )

  // Cmd+V anywhere on the page loads the clipboard, unless the user is
  // typing into an input (e.g. the search field).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea") || target.isContentEditable)
      ) {
        return
      }
      const file = Array.from(event.clipboardData?.files ?? [])[0]
      if (file) {
        event.preventDefault()
        loadSource(file, file.name)
        return
      }
      const text = event.clipboardData?.getData("text") ?? ""
      if (text.trim()) {
        event.preventDefault()
        loadSource(text, "clipboard")
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [loadSource])

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setError("Clipboard is empty")
        return
      }
      loadSource(text, "clipboard")
    } catch {
      setError("Could not read the clipboard")
    }
  }, [loadSource])

  const selectDelimiter = (id: DelimiterId) => {
    setDelimiterId(id)
    const input = inputRef.current
    if (input) runParse(input.source, input.name, id)
  }

  const clear = () => {
    inputRef.current = null
    setParsed(null)
    setError(null)
    setQuery("")
    setSort(null)
    setHiddenColumns(new Set())
  }

  const columnCount = useMemo(() => {
    if (!parsed) return 0
    let max = 0
    for (const row of parsed.grid) max = Math.max(max, row.length)
    return max
  }, [parsed])

  const headers = useMemo(() => {
    const first = hasHeader ? (parsed?.grid[0] ?? []) : []
    return Array.from({ length: columnCount }, (_, index) => {
      const label = first[index]?.trim()
      return label && label.length > 0 ? label : `Column ${index + 1}`
    })
  }, [parsed, hasHeader, columnCount])

  const bodyRows = useMemo(() => {
    if (!parsed) return []
    return hasHeader ? parsed.grid.slice(1) : parsed.grid
  }, [parsed, hasHeader])

  const visibleColumns = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, index) => index).filter(
        (index) => !hiddenColumns.has(index),
      ),
    [columnCount, hiddenColumns],
  )

  const stats = useMemo<ColumnStat[]>(() => {
    return Array.from({ length: columnCount }, (_, column) => {
      let emptyCount = 0
      let numericCount = 0
      const uniques = new Set<string>()
      for (const row of bodyRows) {
        const value = (row[column] ?? "").trim()
        if (!value) {
          emptyCount += 1
          continue
        }
        uniques.add(value)
        if (parseNumeric(value) !== null) numericCount += 1
      }
      const nonEmpty = bodyRows.length - emptyCount
      const type =
        nonEmpty === 0
          ? "empty"
          : numericCount === nonEmpty
            ? "number"
            : numericCount > 0
              ? "mixed"
              : "text"
      return { type, emptyCount, uniqueCount: uniques.size }
    })
  }, [bodyRows, columnCount])

  const viewRows = useMemo(() => {
    let rows = bodyRows
    const needle = query.trim().toLowerCase()
    if (needle) {
      rows = rows.filter((row) =>
        visibleColumns.some((column) =>
          (row[column] ?? "").toLowerCase().includes(needle),
        ),
      )
    }
    if (sort) {
      const { column, direction } = sort
      const factor = direction === "asc" ? 1 : -1
      rows = [...rows].sort((a, b) => {
        const left = a[column] ?? ""
        const right = b[column] ?? ""
        const leftNum = parseNumeric(left)
        const rightNum = parseNumeric(right)
        if (leftNum !== null && rightNum !== null) {
          return (leftNum - rightNum) * factor
        }
        return left.localeCompare(right, undefined, { numeric: true }) * factor
      })
    }
    return rows
  }, [bodyRows, query, sort, visibleColumns])

  const virtualizer = useVirtualizer({
    count: viewRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 20,
  })

  const cycleSort = (column: number) => {
    setSort((current) => {
      if (!current || current.column !== column)
        return { column, direction: "asc" }
      if (current.direction === "asc") return { column, direction: "desc" }
      return null
    })
  }

  const toggleColumn = (column: number) => {
    setHiddenColumns((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  const buildJson = useCallback(() => {
    if (hasHeader) {
      return JSON.stringify(
        viewRows.map((row) =>
          Object.fromEntries(
            visibleColumns.map((column) => [
              headers[column],
              row[column] ?? "",
            ]),
          ),
        ),
        null,
        2,
      )
    }
    return JSON.stringify(
      viewRows.map((row) => visibleColumns.map((column) => row[column] ?? "")),
      null,
      2,
    )
  }, [viewRows, visibleColumns, headers, hasHeader])

  const buildCsv = useCallback(() => {
    const delimiter =
      EXPORT_DELIMITERS.find((entry) => entry.id === exportDelimiterId)
        ?.value ?? ","
    const rows = viewRows.map((row) =>
      visibleColumns.map((column) => row[column] ?? ""),
    )
    const data = hasHeader
      ? [visibleColumns.map((column) => headers[column]), ...rows]
      : rows
    return Papa.unparse(data, { delimiter })
  }, [viewRows, visibleColumns, headers, hasHeader, exportDelimiterId])

  const buildMarkdown = useCallback(() => {
    const headerLine = `| ${visibleColumns
      .map((column) => escapeMarkdownCell(headers[column]))
      .join(" | ")} |`
    const separator = `| ${visibleColumns.map(() => "---").join(" | ")} |`
    const lines = viewRows.map(
      (row) =>
        `| ${visibleColumns
          .map((column) => escapeMarkdownCell(row[column] ?? ""))
          .join(" | ")} |`,
    )
    return [headerLine, separator, ...lines].join("\n")
  }, [viewRows, visibleColumns, headers])

  const copyExport = (label: string, build: () => string) => {
    void navigator.clipboard.writeText(build()).then(() => {
      setCopiedFormat(label)
      window.setTimeout(
        () =>
          setCopiedFormat((current) => (current === label ? null : current)),
        1200,
      )
    })
  }

  const downloadExport = (extension: string, build: () => string) => {
    const base =
      parsed?.sourceName.replace(/\.[^.]+$/, "") || "table"
    downloadBlob(
      `${base}.${extension}`,
      new Blob([build()], { type: "text/plain" }),
    )
  }

  const gridTemplate = `52px ${visibleColumns.map(() => "minmax(140px, 1fr)").join(" ")}`
  const minTableWidth = 52 + visibleColumns.length * 140

  return (
    <div className="space-y-4">
      <ToolSection
        title="CSV viewer"
        description="Load a CSV/TSV file or paste from the clipboard — delimiter auto-detect, search, sorting, and column stats."
        trailing={
          busy ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Delimiter
              {parsed && delimiterId === "auto" ? (
                <span className="ml-1 font-mono normal-case text-muted-foreground/70">
                  → {delimiterName(parsed.detectedDelimiter)}
                </span>
              ) : null}
            </span>
            <SegmentedControl
              options={DELIMITERS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
              value={delimiterId}
              onValueChange={selectDelimiter}
            />
          </div>

          <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
            <Checkbox
              checked={hasHeader}
              onCheckedChange={(checked) => setHasHeader(checked === true)}
              aria-label="First row is a header"
            />
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Header row
            </span>
          </label>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void pasteFromClipboard()}
            >
              <ClipboardPaste className="size-3.5 text-muted-foreground" />
              Paste
            </Button>
            {parsed ? (
              <Button type="button" variant="ghost" onClick={clear}>
                <Trash2 className="size-3.5 text-muted-foreground" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-destructive">{error}</p>
        ) : null}

        {!parsed ? (
          <DropZone
            className="mt-4"
            label="Drop a CSV/TSV file, click to choose, or paste from clipboard"
            hint="CSV · TSV · TXT"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onFiles={handleFiles}
          />
        ) : null}
      </ToolSection>

      {parsed ? (
        <>
          <ToolSection
            title="Columns"
            trailing={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {visibleColumns.length}/{columnCount}
              </span>
            }
          >
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 border border-border">
              {headers.map((header, column) => {
                const stat = stats[column]
                return (
                  <label
                    key={column}
                    className="flex cursor-pointer items-center gap-2 bg-card px-2.5 py-2 transition-colors hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={!hiddenColumns.has(column)}
                      onCheckedChange={() => toggleColumn(column)}
                      aria-label={`Toggle column ${header}`}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                      {header}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 border border-border px-1 py-px text-[9px] uppercase tracking-[0.06em]",
                        stat.type === "number"
                          ? "text-highlight"
                          : "text-muted-foreground",
                      )}
                    >
                      {stat.type}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
                      title={`${stat.uniqueCount} unique · ${stat.emptyCount} empty`}
                    >
                      {stat.uniqueCount}u · {stat.emptyCount}∅
                    </span>
                  </label>
                )
              })}
            </div>
          </ToolSection>

          <ToolSection title="Table">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search all visible columns…"
                className="h-8 max-w-72 font-mono"
              />
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {viewRows.length.toLocaleString()} /{" "}
                {bodyRows.length.toLocaleString()} rows · {columnCount} cols
              </span>
              <span className="flex-1" />
              <span className="max-w-56 truncate font-mono text-[10px] text-muted-foreground/70">
                {parsed.sourceName}
              </span>
              {parsed.errorCount > 0 ? (
                <span className="font-mono text-[10px] tabular-nums text-destructive">
                  {parsed.errorCount} parse issues
                </span>
              ) : null}
            </div>

            {visibleColumns.length === 0 ? (
              <p className="border border-border px-4 py-8 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                All columns are hidden.
              </p>
            ) : (
              <div
                ref={scrollRef}
                className="relative max-h-[min(64vh,calc(100svh-22rem))] overflow-auto border border-border"
              >
                <div style={{ minWidth: minTableWidth }}>
                  <div
                    className="sticky top-0 z-10 grid border-b border-border bg-card backdrop-blur-md"
                    style={{ gridTemplateColumns: gridTemplate }}
                    role="row"
                  >
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      #
                    </div>
                    {visibleColumns.map((column) => (
                      <button
                        key={column}
                        type="button"
                        onClick={() => cycleSort(column)}
                        className="flex items-center gap-1 px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
                        title={`Sort by ${headers[column]}`}
                      >
                        <span className="truncate">{headers[column]}</span>
                        {sort?.column === column ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-3 shrink-0 text-highlight" />
                          ) : (
                            <ArrowDown className="size-3 shrink-0 text-highlight" />
                          )
                        ) : null}
                      </button>
                    ))}
                  </div>

                  {viewRows.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      No rows match the search.
                    </p>
                  ) : (
                    <div
                      className="relative"
                      style={{ height: virtualizer.getTotalSize() }}
                      role="rowgroup"
                    >
                      {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = viewRows[virtualRow.index]
                        return (
                          <div
                            key={virtualRow.key}
                            role="row"
                            className={cn(
                              "absolute left-0 grid w-full border-b border-border/40",
                              virtualRow.index % 2 === 0
                                ? "bg-card"
                                : "bg-surface-2/30",
                            )}
                            style={{
                              gridTemplateColumns: gridTemplate,
                              transform: `translateY(${virtualRow.start}px)`,
                              height: ROW_PX,
                            }}
                          >
                            <div className="truncate px-2 py-1 font-mono text-[10px] tabular-nums leading-5 text-muted-foreground">
                              {virtualRow.index + 1}
                            </div>
                            {visibleColumns.map((column) => {
                              const value = row[column] ?? ""
                              return (
                                <div
                                  key={column}
                                  className="truncate px-2 py-1 font-mono text-[11px] leading-5 text-foreground/90"
                                  title={value}
                                >
                                  {value}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </ToolSection>

          <ToolSection
            title="Export"
            description="Exports the current view — filtered, sorted, and visible columns only."
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  CSV delimiter
                </span>
                <SegmentedControl
                  options={EXPORT_DELIMITERS.map((entry) => ({
                    value: entry.id as ExportDelimiterId,
                    label: entry.label,
                  }))}
                  value={exportDelimiterId}
                  onValueChange={setExportDelimiterId}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  CSV
                </span>
                <div className="flex h-8 items-stretch border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-full"
                    onClick={() => copyExport("csv", buildCsv)}
                  >
                    {copiedFormat === "csv" ? (
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
                    className="h-full"
                    onClick={() =>
                      downloadExport(
                        exportDelimiterId === "tab" ? "tsv" : "csv",
                        buildCsv,
                      )
                    }
                  >
                    <Download className="size-3 text-muted-foreground" />
                    Download
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  JSON
                </span>
                <div className="flex h-8 items-stretch border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-full"
                    onClick={() => copyExport("json", buildJson)}
                  >
                    {copiedFormat === "json" ? (
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
                    className="h-full"
                    onClick={() => downloadExport("json", buildJson)}
                  >
                    <Download className="size-3 text-muted-foreground" />
                    Download
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Markdown
                </span>
                <div className="flex h-8 items-stretch border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-full"
                    onClick={() => copyExport("markdown", buildMarkdown)}
                  >
                    {copiedFormat === "markdown" ? (
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
                    className="h-full"
                    onClick={() => downloadExport("md", buildMarkdown)}
                  >
                    <Download className="size-3 text-muted-foreground" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </ToolSection>
        </>
      ) : null}
    </div>
  )
}
