import { useNavigate } from "@tanstack/react-router"
import { ArrowRight, Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { SectionHeading } from "@/components/orbit/section-heading"
import {
  DotColumns,
  EmptyHint,
  KpiCell,
  Panel,
  SegmentBar,
  StatRow,
  SubLabel,
} from "@/components/orbit/stats-primitives"
import {
  RecentRunsTable,
  SavingsHeader,
  SavingsRows,
  TABLE_HEAD,
  TABLE_ROW,
} from "@/components/orbit/stats-tables"
import { Button } from "@/components/ui/button"
import { type StatsSummary, fetchStatsSummary } from "@/lib/api"
import { baseName, bytes, count, formatLabel, reduction, shortDate, sum } from "@/lib/stats-format"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

const DAY_SEC = 24 * 60 * 60
/** Same thresholds as the sidebar's "active this week" and "stalled" counts. */
const WEEK_SEC = 7 * DAY_SEC
const MONTH_SEC = 30 * DAY_SEC
/** Tinify's free plan; paid plans are billed per compression instead. */
const TINIFY_FREE_LIMIT = 500
const STACK_ROWS = 7

function monthFromKey(key: string): Date {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

/**
 * When the free Tinify quota runs out if this month continues at its
 * current daily average; null when it does not.
 */
function tinifyLimitAtPace(used: number, now: Date): Date | null {
  const day = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const perDay = used / day
  if (perDay <= 0 || perDay * daysInMonth < TINIFY_FREE_LIMIT) return null
  return new Date(now.getFullYear(), now.getMonth(), Math.ceil(TINIFY_FREE_LIMIT / perDay))
}

const PROJECTS_GRID = "grid grid-cols-[2rem_minmax(0,1fr)_3.5rem_4.5rem_5.5rem]"

/**
 * Statistics: lifetime savings from the image tools and cleanups (from the
 * stats log), the Tinify quota, and a snapshot of all scanned projects.
 */
export function StatsPage() {
  const navigate = useNavigate()
  const {
    allRepos,
    projectLibraries,
    scanMetaByLibrary,
    loadingByLibrary,
    doScan,
    devServers,
  } = useOrbit()
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setSummary(await fetchStatsSummary())
      setNow(new Date())
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load statistics")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Libraries are scanned lazily elsewhere; this page needs all of them.
  const requestedScans = useRef(new Set<string>())
  useEffect(() => {
    for (const library of projectLibraries) {
      if (scanMetaByLibrary[library.id] || loadingByLibrary[library.id]) continue
      if (requestedScans.current.has(library.id)) continue
      requestedScans.current.add(library.id)
      void doScan(library.id)
    }
  }, [projectLibraries, scanMetaByLibrary, loadingByLibrary, doScan])

  const scanning = projectLibraries.some((library) => loadingByLibrary[library.id])
  const oldestScan = useMemo(() => {
    const scans = projectLibraries
      .map((library) => scanMetaByLibrary[library.id]?.scannedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
    return scans[0] ?? null
  }, [projectLibraries, scanMetaByLibrary])

  const workspace = useMemo(() => {
    const nowSec = now.getTime() / 1000
    const commitAge = (repo: RepoRecord) =>
      repo.lastCommitEpoch ? nowSec - repo.lastCommitEpoch : Infinity
    const healthy = allRepos.filter((repo) => !repo.error)
    return {
      projects: allRepos.length,
      active7: healthy.filter((repo) => commitAge(repo) <= WEEK_SEC).length,
      active30: healthy.filter((repo) => commitAge(repo) <= MONTH_SEC).length,
      stalled: allRepos.filter((repo) => repo.error || commitAge(repo) >= MONTH_SEC).length,
      dirty: healthy.filter((repo) => repo.isDirty).length,
      unpushed: healthy.filter((repo) => (repo.aheadCount ?? 0) > 0).length,
    }
  }, [allRepos, now])

  const runningDevServers = devServers.filter(
    (server) => server.status === "running" || server.status === "starting",
  ).length

  const libraries = useMemo(
    () =>
      projectLibraries.map((library) => {
        const repos = allRepos.filter((repo) => repo.orbitLibraryId === library.id)
        return {
          id: library.id,
          label: library.label,
          scanned: Boolean(scanMetaByLibrary[library.id]),
          projects: repos.length,
          tree: sum(repos.map((repo) => repo.workingTreeBytes ?? 0)),
          nodeModules: sum(repos.map((repo) => repo.nodeModulesBytes ?? 0)),
          withNodeModules: repos.filter((repo) => (repo.nodeModulesBytes ?? 0) > 0).length,
          unmeasured: repos.filter((repo) => repo.workingTreeBytes == null).length,
        }
      }),
    [projectLibraries, allRepos, scanMetaByLibrary],
  )
  const treeTotal = sum(libraries.map((library) => library.tree))
  const reclaimable = sum(libraries.map((library) => library.nodeModules))
  const reclaimableProjects = sum(libraries.map((library) => library.withNodeModules))
  const unmeasured = sum(libraries.map((library) => library.unmeasured))

  const stacks = useMemo(() => {
    const counts = new Map<string, number>()
    for (const repo of allRepos) {
      for (const stack of new Set(repo.stack)) {
        counts.set(stack, (counts.get(stack) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, count: value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, STACK_ROWS)
  }, [allRepos])

  const repoByTopLevel = useMemo(() => {
    const map = new Map<string, RepoRecord>()
    for (const repo of allRepos) {
      map.set(repo.topLevelPath, repo)
      map.set(repo.path, repo)
    }
    return map
  }, [allRepos])
  const libraryLabel = (libraryId: string | undefined) =>
    projectLibraries.find((library) => library.id === libraryId)?.label ?? null

  if (!summary) {
    return (
      <div className="flex flex-col gap-3">
        <SectionHeading title="Overview" />
        {error ? (
          <div
            role="alert"
            className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          >
            {error}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-6 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading statistics…
          </div>
        )}
      </div>
    )
  }

  const { compression, conversion, cleanup, tinifyQuota } = summary
  const compressionSaved = compression.bytesIn - compression.bytesOut
  const trackingDays = summary.trackingSince
    ? Math.max(1, Math.ceil((now.getTime() - Date.parse(summary.trackingSince)) / (DAY_SEC * 1000)))
    : 0
  const compressedFormats = [
    ...new Set(compression.groups.map((group) => formatLabel(group.formatIn))),
  ]

  const used = tinifyQuota.used
  const quotaMonth = monthFromKey(tinifyQuota.month)
  const resetsOn = new Date(quotaMonth.getFullYear(), quotaMonth.getMonth() + 1, 1)
  const limitAtPace = used == null ? null : tinifyLimitAtPace(used, now)
  const topSaved = summary.topProjects[0]?.bytesSaved ?? 0

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading
        title="Overview"
        trailing={
          <>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {summary.trackingSince
                ? `Tracking since ${new Date(summary.trackingSince).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })} · ${trackingDays} ${trackingDays === 1 ? "day" : "days"}`
                : "Tracking starts with your next run"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void refresh()}
              aria-label="Refresh statistics"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <RefreshCw className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          </>
        }
      />

      {error ? (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="cell-grid grid gap-px border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <KpiCell
          label="Weight reduced"
          value={bytes(compressionSaved)}
          detail={
            compression.files > 0
              ? `${reduction(compression.bytesIn, compression.bytesOut)} · same format`
              : "Nothing tracked yet"
          }
        >
          <DotColumns values={compression.dailySaved} />
        </KpiCell>
        <KpiCell
          label="Files optimized"
          value={count(compression.files)}
          detail={compressedFormats.length > 0 ? compressedFormats.join(" · ") : "Tinify · SVGO"}
        >
          <DotColumns values={compression.dailyFiles} />
        </KpiCell>
        <KpiCell
          label="Disk freed"
          value={bytes(cleanup.bytesFreed)}
          detail={`${count(cleanup.runs)} node_modules ${cleanup.runs === 1 ? "cleanup" : "cleanups"}`}
        >
          <DotColumns values={cleanup.daily} />
        </KpiCell>
        <KpiCell
          label="Reclaimable now"
          value={bytes(reclaimable)}
          detail={`node_modules · ${count(reclaimableProjects)} ${reclaimableProjects === 1 ? "project" : "projects"}`}
        >
          <SegmentBar
            value={treeTotal > 0 ? reclaimable / treeTotal : 0}
            segments={30}
            label="node_modules share of all measured projects"
            className="w-full"
          />
        </KpiCell>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          tag="Workspace"
          trailing={scanning ? "Scanning…" : oldestScan ? `Scanned ${formatRelativeFromIso(oldestScan)}` : null}
        >
          <StatRow label="Projects" value={count(workspace.projects)} />
          <StatRow label="Libraries" value={count(projectLibraries.length)} />
          <StatRow label="Active · 7 days" value={count(workspace.active7)} />
          <StatRow label="Active · 30 days" value={count(workspace.active30)} />
          <StatRow label="Stalled · 30+ days" value={count(workspace.stalled)} />
          <StatRow
            label="Uncommitted changes"
            value={count(workspace.dirty)}
            tone={workspace.dirty > 0 ? "warning" : undefined}
          />
          <StatRow
            label="Unpushed commits"
            value={count(workspace.unpushed)}
            tone={workspace.unpushed > 0 ? "warning" : undefined}
          />
          <StatRow label="Dev servers running" value={count(runningDevServers)} />
        </Panel>

        <Panel tag="Image optimization" trailing={`Last ${summary.seriesDays} days`} className="lg:col-span-2">
          {compression.groups.length === 0 && conversion.groups.length === 0 ? (
            <EmptyHint>
              Nothing tracked yet.
              <br />
              Tinify, SVGO and image conversions show up here.
            </EmptyHint>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="w-[6.5rem] shrink-0 uppercase tracking-[0.08em] text-foreground">Total</span>
                <SegmentBar
                  value={compression.bytesIn > 0 ? compressionSaved / compression.bytesIn : 0}
                  segments={48}
                  label="Weight reduced, same format"
                  className="flex-1"
                />
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {bytes(compression.bytesIn)} → {bytes(compression.bytesOut)}
                </span>
              </div>

              <div className="mt-4">
                <SavingsHeader label="Same format" />
              </div>
              <div className="py-1">
                {compression.groups.length > 0 ? (
                  <SavingsRows groups={compression.groups} />
                ) : (
                  <p className="py-[5px] text-[11px] text-muted-foreground">No compressions yet.</p>
                )}
              </div>

              {conversion.groups.length > 0 ? (
                <>
                  <div className="mt-2 border-b border-border/60 pb-1.5">
                    <SubLabel>Format conversion · not in total</SubLabel>
                  </div>
                  <div className="pt-1">
                    <SavingsRows groups={conversion.groups} conversion />
                  </div>
                </>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          tag="Tinify quota"
          trailing={quotaMonth.toLocaleDateString("en-GB", { month: "long" })}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[22px] leading-none font-medium tracking-tight tabular-nums text-foreground">
              {used ?? "—"}
              <span className="text-muted-foreground"> / {TINIFY_FREE_LIMIT}</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              compressions
            </span>
          </div>
          <SegmentBar
            value={(used ?? 0) / TINIFY_FREE_LIMIT}
            segments={25}
            dangerFrom={0.8}
            label="Tinify compressions used this month"
            className="mt-3"
          />
          <div className="mt-3">
            <StatRow
              label="Left"
              value={used == null ? "—" : count(Math.max(0, TINIFY_FREE_LIMIT - used))}
            />
            <StatRow
              label="Resets"
              value={shortDate(resetsOn)}
            />
            {used == null ? (
              <StatRow label="Limit at this pace" value="Run Tinify once" tone="muted" />
            ) : used >= TINIFY_FREE_LIMIT ? (
              <StatRow label="Limit at this pace" value="Reached" tone="destructive" />
            ) : limitAtPace ? (
              <StatRow
                label="Limit at this pace"
                value={`~${shortDate(limitAtPace)}`}
                tone="warning"
              />
            ) : (
              <StatRow label="Limit at this pace" value="Not this month" />
            )}
          </div>
          <div className="mt-auto pt-4">
            <div className="grid grid-cols-6 gap-2">
              {tinifyQuota.history.map((entry, index) => {
                const current = index === tinifyQuota.history.length - 1
                const reached = (entry.used ?? 0) >= TINIFY_FREE_LIMIT
                return (
                  <div
                    key={entry.month}
                    className="flex flex-col items-center gap-1.5"
                    title={entry.used == null ? "No data" : `${entry.used} compressions`}
                  >
                    <DotColumns
                      values={[entry.used ?? 0]}
                      max={TINIFY_FREE_LIMIT}
                      rows={10}
                      dot="h-[3px] w-4"
                      litClassName={(_, row) =>
                        reached && row === 9
                          ? "bg-destructive"
                          : current
                            ? "bg-highlight"
                            : "bg-foreground/55"
                      }
                    />
                    <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {monthFromKey(entry.month).toLocaleDateString("en-US", { month: "short" })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </Panel>

        <Panel tag="Disk" trailing={`${bytes(treeTotal)} measured`}>
          <div className="flex flex-col divide-y divide-border/60">
            {libraries.map((library) => (
              <div key={library.id} className="flex flex-col gap-1.5 py-2 first:pt-0">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate uppercase tracking-[0.08em] text-foreground">
                    {library.label}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {library.scanned ? library.projects : "…"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {library.scanned ? bytes(library.tree) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-6 shrink-0 uppercase tracking-[0.08em] text-muted-foreground">NM</span>
                  <SegmentBar
                    value={library.tree > 0 ? library.nodeModules / library.tree : 0}
                    segments={20}
                    label={`node_modules share in ${library.label}`}
                    className="h-2.5 flex-1"
                  />
                  <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                    {library.scanned ? bytes(library.nodeModules) : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {unmeasured > 0 ? (
            <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
              {count(unmeasured)} {unmeasured === 1 ? "project was" : "projects were"} too large to
              measure during the scan and {unmeasured === 1 ? "is" : "are"} not included.
            </p>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>
              Freed so far{" "}
              <span className="tabular-nums text-foreground">{bytes(cleanup.bytesFreed)}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => navigate({ to: "/tools/cleanup" })}
            >
              Cleanup
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </Panel>

        <Panel tag="Stacks" trailing={`${count(workspace.projects)} projects`}>
          {stacks.length === 0 ? (
            <EmptyHint>{scanning ? "Scanning projects…" : "No stacks detected."}</EmptyHint>
          ) : (
            stacks.map((stack) => (
              <div key={stack.label} className="flex items-center gap-3 py-[5px] text-[11px]">
                <span className="w-14 shrink-0 truncate text-foreground">{stack.label}</span>
                <SegmentBar
                  value={workspace.projects > 0 ? stack.count / workspace.projects : 0}
                  segments={20}
                  label={`${stack.label} share of projects`}
                  className="h-2.5 flex-1"
                />
                <span className="w-8 shrink-0 text-right tabular-nums text-foreground">
                  {count(stack.count)}
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                  {Math.round((stack.count / workspace.projects) * 100)}%
                </span>
              </div>
            ))
          )}
          <p className="mt-auto pt-3 text-[10px] leading-relaxed text-muted-foreground">
            Projects can use several stacks, so shares add up to more than 100%.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel tag="Top projects" trailing="By weight reduced" bodyClassName="p-0">
          {summary.topProjects.length === 0 ? (
            <EmptyHint>Optimized files inside a project show up here.</EmptyHint>
          ) : (
            <>
              <div className={cn(PROJECTS_GRID, TABLE_HEAD)}>
                <div>#</div>
                <div>Project</div>
                <div className="text-right">Files</div>
                <div className="text-right">Saved</div>
                <div />
              </div>
              {summary.topProjects.map((project, index) => {
                const repo = repoByTopLevel.get(project.path)
                const library = libraryLabel(repo?.orbitLibraryId)
                return (
                  <div key={project.path} className={cn(PROJECTS_GRID, TABLE_ROW)}>
                    <div className="tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="truncate" title={project.path}>
                      <span className="text-foreground">{repo?.name ?? baseName(project.path)}</span>
                      {library ? (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          {library}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right tabular-nums text-muted-foreground">
                      {count(project.files)}
                    </div>
                    <div className="text-right tabular-nums text-foreground">
                      {bytes(project.bytesSaved)}
                    </div>
                    <div>
                      <SegmentBar
                        value={topSaved > 0 ? project.bytesSaved / topSaved : 0}
                        segments={12}
                        label={`${baseName(project.path)} savings relative to the top project`}
                        className="h-2"
                      />
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </Panel>

        <Panel tag="Recent runs" trailing="All tools" bodyClassName="p-0">
          {summary.recent.length === 0 ? (
            <EmptyHint>Your latest optimizations and cleanups show up here.</EmptyHint>
          ) : (
            <RecentRunsTable runs={summary.recent} now={now} />
          )}
        </Panel>
      </div>
    </div>
  )
}
