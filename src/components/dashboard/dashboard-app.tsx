import { Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { SidebarPanel } from "@/components/dashboard/sidebar-panel"
import { ProjectFilters } from "@/components/dashboard/project-filters"
import type {
  OwnershipFilter,
  ProjectTypeFilter,
  StatusFilter,
} from "@/components/dashboard/project-filters"
import { ProjectTable } from "@/components/dashboard/project-table"
import { QuickResume } from "@/components/dashboard/quick-resume"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  type OpenTarget,
  fetchPreferences,
  openRepoPath,
  runScan,
  savePreferences,
} from "@/lib/api"
import type { Preferences, RepoRecord } from "@/types/repo"

const WEEK_SEC = 7 * 24 * 60 * 60
const STALL_SEC = 30 * 24 * 60 * 60

function isWebApp(repo: RepoRecord): boolean {
  if (!repo.stack.includes("Node")) return false
  return ["React", "Next", "Vue", "Nuxt", "Svelte"].some((t) =>
    repo.stack.includes(t),
  )
}

function matchesFilters(
  repo: RepoRecord,
  query: string,
  ownership: OwnershipFilter,
  status: StatusFilter,
  stack: string,
  projectType: ProjectTypeFilter,
): boolean {
  const q = query.trim().toLowerCase()
  if (q) {
    const hay = `${repo.name} ${repo.path} ${repo.lastCommitMessage ?? ""} ${repo.branch ?? ""}`
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (ownership === "remote" && !repo.remoteUrl) return false
  if (ownership === "local" && repo.remoteUrl) return false

  if (status === "error" && !repo.error) return false
  if (status === "dirty" && (!repo.isDirty || repo.error)) return false
  if (status === "clean" && (repo.error || repo.isDirty)) return false

  if (stack !== "all" && !repo.stack.includes(stack)) return false

  if (projectType === "web" && !isWebApp(repo)) return false

  return true
}

/**
 * Main dashboard layout and data orchestration.
 */
export function DashboardApp() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [repos, setRepos] = useState<RepoRecord[]>([])
  const [scanRoot, setScanRoot] = useState<string | null>(null)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [ownership, setOwnership] = useState<OwnershipFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [stack, setStack] = useState("all")
  const [projectType, setProjectType] = useState<ProjectTypeFilter>("all")

  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!actionFeedback) return
    const t = window.setTimeout(() => setActionFeedback(null), 3200)
    return () => window.clearTimeout(t)
  }, [actionFeedback])

  const loadPrefs = useCallback(async () => {
    const p = await fetchPreferences()
    setPrefs(p)
  }, [])

  const doScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const root = prefs?.scanRoot
      const res = await runScan(root)
      setRepos(res.repos)
      setScanRoot(res.scanRoot)
      setScannedAt(res.scannedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed")
    } finally {
      setLoading(false)
    }
  }, [prefs?.scanRoot])

  useEffect(() => {
    void loadPrefs()
  }, [loadPrefs])

  const initialScanDone = useRef(false)
  useEffect(() => {
    if (!prefs || initialScanDone.current) return
    initialScanDone.current = true
    void doScan()
  }, [prefs, doScan])

  const repoByPath = useMemo(() => {
    const m = new Map<string, RepoRecord>()
    repos.forEach((r) => m.set(r.path, r))
    return m
  }, [repos])

  const stackOptions = useMemo(() => {
    const s = new Set<string>()
    repos.forEach((r) => r.stack.forEach((x) => s.add(x)))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [repos])

  const filtered = useMemo(
    () =>
      repos.filter((r) =>
        matchesFilters(r, query, ownership, status, stack, projectType),
      ),
    [repos, query, ownership, status, stack, projectType],
  )

  const quickResume = useMemo(() => {
    const sorted = [...repos].sort((a, b) => {
      const ae = a.lastCommitEpoch ?? 0
      const be = b.lastCommitEpoch ?? 0
      return be - ae
    })
    return sorted.slice(0, 12)
  }, [repos])

  const pinnedPathsSet = useMemo(
    () => new Set(prefs?.pinnedPaths ?? []),
    [prefs?.pinnedPaths],
  )

  const pinnedRepos = useMemo(() => {
    if (!prefs) return []
    return prefs.pinnedPaths
      .map((p) => repoByPath.get(p))
      .filter((r): r is RepoRecord => Boolean(r))
  }, [prefs, repoByPath])

  const recentRepos = useMemo(() => {
    if (!prefs) return []
    return [...prefs.recent]
      .sort(
        (a, b) =>
          new Date(b.lastOpenedAt).getTime() -
          new Date(a.lastOpenedAt).getTime(),
      )
      .map((e) => repoByPath.get(e.path))
      .filter((r): r is RepoRecord => Boolean(r))
      .slice(0, 12)
  }, [prefs, repoByPath])

  const activeThisWeek = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    return repos.filter((r) => {
      if (!r.lastCommitEpoch || r.error) return false
      return now - r.lastCommitEpoch <= WEEK_SEC
    }).length
  }, [repos])

  const stalled = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    return repos.filter((r) => {
      if (r.error) return true
      if (!r.lastCommitEpoch) return true
      return now - r.lastCommitEpoch >= STALL_SEC
    }).length
  }, [repos])

  const togglePin = useCallback(
    async (path: string) => {
      if (!prefs) return
      const nextPinned = pinnedPathsSet.has(path)
        ? prefs.pinnedPaths.filter((p) => p !== path)
        : [...prefs.pinnedPaths, path]
      const next = await savePreferences({ ...prefs, pinnedPaths: nextPinned })
      setPrefs(next)
    },
    [prefs, pinnedPathsSet],
  )

  const recordOpen = useCallback(
    async (path: string) => {
      if (!prefs) return
      const entry = { path, lastOpenedAt: new Date().toISOString() }
      const rest = prefs.recent.filter((r) => r.path !== path)
      const nextRecent = [entry, ...rest].slice(0, 40)
      try {
        const next = await savePreferences({ ...prefs, recent: nextRecent })
        setPrefs(next)
        let copied = false
        try {
          await navigator.clipboard.writeText(path)
          copied = true
        } catch {
          copied = false
        }
        setActionFeedback(
          copied
            ? "Added to Recent · path copied to clipboard"
            : "Added to Recent (clipboard unavailable in this context)",
        )
      } catch (e) {
        setActionFeedback(
          e instanceof Error ? e.message : "Could not save preferences",
        )
      }
    },
    [prefs],
  )

  const openExternal = useCallback(
    async (path: string, target: OpenTarget) => {
      try {
        await openRepoPath(path, target)
        setActionFeedback(
          target === "finder" ? "Opened in Finder" : "Opened in Cursor",
        )
      } catch (e) {
        setActionFeedback(
          e instanceof Error ? e.message : "Could not open folder",
        )
      }
    },
    [],
  )

  if (!prefs) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <TooltipProvider delay={200}>
      <div className="relative flex min-h-svh items-start text-foreground">
        {actionFeedback ? (
          <span
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,28rem)] -translate-x-1/2 border border-border bg-card px-4 py-2 text-center text-xs text-foreground shadow-sm"
          >
            {actionFeedback}
          </span>
        ) : null}
        <SidebarPanel
          pinned={pinnedRepos}
          recent={recentRepos}
          activeThisWeek={activeThisWeek}
          stalled={stalled}
          onPick={recordOpen}
          onOpenExternal={(path, target) => void openExternal(path, target)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-6">
            <div>
              <h1 className="text-2xl font-semibold uppercase tracking-wider">
                Project dashboard
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {repos.length} projects found
                {scanRoot ? (
                  <span className="ml-2 text-[10px] opacity-80">
                    · {scanRoot}
                  </span>
                ) : null}
                {scannedAt ? (
                  <span className="ml-2 text-[10px] opacity-80">
                    · scanned {new Date(scannedAt).toLocaleString()}
                  </span>
                ) : null}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void doScan()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Scan projects
            </Button>
          </header>

          <div className="flex flex-1 flex-col gap-8 px-6 py-8">
            {error ? (
              <p className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <QuickResume
              repos={quickResume}
              scanLoading={loading}
              pinnedPaths={pinnedPathsSet}
              onTogglePin={(p) => void togglePin(p)}
              onOpen={(p) => void recordOpen(p)}
              onOpenExternal={(path, target) => void openExternal(path, target)}
            />

            <Separator />

            <ProjectFilters
              query={query}
              onQueryChange={setQuery}
              ownership={ownership}
              onOwnershipChange={setOwnership}
              status={status}
              onStatusChange={setStatus}
              stack={stack}
              stackOptions={stackOptions}
              onStackChange={setStack}
              projectType={projectType}
              onProjectTypeChange={setProjectType}
            />

            <ProjectTable
              repos={filtered}
              pinnedPaths={pinnedPathsSet}
              onTogglePin={(p) => void togglePin(p)}
              onOpen={(p) => void recordOpen(p)}
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
