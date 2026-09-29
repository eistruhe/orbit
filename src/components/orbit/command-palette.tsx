import { useNavigate } from "@tanstack/react-router"
import { Clock, Folder, Pin, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { useOrbit } from "@/components/orbit/orbit-context"
import { TOOLS, type ToolMeta } from "@/components/orbit/tools/tool-registry"
import { interactionCue } from "@/lib/sound"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

const MAX_RESULTS = 12

type PaletteEntry =
  | { kind: "project"; repo: RepoRecord; section: "pinned" | "recent" | "result" }
  | { kind: "tool"; tool: ToolMeta }

/**
 * Subsequence fuzzy score: primary matches weigh over secondary matches,
 * substring hits over scattered matches. Returns null when the query does
 * not match.
 */
function fuzzyScore(query: string, primary: string, secondary: string): number | null {
  const q = query.toLowerCase()
  const name = primary.toLowerCase()
  const path = secondary.toLowerCase()

  if (name.includes(q)) return 1000 - name.indexOf(q) - name.length * 0.01
  if (path.includes(q)) return 500 - path.indexOf(q) * 0.1

  let qi = 0
  for (let i = 0; i < name.length && qi < q.length; i += 1) {
    if (name[i] === q[qi]) qi += 1
  }
  if (qi === q.length) return 100 - name.length * 0.01

  return null
}

/**
 * ⌘K overlay for jumping to any project across all libraries or any tool page.
 */
export function CommandPalette() {
  const { allRepos, pinnedRepos, recentRepos, openProject } = useOrbit()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setQuery("")
        setActiveIndex(0)
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // Subtle open/close; deferred so StrictMode's double effect stays silent.
  useEffect(() => {
    if (!open) return
    let opened = false
    const timer = window.setTimeout(() => {
      opened = true
      interactionCue("open", { emphasis: "subtle" })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (opened) interactionCue("close", { emphasis: "subtle" })
    }
  }, [open])

  const entries = useMemo<PaletteEntry[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      const seen = new Set<string>()
      const result: PaletteEntry[] = []
      for (const repo of pinnedRepos) {
        if (seen.has(repo.path)) continue
        seen.add(repo.path)
        result.push({ kind: "project", repo, section: "pinned" })
      }
      for (const repo of recentRepos) {
        if (seen.has(repo.path)) continue
        seen.add(repo.path)
        result.push({ kind: "project", repo, section: "recent" })
      }
      return result.slice(0, MAX_RESULTS)
    }

    const scored: { entry: PaletteEntry; score: number }[] = []
    for (const repo of allRepos) {
      const score = fuzzyScore(trimmed, repo.name, repo.path)
      if (score !== null) {
        scored.push({ entry: { kind: "project", repo, section: "result" }, score })
      }
    }
    for (const tool of TOOLS) {
      const score = fuzzyScore(trimmed, tool.name, `${tool.path} ${tool.description}`)
      if (score !== null) {
        scored.push({ entry: { kind: "tool", tool }, score })
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map(({ entry }) => entry)
  }, [query, allRepos, pinnedRepos, recentRepos])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.children[activeIndex] as HTMLElement | undefined
    activeEl?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (!open) return null

  const pick = (entry: PaletteEntry) => {
    setOpen(false)
    if (entry.kind === "project") {
      void openProject(entry.repo.path)
    } else {
      void navigate({ to: entry.tool.path })
    }
  }

  const overlay = (
    <div className="app-no-drag fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-label="Close jumper"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to project or tool"
        className="relative z-10 w-full max-w-lg border border-border bg-card text-card-foreground shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="size-1.5 bg-highlight" aria-hidden />
          <h3 className="text-[10px] font-medium uppercase tracking-[0.16em]">
            [Jump to]
          </h3>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            esc to close
          </span>
        </header>

        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false)
              } else if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, entries.length - 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (event.key === "Enter") {
                event.preventDefault()
                const entry = entries[activeIndex]
                if (entry) pick(entry)
              }
            }}
            placeholder="Type a project or tool name…"
            className="h-10 w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {query.trim() ? "No matching projects or tools" : "No pinned or recent projects"}
            </p>
          ) : (
            entries.map((entry, index) => (
              <button
                key={entry.kind === "project" ? entry.repo.path : entry.tool.id}
                type="button"
                onClick={() => pick(entry)}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-border/40 px-3 py-2 text-left last:border-b-0",
                  index === activeIndex ? "bg-muted-foreground/10" : "bg-transparent",
                )}
              >
                {entry.kind === "tool" ? (
                  <entry.tool.icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : entry.section === "pinned" ? (
                  <Pin className="size-3 shrink-0 text-highlight" aria-hidden />
                ) : entry.section === "recent" ? (
                  <Clock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Folder className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {entry.kind === "project" ? (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-foreground">
                      {entry.repo.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {entry.repo.path}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-foreground">
                      {entry.tool.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {entry.tool.description}
                    </span>
                  </span>
                )}
                {entry.kind === "project" && entry.repo.branch ? (
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                    {entry.repo.branch}
                  </span>
                ) : entry.kind === "tool" ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    tool
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
