import { BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { Suspense, lazy, useEffect, useRef, useState } from "react"

import { type RepoReadmeResponse, fetchRepoReadme } from "@/lib/api"

const ReadmeMarkdown = lazy(() => import("@/components/orbit/readme-markdown"))

type ReadmeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; readme: RepoReadmeResponse }

/**
 * `[Readme]` panel on the project detail page, expanded by default. The file
 * and the markdown renderer load lazily once the panel is expanded.
 */
export function ReadmeSection({ repoPath }: { repoPath: string }) {
  const [expanded, setExpanded] = useState(true)
  const [state, setState] = useState<ReadmeState>({ kind: "idle" })
  const fetchedPathRef = useRef<string | null>(null)

  useEffect(() => {
    setExpanded(true)
    setState({ kind: "idle" })
    fetchedPathRef.current = null
  }, [repoPath])

  useEffect(() => {
    if (!expanded || fetchedPathRef.current === repoPath) return
    fetchedPathRef.current = repoPath
    let cancelled = false
    let settled = false
    setState({ kind: "loading" })
    void (async () => {
      try {
        const readme = await fetchRepoReadme(repoPath)
        settled = true
        if (cancelled) return
        setState(readme ? { kind: "loaded", readme } : { kind: "missing" })
      } catch (error: unknown) {
        settled = true
        if (cancelled) return
        setState({
          kind: "error",
          message:
            error instanceof Error ? error.message : "Could not load README",
        })
      }
    })()
    return () => {
      cancelled = true
      // An interrupted fetch should retry on the next expand.
      if (!settled) fetchedPathRef.current = null
    }
  }, [expanded, repoPath])

  return (
    <section className="border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.16em] text-foreground">
            [Readme]
          </span>
          {state.kind === "loaded" ? (
            <span className="font-mono text-[9px] text-muted-foreground">
              {state.readme.fileName}
              {state.readme.truncated ? " · truncated" : ""}
            </span>
          ) : null}
        </span>
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-border p-3">
          {state.kind === "loading" || state.kind === "idle" ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading README…
            </div>
          ) : state.kind === "missing" ? (
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              No README in this project.
            </p>
          ) : state.kind === "error" ? (
            <p className="text-[11px] text-destructive">{state.message}</p>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Rendering…
                </div>
              }
            >
              <ReadmeMarkdown content={state.readme.content} />
            </Suspense>
          )}
        </div>
      ) : null}
    </section>
  )
}
