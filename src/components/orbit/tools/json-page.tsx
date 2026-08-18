import { Check, Clipboard, Download, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DropZone } from "@/components/orbit/drop-zone"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { downloadBlob } from "@/lib/image-encode"
import { formatBytes } from "@/lib/format-size"
import { cn } from "@/lib/utils"

type View = "tree" | "formatted" | "types"

type ParseOutcome =
  | { value: unknown }
  | { error: string; line: number | null; column: number | null }

function parseJson(text: string): ParseOutcome {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : "Invalid JSON"
    const positionMatch = message.match(/position (\d+)/)
    let line: number | null = null
    let column: number | null = null
    if (positionMatch) {
      const position = Number(positionMatch[1])
      const before = text.slice(0, position)
      line = before.split("\n").length
      column = position - before.lastIndexOf("\n")
    }
    return { error: message, line, column }
  }
}

function countNodes(value: unknown): number {
  if (value === null || typeof value !== "object") return 1
  let count = 1
  const children = Array.isArray(value) ? value : Object.values(value)
  for (const child of children) {
    count += countNodes(child)
    if (count > 100_000) return count
  }
  return count
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortKeysDeep(child)]),
    )
  }
  return value
}

// --- Search -----------------------------------------------------------------

type SearchHit = { path: string; preview: string }

function searchJson(
  value: unknown,
  query: string,
  path: string,
  hits: SearchHit[],
): void {
  if (hits.length >= 500) return
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((child, index) => [String(index), child] as const)
      : Object.entries(value)
    for (const [key, child] of entries) {
      const childPath = Array.isArray(value)
        ? `${path}[${key}]`
        : path
          ? `${path}.${key}`
          : key
      if (!Array.isArray(value) && key.toLowerCase().includes(query)) {
        hits.push({ path: childPath, preview: previewValue(child) })
        if (hits.length >= 500) return
      } else if (
        (child === null || typeof child !== "object") &&
        String(child).toLowerCase().includes(query)
      ) {
        hits.push({ path: childPath, preview: previewValue(child) })
        if (hits.length >= 500) return
      }
      searchJson(child, query, childPath, hits)
    }
  }
}

function previewValue(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === "object")
    return `{ ${Object.keys(value).length} keys }`
  return typeof value === "string" ? JSON.stringify(value) : String(value)
}

// --- TypeScript generation --------------------------------------------------

function jsonToTs(root: unknown): string {
  const usedNames = new Set<string>()
  const interfaces: { name: string; body: string[] }[] = []

  const interfaceName = (hint: string): string => {
    const base =
      hint
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
        .replace(/^./, (char) => char.toUpperCase())
        .replace(/s$/, "") || "Item"
    let name = base
    let counter = 2
    while (usedNames.has(name)) name = `${base}${counter++}`
    usedNames.add(name)
    return name
  }

  const bodyCache = new Map<string, string>()

  const mergedInterface = (
    objects: Record<string, unknown>[],
    hint: string,
  ): string => {
    if (interfaces.length >= 100) return "Record<string, unknown>"
    const fields = new Map<string, { types: Set<string>; count: number }>()
    for (const object of objects) {
      for (const [key, child] of Object.entries(object)) {
        const entry = fields.get(key) ?? { types: new Set<string>(), count: 0 }
        entry.types.add(typeFor(child, key))
        entry.count += 1
        fields.set(key, entry)
      }
    }
    const body = [...fields.entries()].map(([key, entry]) => {
      const optional = entry.count < objects.length ? "?" : ""
      const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
      return `  ${safeKey}${optional}: ${[...entry.types].join(" | ")}`
    })
    // Structurally identical objects share one interface.
    const cacheKey = body.join("\n")
    const cached = bodyCache.get(cacheKey)
    if (cached) return cached
    const name = interfaceName(hint)
    bodyCache.set(cacheKey, name)
    interfaces.push({ name, body })
    return name
  }

  const typeFor = (value: unknown, hint: string): string => {
    if (value === null) return "null"
    if (Array.isArray(value)) {
      if (value.length === 0) return "unknown[]"
      const objects = value.filter(
        (child): child is Record<string, unknown> =>
          child !== null && typeof child === "object" && !Array.isArray(child),
      )
      if (objects.length === value.length) {
        return `${mergedInterface(objects, hint)}[]`
      }
      const types = [...new Set(value.map((child) => typeFor(child, hint)))]
      return types.length > 1 ? `(${types.join(" | ")})[]` : `${types[0]}[]`
    }
    if (typeof value === "object") {
      return mergedInterface([value as Record<string, unknown>], hint)
    }
    return typeof value
  }

  const rootType = typeFor(root, "Root")
  const blocks = interfaces
    .reverse()
    .map((entry) => `interface ${entry.name} {\n${entry.body.join("\n")}\n}`)
  if (rootType !== "Root") blocks.push(`type Root = ${rootType}`)
  return blocks.join("\n\n")
}

// --- Tree -------------------------------------------------------------------

function valueClass(value: unknown): string {
  if (value === null) return "text-muted-foreground/70"
  switch (typeof value) {
    case "string":
      return "text-success"
    case "number":
      return "text-highlight"
    case "boolean":
      return "text-highlight"
    default:
      return "text-foreground"
  }
}

function TreeNode({
  name,
  value,
  path,
  depth,
  defaultOpenDepth,
  onCopyPath,
  copiedPath,
}: {
  name: string | null
  value: unknown
  path: string
  depth: number
  defaultOpenDepth: number
  onCopyPath: (path: string) => void
  copiedPath: string | null
}) {
  const [open, setOpen] = useState(depth < defaultOpenDepth)
  const isContainer = value !== null && typeof value === "object"

  const label =
    name !== null ? (
      <button
        type="button"
        onClick={() => onCopyPath(path)}
        title={`Copy path: ${path}`}
        className="shrink-0 font-mono text-[11px] text-foreground hover:text-highlight"
      >
        {copiedPath === path ? (
          <span className="text-success">{name} ✓</span>
        ) : (
          name
        )}
        <span className="text-muted-foreground">:</span>
      </button>
    ) : null

  if (!isContainer) {
    return (
      <div
        className="flex items-baseline gap-1.5"
        style={{ paddingLeft: depth * 16 }}
      >
        {label}
        <span
          className={cn(
            "min-w-0 truncate font-mono text-[11px]",
            valueClass(value),
          )}
          title={previewValue(value)}
        >
          {previewValue(value)}
        </span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : Object.entries(value)

  return (
    <div>
      <div
        className="flex items-baseline gap-1.5"
        style={{ paddingLeft: depth * 16 }}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? "▾" : "▸"}
        </button>
        {label}
        <span className="font-mono text-[10px] text-muted-foreground">
          {Array.isArray(value)
            ? `Array(${value.length})`
            : `{ ${entries.length} }`}
        </span>
      </div>
      {open
        ? entries.map(([key, child]) => (
            <TreeNode
              key={key}
              name={key}
              value={child}
              path={
                Array.isArray(value)
                  ? `${path}[${key}]`
                  : path
                    ? `${path}.${key}`
                    : key
              }
              depth={depth + 1}
              defaultOpenDepth={defaultOpenDepth}
              onCopyPath={onCopyPath}
              copiedPath={copiedPath}
            />
          ))
        : null}
    </div>
  )
}

/**
 * JSON viewer: tree with copyable paths, search, formatting/minifying, and
 * TypeScript interface generation — the JSON never leaves the machine.
 */
export function JsonPage() {
  const [raw, setRaw] = useState("")
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [view, setView] = useState<View>("tree")
  const [indent, setIndent] = useState<"2" | "4" | "tab">("2")
  const [sortKeys, setSortKeys] = useState(false)
  const [query, setQuery] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Cmd+V anywhere loads the clipboard, unless typing in an input.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea") || target.isContentEditable)
      ) {
        return
      }
      const text = event.clipboardData?.getData("text") ?? ""
      if (text.trim()) {
        event.preventDefault()
        setRaw(text)
        setSourceName("clipboard")
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  const parsed = useMemo(
    () => (raw.trim() ? parseJson(raw) : null),
    [raw],
  )
  const value = parsed && "value" in parsed ? parsed.value : undefined
  const hasValue = parsed !== null && "value" in parsed

  const nodeCount = useMemo(
    () => (hasValue ? countNodes(value) : 0),
    [hasValue, value],
  )
  const defaultOpenDepth = nodeCount > 3000 ? 1 : 4

  const formatted = useMemo(() => {
    if (!hasValue) return ""
    const space = indent === "tab" ? "\t" : Number(indent)
    const source = sortKeys ? sortKeysDeep(value) : value
    return JSON.stringify(source, null, space)
  }, [hasValue, value, indent, sortKeys])

  const minified = useMemo(
    () => (hasValue ? JSON.stringify(value) : ""),
    [hasValue, value],
  )

  const types = useMemo(
    () => (hasValue && view === "types" ? jsonToTs(value) : ""),
    [hasValue, value, view],
  )

  const hits = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!hasValue || !trimmed) return null
    const results: SearchHit[] = []
    searchJson(value, trimmed, "", results)
    return results
  }, [hasValue, value, query])

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1200,
      )
    })
  }

  const loadFile = (files: FileList) => {
    const file = files[0]
    if (!file) return
    void file.text().then((text) => {
      setRaw(text)
      setSourceName(file.name)
    })
  }

  const baseName = sourceName?.replace(/\.[^.]+$/, "") || "data"

  return (
    <div className="max-w-5xl space-y-4">
      <ToolSection
        title="JSON viewer"
        description="Inspect, format, search, and convert JSON to TypeScript — from file, clipboard, or typed input."
        trailing={
          raw ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setRaw("")
                setSourceName(null)
                setQuery("")
              }}
            >
              <Trash2 className="size-3 text-muted-foreground" />
              Clear
            </Button>
          ) : undefined
        }
      >
        <Textarea
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value)
            setSourceName(null)
          }}
          rows={raw ? 6 : 4}
          placeholder='{"paste": "JSON here…"}'
          spellCheck={false}
          className="font-mono"
        />
        {!raw ? (
          <DropZone
            className="mt-3"
            label="Drop a JSON file, click to choose, or paste from clipboard"
            hint="JSON · any size the tab can hold"
            accept=".json,application/json,text/plain"
            onFiles={loadFile}
          />
        ) : null}

        {parsed && "error" in parsed ? (
          <p className="mt-2 text-[11px] text-destructive">
            {parsed.error}
            {parsed.line !== null
              ? ` — line ${parsed.line}, column ${parsed.column}`
              : ""}
          </p>
        ) : null}

        {hasValue ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{formatBytes(new TextEncoder().encode(raw).length)}</span>
            <span>{nodeCount.toLocaleString()} nodes</span>
            {sourceName ? <span>{sourceName}</span> : null}
          </div>
        ) : null}
      </ToolSection>

      {hasValue ? (
        <ToolSection
          title="Result"
          trailing={
            <div className="flex items-center gap-2">
              <SegmentedControl
                options={[
                  { value: "tree", label: "Tree" },
                  { value: "formatted", label: "Formatted" },
                  { value: "types", label: "TypeScript" },
                ]}
                value={view}
                onValueChange={setView}
              />
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {view === "tree" ? (
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search keys and values…"
                className="h-8 max-w-72 font-mono"
              />
            ) : null}
            {view === "formatted" ? (
              <>
                <SegmentedControl
                  options={[
                    { value: "2", label: "2" },
                    { value: "4", label: "4" },
                    { value: "tab", label: "Tab" },
                  ]}
                  value={indent}
                  onValueChange={setIndent}
                />
                <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
                  <Checkbox
                    checked={sortKeys}
                    onCheckedChange={(checked) => setSortKeys(checked === true)}
                    aria-label="Sort keys"
                  />
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Sort keys
                  </span>
                </label>
              </>
            ) : null}
            <span className="flex-1" />
            {view !== "tree" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    copy("main", view === "types" ? types : formatted)
                  }
                >
                  {copiedId === "main" ? (
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
                  onClick={() =>
                    downloadBlob(
                      view === "types" ? `${baseName}.ts` : `${baseName}.json`,
                      new Blob([view === "types" ? types : formatted], {
                        type: "text/plain",
                      }),
                    )
                  }
                >
                  <Download className="size-3 text-muted-foreground" />
                  Download
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => copy("min", minified)}
              >
                {copiedId === "min" ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Clipboard className="size-3 text-muted-foreground" />
                )}
                Copy minified
              </Button>
            )}
          </div>

          {view === "tree" ? (
            hits ? (
              <div className="max-h-[60vh] overflow-auto border border-border">
                <div className="sticky top-0 border-b border-border bg-card px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {hits.length}
                  {hits.length >= 500 ? "+" : ""} hits — click a path to copy
                </div>
                {hits.map((hit, index) => (
                  <button
                    key={`${hit.path}-${index}`}
                    type="button"
                    onClick={() => copy(hit.path, hit.path)}
                    className={cn(
                      "flex w-full items-baseline gap-3 px-2.5 py-1 text-left transition-colors hover:bg-muted/60",
                      index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                      {copiedId === hit.path ? (
                        <span className="text-success">{hit.path} ✓</span>
                      ) : (
                        hit.path
                      )}
                    </span>
                    <span className="max-w-72 truncate font-mono text-[11px] text-muted-foreground">
                      {hit.preview}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto border border-border bg-surface-2/20 p-2.5">
                <TreeNode
                  name={null}
                  value={value}
                  path=""
                  depth={0}
                  defaultOpenDepth={defaultOpenDepth}
                  onCopyPath={(path) => copy(path, path)}
                  copiedPath={copiedId}
                />
              </div>
            )
          ) : (
            <pre className="max-h-[60vh] overflow-auto border border-border bg-surface-2/20 p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
              {view === "types" ? types : formatted}
            </pre>
          )}
        </ToolSection>
      ) : null}
    </div>
  )
}
