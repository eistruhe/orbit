import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { MetadataDialog } from "@/components/orbit/metadata-dialog"
import {
  OrbitContext,
  type OrbitContextValue,
} from "@/components/orbit/orbit-context"
import { SidebarPanel } from "@/components/orbit/sidebar-panel"
import type {
  OwnershipFilter,
  ProjectTypeFilter,
  StatusFilter,
} from "@/components/orbit/project-filters"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  type OpenTarget,
  fetchPreferences,
  openRepoPath,
  runScan,
  savePreferences,
} from "@/lib/api"
import { toBrowserRemoteUrl } from "@/lib/remote-url"
import type { Preferences, ProjectLibrary, RepoRecord } from "@/types/repo"

const WEEK_SEC = 7 * 24 * 60 * 60
const STALL_SEC = 30 * 24 * 60 * 60
const PRIMARY_LIBRARY_ID = "primary"

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
  tag: string,
  repoNotes: Record<string, string>,
  repoTags: Record<string, string[]>,
): boolean {
  const tags = repoTags[repo.path] ?? []
  const note = repoNotes[repo.path] ?? ""
  const q = query.trim().toLowerCase()
  if (q) {
    const hay =
      `${repo.name} ${repo.path} ${repo.lastCommitMessage ?? ""} ${repo.branch ?? ""} ${note} ${tags.join(" ")}`
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

  if (tag !== "all" && !tags.includes(tag)) return false

  return true
}

function normalizePath(value: string): string {
  return value.replace(/\/+$/, "")
}

function pathIsWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(rootPath)
  if (!normalizedRoot) return false
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  )
}

function buildProjectLibraries(prefs: Preferences | null): ProjectLibrary[] {
  const primaryPath = prefs?.scanRoot?.trim() ?? ""
  const primaryLabel = prefs?.primaryScanRootLabel?.trim() || "Projects"
  const primary: ProjectLibrary = {
    id: PRIMARY_LIBRARY_ID,
    label: primaryLabel,
    path: primaryPath,
  }
  if (!prefs) return [primary]
  const extras = prefs.additionalScanRoots.filter(
    (library) => library.id !== PRIMARY_LIBRARY_ID,
  )
  return [primary, ...extras]
}

function getLibraryRouteId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/lib\/([^/]+)/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function getDetailRoutePath(pathname: string): string | null {
  const match = pathname.match(/^\/project\/(.+)/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/**
 * Main Orbit layout and data orchestration.
 */
export function OrbitApp() {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [reposByLibrary, setReposByLibrary] = useState<Record<string, RepoRecord[]>>({})
  const [scanMetaByLibrary, setScanMetaByLibrary] = useState<
    Record<string, { scanRoot: string; scannedAt: string }>
  >({})
  const [loadingByLibrary, setLoadingByLibrary] = useState<Record<string, boolean>>({})
  const [errorByLibrary, setErrorByLibrary] = useState<Record<string, string | null>>({})

  const [query, setQuery] = useState("")
  const [ownership, setOwnership] = useState<OwnershipFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [stack, setStack] = useState("all")
  const [projectType, setProjectType] = useState<ProjectTypeFilter>("all")
  const [tag, setTag] = useState("all")

  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [metaDialogPath, setMetaDialogPath] = useState<string | null>(null)
  const [metaSaving, setMetaSaving] = useState(false)

  useEffect(() => {
    if (!actionFeedback) return
    const t = window.setTimeout(() => setActionFeedback(null), 3200)
    return () => window.clearTimeout(t)
  }, [actionFeedback])

  const loadPrefs = useCallback(async () => {
    const p = await fetchPreferences()
    setPrefs(p)
  }, [])

  const projectLibraries = useMemo(() => buildProjectLibraries(prefs), [prefs])

  const doScan = useCallback(async (libraryId?: string) => {
    const nextLibraryId = libraryId ?? PRIMARY_LIBRARY_ID
    const library =
      projectLibraries.find((entry) => entry.id === nextLibraryId) ??
      projectLibraries[0]
    if (!library) return

    setLoadingByLibrary((current) => ({ ...current, [library.id]: true }))
    setErrorByLibrary((current) => ({ ...current, [library.id]: null }))
    try {
      const res = await runScan({
        scanRoot: library.path || undefined,
        libraryId: library.id,
      })
      const responseLibraryId = res.libraryId || library.id
      setReposByLibrary((current) => ({
        ...current,
        [responseLibraryId]: res.repos,
      }))
      setScanMetaByLibrary((current) => ({
        ...current,
        [responseLibraryId]: {
          scanRoot: res.scanRoot,
          scannedAt: res.scannedAt,
        },
      }))
    } catch (e) {
      setErrorByLibrary((current) => ({
        ...current,
        [library.id]: e instanceof Error ? e.message : "Scan failed",
      }))
    } finally {
      setLoadingByLibrary((current) => ({ ...current, [library.id]: false }))
    }
  }, [projectLibraries])

  useEffect(() => {
    void loadPrefs()
  }, [loadPrefs])

  const initialScanDone = useRef(false)
  useEffect(() => {
    if (!prefs || initialScanDone.current) return
    initialScanDone.current = true
    void doScan(PRIMARY_LIBRARY_ID)
  }, [prefs, doScan])

  useEffect(() => {
    const libraryIds = new Set(projectLibraries.map((library) => library.id))
    setReposByLibrary((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([libraryId]) => libraryIds.has(libraryId)),
      ),
    )
    setScanMetaByLibrary((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([libraryId]) => libraryIds.has(libraryId)),
      ),
    )
    setLoadingByLibrary((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([libraryId]) => libraryIds.has(libraryId)),
      ),
    )
    setErrorByLibrary((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([libraryId]) => libraryIds.has(libraryId)),
      ),
    )
  }, [projectLibraries])

  const allRepos = useMemo(
    () => Object.values(reposByLibrary).flat(),
    [reposByLibrary],
  )

  const repoByPath = useMemo(() => {
    const m = new Map<string, RepoRecord>()
    allRepos.forEach((r) => m.set(r.path, r))
    return m
  }, [allRepos])

  const routeLibraryId = getLibraryRouteId(pathname)
  const routeDetailPath = getDetailRoutePath(pathname)
  const detailLibraryId = routeDetailPath
    ? repoByPath.get(routeDetailPath)?.orbitLibraryId ?? null
    : null
  const activeLibraryId = routeLibraryId ?? detailLibraryId ?? PRIMARY_LIBRARY_ID
  const activeLibrary = useMemo(
    () =>
      projectLibraries.find((library) => library.id === activeLibraryId) ??
      projectLibraries[0],
    [projectLibraries, activeLibraryId],
  )

  useEffect(() => {
    if (!prefs || !activeLibrary) return
    if (reposByLibrary[activeLibrary.id] || loadingByLibrary[activeLibrary.id]) return
    void doScan(activeLibrary.id)
  }, [prefs, activeLibrary, reposByLibrary, loadingByLibrary, doScan])

  useEffect(() => {
    if (!prefs) return
    const pending = new Set<string>()
    for (const pinnedPath of prefs.pinnedPaths) {
      const matchingLibraries = projectLibraries
        .filter((library) => pathIsWithinRoot(pinnedPath, library.path))
        .sort((a, b) => b.path.length - a.path.length)
      const matchingLibrary = matchingLibraries[0]
      if (!matchingLibrary || matchingLibrary.id === PRIMARY_LIBRARY_ID) continue
      if (reposByLibrary[matchingLibrary.id] || loadingByLibrary[matchingLibrary.id]) {
        continue
      }
      pending.add(matchingLibrary.id)
    }
    pending.forEach((libraryId) => {
      void doScan(libraryId)
    })
  }, [prefs, projectLibraries, reposByLibrary, loadingByLibrary, doScan])

  const repos = useMemo(
    () => (activeLibrary ? reposByLibrary[activeLibrary.id] ?? [] : []),
    [activeLibrary, reposByLibrary],
  )

  const stackOptions = useMemo(() => {
    const s = new Set<string>()
    repos.forEach((r) => r.stack.forEach((x) => s.add(x)))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [repos])

  const repoNotes = useMemo(() => prefs?.repoNotes ?? {}, [prefs?.repoNotes])
  const repoTags = useMemo(() => prefs?.repoTags ?? {}, [prefs?.repoTags])

  const tagOptions = useMemo(() => {
    const s = new Set<string>()
    Object.values(repoTags).forEach((tagsForRepo) => {
      tagsForRepo.forEach((tagValue) => s.add(tagValue))
    })
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [repoTags])

  const filtered = useMemo(
    () =>
      repos.filter((r) =>
        matchesFilters(
          r,
          query,
          ownership,
          status,
          stack,
          projectType,
          tag,
          repoNotes,
          repoTags,
        ),
      ),
    [repos, query, ownership, status, stack, projectType, tag, repoNotes, repoTags],
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

  const scanRoot = activeLibrary
    ? (scanMetaByLibrary[activeLibrary.id]?.scanRoot ??
      (activeLibrary.path || null))
    : null
  const scannedAt = activeLibrary
    ? (scanMetaByLibrary[activeLibrary.id]?.scannedAt ?? null)
    : null
  const loading = activeLibrary ? Boolean(loadingByLibrary[activeLibrary.id]) : false
  const error = activeLibrary ? (errorByLibrary[activeLibrary.id] ?? null) : null

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
      } catch (e) {
        setActionFeedback(
          e instanceof Error ? e.message : "Could not save preferences",
        )
      }
    },
    [prefs],
  )

  const openProject = useCallback(
    async (path: string) => {
      await recordOpen(path)
      navigate({
        to: "/project/$encodedPath",
        params: { encodedPath: encodeURIComponent(path) },
      })
    },
    [recordOpen, navigate],
  )

  const openExternal = useCallback(
    async (path: string, target: OpenTarget) => {
      try {
        await openRepoPath(path, target)
        const message =
          target === "finder"
            ? "Opened in Finder"
            : target === "cursor"
              ? "Opened in Cursor"
              : target === "github"
                ? "Opened in GitHub Desktop"
                : "Opened in Browser"
        setActionFeedback(message)
      } catch (e) {
        setActionFeedback(
          e instanceof Error ? e.message : "Could not open folder",
        )
      }
    },
    [],
  )

  const openRemote = useCallback((remoteUrl: string | null) => {
    const browserUrl = toBrowserRemoteUrl(remoteUrl)
    if (!browserUrl) {
      setActionFeedback("Remote URL is missing or unsupported")
      return
    }
    window.open(browserUrl, "_blank", "noopener,noreferrer")
    setActionFeedback("Opened remote in browser")
  }, [])

  const openMetadataDialog = useCallback((path: string) => {
    if (!prefs) return
    setMetaDialogPath(path)
  }, [prefs])

  const closeMetadataDialog = useCallback(() => {
    if (metaSaving) return
    setMetaDialogPath(null)
  }, [metaSaving])

  const saveMetadata = useCallback(
    async (tagsInput: string, noteInput: string) => {
      if (!prefs || !metaDialogPath || metaSaving) return

      const safeRepoTags = prefs.repoTags ?? {}
      const safeRepoNotes = prefs.repoNotes ?? {}
      const nextTags = [
        ...new Set(
          tagsInput
            .split(",")
            .map((tagValue) => tagValue.trim())
            .filter(Boolean),
        ),
      ]

      const nextRepoTags = { ...safeRepoTags }
      if (nextTags.length > 0) {
        nextRepoTags[metaDialogPath] = nextTags
      } else {
        delete nextRepoTags[metaDialogPath]
      }

      const nextRepoNotes = { ...safeRepoNotes }
      const nextNote = noteInput.trim()
      if (nextNote) {
        nextRepoNotes[metaDialogPath] = nextNote
      } else {
        delete nextRepoNotes[metaDialogPath]
      }

      try {
        setMetaSaving(true)
        const next = await savePreferences({
          ...prefs,
          repoTags: nextRepoTags,
          repoNotes: nextRepoNotes,
        })
        setPrefs(next)
        setActionFeedback("Saved metadata")
        closeMetadataDialog()
      } catch (e) {
        setActionFeedback(
          e instanceof Error ? e.message : "Could not save metadata",
        )
      } finally {
        setMetaSaving(false)
      }
    },
    [prefs, metaDialogPath, metaSaving, closeMetadataDialog],
  )

  const saveAllPreferences = useCallback(async (next: Preferences) => {
    const saved = await savePreferences(next)
    setPrefs(saved)
  }, [])

  if (!prefs) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 bg-background text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  const contextValue: OrbitContextValue = {
    prefs,
    projectLibraries,
    activeLibraryId: activeLibrary?.id ?? PRIMARY_LIBRARY_ID,
    activeLibrary: activeLibrary ?? projectLibraries[0],
    repos,
    scanRoot,
    scannedAt,
    loading,
    error,
    query,
    ownership,
    status,
    stack,
    projectType,
    tag,
    stackOptions,
    tagOptions,
    filtered,
    quickResume,
    pinnedPathsSet,
    pinnedRepos,
    recentRepos,
    activeThisWeek,
    stalled,
    repoByPath,
    repoNotes,
    repoTags,
    setQuery,
    setOwnership,
    setStatus,
    setStack,
    setProjectType,
    setTag,
    doScan,
    saveAllPreferences,
    togglePin,
    openProject,
    openExternal,
    openRemote,
    openMetadataDialog,
  }

  return (
    <OrbitContext.Provider value={contextValue}>
      <TooltipProvider delay={200}>
        <div className="relative flex min-h-svh items-start bg-background bg-shell-gradient text-foreground">
          {actionFeedback ? (
            <span
              role="status"
              aria-live="polite"
              className="fixed bottom-6 left-1/2 z-50 inline-flex max-w-[min(90vw,28rem)] -translate-x-1/2 items-center gap-2 border border-border bg-card px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.06em] text-foreground shadow-lg"
            >
              <span className="size-1.5 bg-highlight shadow-[0_0_6px_var(--highlight)]" aria-hidden />
              {actionFeedback}
            </span>
          ) : null}
          <SidebarPanel
            projectLibraries={projectLibraries}
            activeLibraryId={activeLibrary?.id ?? PRIMARY_LIBRARY_ID}
            pinned={pinnedRepos}
            recent={recentRepos}
            activeThisWeek={activeThisWeek}
            stalled={stalled}
            onPick={openProject}
            onOpenExternal={openExternal}
          />

          <main className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
        {metaDialogPath ? (
          <MetadataDialog
            path={metaDialogPath}
            repoName={repoByPath.get(metaDialogPath)?.name ?? metaDialogPath}
            initialTags={prefs.repoTags?.[metaDialogPath]?.join(", ") ?? ""}
            initialNote={prefs.repoNotes?.[metaDialogPath] ?? ""}
            saving={metaSaving}
            onClose={closeMetadataDialog}
            onSave={saveMetadata}
          />
        ) : null}
      </TooltipProvider>
    </OrbitContext.Provider>
  )
}
