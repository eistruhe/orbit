import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useTheme } from "next-themes"
import type { BundledLanguage } from "shiki"

import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  type SearchRepoResult,
  type SearchResponse,
  openRepoPath,
  runContentSearch,
} from "@/lib/api"
import {
  HIGHLIGHT_THEMES,
  type Highlighter,
  langForPath,
  loadHighlighter,
} from "@/lib/highlight"

/**
 * Cross-library content search backed by the local API grep endpoint.
 */
export function SearchPage() {
  const [query, setQuery] = useState("")
  const [extensionsInput, setExtensionsInput] = useState("")
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SearchResponse | null>(null)
  // Wrapped in an object so a second search re-renders even when the shared
  // highlighter instance is unchanged.
  const [highlighter, setHighlighter] = useState<{ current: Highlighter } | null>(
    null,
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || query.trim().length < 3) return
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const extensions = extensionsInput
          .split(/[\s,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
        const result = await runContentSearch({
          query: query.trim(),
          regex,
          caseSensitive,
          extensions: extensions.length > 0 ? extensions : undefined,
        })
        setData(result)

        const langs = new Set<BundledLanguage>()
        for (const repo of result.results) {
          for (const file of repo.files) {
            const lang = langForPath(file.relPath)
            if (lang) langs.add(lang)
          }
        }
        if (langs.size > 0) {
          void loadHighlighter([...langs])
            .then((instance) => setHighlighter({ current: instance }))
            .catch(() => {})
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Search failed")
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }

  const totalMatches =
    data?.results.reduce(
      (sum, repo) =>
        sum + repo.files.reduce((s, file) => s + file.matches.length, 0),
      0,
    ) ?? 0

  return (
    <section className="space-y-3">
      <form onSubmit={handleSubmit} className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="size-1.5 bg-highlight" aria-hidden />
          <h2 className="text-[10px] font-medium uppercase tracking-[0.16em]">
            [Content Search]
          </h2>
          {loading ? (
            <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex min-w-64 flex-1 items-center gap-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search across all projects (min. 3 characters)…"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Ext
            <Input
              value={extensionsInput}
              onChange={(event) => setExtensionsInput(event.target.value)}
              placeholder="ts, scss, php…"
              aria-label="Filter by file extension"
              className="w-32 normal-case tracking-normal"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <Checkbox
              checked={regex}
              onCheckedChange={(checked) => setRegex(checked === true)}
            />
            Regex
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <Checkbox
              checked={caseSensitive}
              onCheckedChange={(checked) => setCaseSensitive(checked === true)}
            />
            Case
          </label>
          <Button
            type="submit"
            variant="highlight"
            size="sm"
            disabled={loading || query.trim().length < 3}
          >
            Search
          </Button>
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
        >
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>
              <span className="tabular-nums text-foreground">{totalMatches}</span>{" "}
              matches in{" "}
              <span className="tabular-nums text-foreground">
                {data.results.length}
              </span>{" "}
              projects
            </span>
            <span className="h-3 w-px bg-border" aria-hidden />
            <span className="font-mono">
              {data.filesScanned} files · {data.durationMs}ms
            </span>
            {data.truncated ? (
              <span className="border border-highlight/40 bg-highlight/10 px-1.5 py-0.5 text-highlight">
                Truncated — refine your query
              </span>
            ) : null}
          </div>

          {data.results.length === 0 ? (
            <p className="border border-border bg-card px-3 py-8 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              No matches found.
            </p>
          ) : (
            data.results.map((repo) => (
              <RepoResultGroup
                key={repo.repoPath}
                repo={repo}
                highlighter={highlighter?.current ?? null}
              />
            ))
          )}
        </>
      ) : null}
    </section>
  )
}

function RepoResultGroup({
  repo,
  highlighter,
}: {
  repo: SearchRepoResult
  highlighter: Highlighter | null
}) {
  const navigate = useNavigate()
  const { repoByPath } = useOrbit()
  const [expanded, setExpanded] = useState(true)
  const matchCount = repo.files.reduce((sum, file) => sum + file.matches.length, 0)
  const inScan = repoByPath.has(repo.repoPath)

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate text-[11px] font-medium text-foreground">
            {repo.repoName}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </span>
        </button>
        {inScan ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() =>
              navigate({
                to: "/project/$encodedPath",
                params: { encodedPath: encodeURIComponent(repo.repoPath) },
              })
            }
          >
            Open project
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void openRepoPath(repo.repoPath, "cursor")}
        >
          <img
            src="/cursor.svg"
            alt=""
            aria-hidden
            className="size-3 object-contain brightness-0 dark:invert"
            draggable={false}
          />
          Cursor
        </Button>
      </div>

      {expanded ? (
        <div>
          {repo.files.map((file) => {
            const lang = langForPath(file.relPath)
            return (
              <div key={file.relPath} className="border-b border-border/50 last:border-b-0">
                <p
                  data-selectable
                  className="border-b border-border/60 bg-muted px-3 py-1 font-mono text-[10px] font-medium text-foreground/90"
                >
                  {file.relPath}
                </p>
                {file.matches.map((match) => (
                  <div
                    key={`${file.relPath}:${match.line}:${match.column}`}
                    className="flex items-baseline gap-2 px-3 py-0.5 font-mono text-[10.5px]"
                  >
                    <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground/70">
                      {match.line}
                    </span>
                    <span
                      data-selectable
                      className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-pre text-foreground/90"
                    >
                      <HighlightedLine
                        text={match.preview.replace(/^\s+/, "")}
                        lang={lang}
                        highlighter={highlighter}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Renders a single result line with Shiki tokens; falls back to plain text
 * until the highlighter (or the file's language) is available.
 */
function HighlightedLine({
  text,
  lang,
  highlighter,
}: {
  text: string
  lang: BundledLanguage | null
  highlighter: Highlighter | null
}) {
  const { resolvedTheme } = useTheme()
  const tokens = useMemo(() => {
    if (!highlighter || !lang) return null
    try {
      return (
        highlighter.codeToTokensBase(text, {
          lang,
          theme:
            resolvedTheme === "dark"
              ? HIGHLIGHT_THEMES.dark
              : HIGHLIGHT_THEMES.light,
        })[0] ?? null
      )
    } catch {
      return null
    }
  }, [highlighter, lang, text, resolvedTheme])

  if (!tokens) return <>{text}</>
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={index}
          style={token.color ? { color: token.color } : undefined}
        >
          {token.content}
        </span>
      ))}
    </>
  )
}
