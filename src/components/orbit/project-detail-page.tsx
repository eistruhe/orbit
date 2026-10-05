import { Link, useParams } from "@tanstack/react-router"
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Pin,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { DeleteNodeModulesDialog } from "@/components/orbit/delete-node-modules-dialog"
import { DevServerSection } from "@/components/orbit/dev-server-section"
import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { useOrbit } from "@/components/orbit/orbit-context"
import { ReadmeSection } from "@/components/orbit/readme-section"
import { StatusBadge } from "@/components/orbit/status-badge"
import {
  DotColumns,
  EmptyHint,
  KpiCell,
  Panel,
  SegmentBar,
  StatRow,
  SubLabel,
} from "@/components/orbit/stats-primitives"
import { RecentRunsTable, SavingsHeader, SavingsRows } from "@/components/orbit/stats-tables"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  type RepoBranchesResponse,
  type SslCertificate,
  type StatsSummary,
  checkSsl,
  deleteRepoNodeModules,
  fetchRepoActivity,
  fetchRepoBranches,
  fetchSeoAudit,
  fetchStatsSummary,
  gitFetchRepo,
} from "@/lib/api"
import { formatBytes } from "@/lib/format-size"
import { syncLabel } from "@/lib/repo-facts"
import { bytes, count, reduction, shortDate, sum } from "@/lib/stats-format"
import { cue } from "@/lib/sound"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"

const BRANCH_ROWS = 8
/** SSL lifetime segments turn red for the last two weeks. */
const SSL_WARN_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

function decodeProjectPath(value: string | undefined): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** Host of a git remote (https or scp-style ssh); null when unparsable. */
function remoteHost(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null
  try {
    return new URL(remoteUrl.replace(/^[^@/]+@([^:/]+):/, "https://$1/")).hostname || null
  } catch {
    return null
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function StatusLine({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return tone === "error" ? (
    <div
      role="alert"
      className="mt-3 border border-destructive/35 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive"
    >
      {children}
    </div>
  ) : (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 flex items-center gap-2 border border-highlight/35 bg-highlight/10 px-2.5 py-1.5 text-[11px] text-foreground"
    >
      <CheckCircle2 className="size-3.5 shrink-0 text-highlight" aria-hidden />
      {children}
    </div>
  )
}

function BranchColumn({ title, items }: { title: string; items: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, BRANCH_ROWS)
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
        <SubLabel>{title}</SubLabel>
        <span className="text-[10px] tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-[5px] text-[11px] text-muted-foreground">None</p>
      ) : (
        <ul className="pt-1" data-selectable>
          {visible.map((name) => (
            <li key={name} className="truncate py-[3px] text-[11px] text-foreground" title={name}>
              {name}
            </li>
          ))}
        </ul>
      )}
      {items.length > BRANCH_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="pt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : `+${items.length - BRANCH_ROWS} more`}
        </button>
      ) : null}
    </div>
  )
}

type ActionStatus = { source: "git" | "disk" | "site"; tone: "success" | "error"; text: string }

/**
 * Project page in the Statistics style: git, disk and dev server from the
 * scan, savings and runs from the stats log, SSL and SEO for the live URL
 * set in the project's metadata.
 */
export function ProjectDetailPage() {
  const {
    repoByPath,
    projectLibraries,
    pinnedPathsSet,
    repoNotes,
    repoTags,
    repoUrls,
    togglePin,
    openExternal,
    openRemote,
    openMetadataDialog,
    doScan,
  } = useOrbit()
  const { encodedPath } = useParams({ from: "/projects-layout/project/$encodedPath" })
  const decodedPath = useMemo(() => decodeProjectPath(encodedPath), [encodedPath])
  const repo = decodedPath ? (repoByPath.get(decodedPath) ?? null) : null
  const repoPath = repo?.path ?? null
  const lastCommitHash = repo?.lastCommitHash ?? null
  const liveUrl = repoPath ? (repoUrls[repoPath] ?? null) : null

  const [branches, setBranches] = useState<RepoBranchesResponse | null>(null)
  const [branchesError, setBranchesError] = useState<string | null>(null)
  const [branchReloadKey, setBranchReloadKey] = useState(0)
  const [commitsPerDay, setCommitsPerDay] = useState<number[] | null>(null)
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [statsReloadKey, setStatsReloadKey] = useState(0)
  const [ssl, setSsl] = useState<SslCertificate | null>(null)
  const [sslLoading, setSslLoading] = useState(false)
  const [sslReloadKey, setSslReloadKey] = useState(0)
  const [seoRunning, setSeoRunning] = useState(false)
  const [gitFetching, setGitFetching] = useState(false)
  const [deletingNodeModules, setDeletingNodeModules] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [status, setStatus] = useState<ActionStatus | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    void (async () => {
      setBranchesError(null)
      try {
        const result = await fetchRepoBranches(repoPath)
        if (!cancelled) setBranches(result)
      } catch (error: unknown) {
        if (!cancelled) {
          setBranchesError(error instanceof Error ? error.message : "Could not load branches")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repoPath, branchReloadKey])

  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    void fetchRepoActivity(repoPath)
      .then((activity) => {
        if (!cancelled) setCommitsPerDay(activity.commitsPerDay)
      })
      .catch(() => {
        if (!cancelled) setCommitsPerDay(null)
      })
    return () => {
      cancelled = true
    }
  }, [repoPath, lastCommitHash])

  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    void fetchStatsSummary({ project: repoPath, site: liveUrl ?? undefined })
      .then((summary) => {
        if (cancelled) return
        setStats(summary)
        setNow(new Date())
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
    return () => {
      cancelled = true
    }
  }, [repoPath, liveUrl, statsReloadKey])

  useEffect(() => {
    if (!liveUrl) return
    let cancelled = false
    void (async () => {
      setSslLoading(true)
      try {
        const results = await checkSsl([hostOf(liveUrl)])
        if (!cancelled) setSsl(results[0] ?? null)
      } catch (error: unknown) {
        if (cancelled) return
        setSsl({
          domain: hostOf(liveUrl),
          ok: false,
          error: error instanceof Error ? error.message : "SSL check failed",
          subject: null,
          issuer: null,
          validFrom: null,
          validTo: null,
          daysLeft: null,
          altNames: [],
          chain: [],
          protocol: null,
          selfSigned: false,
        })
      } finally {
        if (!cancelled) setSslLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liveUrl, sslReloadKey])

  useEffect(() => {
    if (status?.tone !== "success") return
    const id = window.setTimeout(() => setStatus(null), 3800)
    return () => window.clearTimeout(id)
  }, [status])

  const runSeoAudit = useCallback(() => {
    if (!liveUrl) return
    setStatus(null)
    setSeoRunning(true)
    void (async () => {
      try {
        const result = await fetchSeoAudit(liveUrl)
        setStatus({ source: "site", tone: "success", text: `SEO score ${result.audit.score} / 100.` })
        cue("success", { emphasis: "subtle" })
        setStatsReloadKey((key) => key + 1)
      } catch (error: unknown) {
        cue("error")
        setStatus({
          source: "site",
          tone: "error",
          text: error instanceof Error ? error.message : "SEO audit failed",
        })
      } finally {
        setSeoRunning(false)
      }
    })()
  }, [liveUrl])

  if (!decodedPath || !repo) {
    return (
      <section className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          Project not in current scan.
        </p>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Back to Projects
        </Link>
      </section>
    )
  }

  const library = projectLibraries.find((entry) => entry.id === repo.orbitLibraryId) ?? null
  const tags = repoTags[repo.path] ?? []
  const note = repoNotes[repo.path]
  const sync = syncLabel(repo)
  const outOfSync = (repo.aheadCount ?? 0) > 0 || (repo.behindCount ?? 0) > 0
  const tree = repo.workingTreeBytes
  const nodeModules = repo.nodeModulesBytes
  const nodeModulesShare = tree && nodeModules ? nodeModules / tree : 0
  const commitsInWindow = commitsPerDay ? sum(commitsPerDay) : null

  const compression = stats?.compression
  const conversionGroups = stats?.conversion.groups ?? []
  const compressionSaved = compression ? compression.bytesIn - compression.bytesOut : 0
  const hasSavings = Boolean(
    compression && (compression.groups.length > 0 || conversionGroups.length > 0),
  )

  // A result for a URL that was since removed or changed is ignored.
  const siteSsl = liveUrl && ssl?.domain === hostOf(liveUrl) ? ssl : null
  const sslPending = Boolean(liveUrl) && (sslLoading || !siteSsl)
  const sslLifetimeDays =
    siteSsl?.validFrom && siteSsl.validTo
      ? Math.max(1, Math.round((Date.parse(siteSsl.validTo) - Date.parse(siteSsl.validFrom)) / DAY_MS))
      : null
  const sslElapsedShare =
    sslLifetimeDays && siteSsl?.daysLeft != null
      ? (sslLifetimeDays - siteSsl.daysLeft) / sslLifetimeDays
      : 0
  const seo = stats?.seoAudit ?? null

  const runGitFetch = () => {
    setStatus(null)
    setGitFetching(true)
    void (async () => {
      try {
        await gitFetchRepo(repo.path)
        setBranchReloadKey((key) => key + 1)
        setStatus({ source: "git", tone: "success", text: "Fetched latest from remote." })
        cue("success", { emphasis: "subtle" })
        void doScan(repo.orbitLibraryId)
      } catch (error: unknown) {
        cue("error")
        setStatus({
          source: "git",
          tone: "error",
          text: error instanceof Error ? error.message : "git fetch failed",
        })
      } finally {
        setGitFetching(false)
      }
    })()
  }

  const confirmDeleteNodeModules = () => {
    setStatus(null)
    setDeletingNodeModules(true)
    void (async () => {
      try {
        const { skipped } = await deleteRepoNodeModules(repo.path)
        setStatus({
          source: "disk",
          tone: "success",
          text: skipped ? "No node_modules folder was found." : "Removed node_modules.",
        })
        cue("success", { emphasis: skipped ? "subtle" : "strong" })
        if (!skipped) {
          void doScan(repo.orbitLibraryId)
          setStatsReloadKey((key) => key + 1)
        }
      } catch (error: unknown) {
        cue("error")
        setStatus({
          source: "disk",
          tone: "error",
          text: error instanceof Error ? error.message : "Could not delete node_modules",
        })
      } finally {
        setDeletingNodeModules(false)
        setDeleteDialogOpen(false)
      }
    })()
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)]" aria-hidden />
              {repo.orbitLibraryId === "primary" ? (
                <Link to="/" className="hover:text-foreground">
                  {library?.label ?? "Projects"}
                </Link>
              ) : (
                <Link
                  to="/projects/lib/$libraryId"
                  params={{ libraryId: repo.orbitLibraryId }}
                  className="hover:text-foreground"
                >
                  {library?.label ?? "Projects"}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              <h1 className="min-w-0 text-2xl font-medium uppercase tracking-[0.04em] wrap-break-word">
                {repo.name}
              </h1>
              <StatusBadge repo={repo} />
            </div>
            <p className="text-[11px] break-all text-muted-foreground" data-selectable>
              {repo.path}
            </p>
            {repo.stack.length > 0 || tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {repo.stack.map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex h-5 items-center border border-border bg-surface-2 px-1.5 text-[10px] uppercase tracking-[0.06em] text-foreground/80"
                  >
                    {tech}
                  </span>
                ))}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-5 items-center border border-highlight/40 bg-highlight/10 px-1.5 text-[10px] uppercase tracking-[0.06em] text-highlight"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            {note ? (
              <p className="text-[11px] italic text-muted-foreground" data-selectable>
                {note}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => void togglePin(repo.path)}>
              <Pin
                className={cn(
                  "size-3.5",
                  pinnedPathsSet.has(repo.path) ? "text-highlight" : "text-muted-foreground",
                )}
              />
              {pinnedPathsSet.has(repo.path) ? "Pinned" : "Pin"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openMetadataDialog(repo.path)}>
              <Pencil className="size-3.5 text-muted-foreground" />
              Meta
            </Button>
            <OpenTargetButtons
              path={repo.path}
              onOpenExternal={openExternal}
              remoteUrl={repo.remoteUrl}
              onOpenRemote={() => openRemote(repo.remoteUrl)}
            />
          </div>
        </div>
      </div>

      <div className="cell-grid grid gap-px border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <KpiCell
          label="Last commit"
          value={formatRelativeFromIso(repo.lastCommitIso)}
          detail={
            commitsInWindow == null
              ? "Last 30 days"
              : `${count(commitsInWindow)} ${commitsInWindow === 1 ? "commit" : "commits"} · 30 days`
          }
        >
          <DotColumns values={commitsPerDay ?? new Array<number>(30).fill(0)} />
        </KpiCell>
        <KpiCell
          label="Disk"
          value={tree != null ? bytes(tree) : "—"}
          detail={
            tree == null
              ? "Too large to measure"
              : nodeModules
                ? `node_modules ${formatBytes(nodeModules)}`
                : "No node_modules"
          }
        >
          <SegmentBar
            value={nodeModulesShare}
            segments={30}
            label="node_modules share of the project"
            className="w-full"
          />
        </KpiCell>
        <KpiCell
          label="Weight reduced"
          value={bytes(compressionSaved)}
          detail={
            compression && compression.files > 0
              ? `${count(compression.files)} files · ${reduction(compression.bytesIn, compression.bytesOut)}`
              : "Nothing tracked yet"
          }
        >
          <DotColumns values={compression?.dailySaved ?? new Array<number>(30).fill(0)} />
        </KpiCell>
        <KpiCell
          label="SSL certificate"
          value={
            !liveUrl
              ? "—"
              : sslPending
                ? "…"
                : siteSsl?.daysLeft != null && siteSsl.daysLeft > 0
                  ? `${siteSsl.daysLeft} ${siteSsl.daysLeft === 1 ? "day" : "days"}`
                  : "Error"
          }
          detail={
            !liveUrl
              ? "No live URL"
              : siteSsl && !siteSsl.ok && siteSsl.error
                ? siteSsl.error
                : `left · ${hostOf(liveUrl)}`
          }
        >
          <SegmentBar
            value={sslElapsedShare}
            segments={30}
            dangerFrom={sslLifetimeDays ? 1 - SSL_WARN_DAYS / sslLifetimeDays : undefined}
            label="Certificate lifetime used"
            className="w-full"
          />
        </KpiCell>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel tag="Git" trailing={remoteHost(repo.remoteUrl) ?? "No remote"}>
          <p
            className="mb-2 border-l-2 border-highlight bg-highlight/5 px-2 py-1 text-[12px] leading-relaxed text-foreground"
            data-selectable
          >
            {repo.lastCommitMessage ?? repo.error ?? "No commit"}
          </p>
          <StatRow label="Branch" value={repo.branch ?? "—"} />
          <StatRow
            label="Upstream"
            value={repo.upstreamBranch ?? "—"}
            tone={repo.upstreamBranch ? undefined : "muted"}
          />
          <StatRow label="Sync" value={sync ?? "—"} tone={outOfSync ? "warning" : undefined} />
          <StatRow
            label="Working tree"
            value={repo.isDirty ? "Uncommitted changes" : "Clean"}
            tone={repo.isDirty ? "warning" : undefined}
          />
          <StatRow label="Author" value={repo.lastCommitAuthor ?? "—"} />
          <StatRow label="Committed" value={formatRelativeFromIso(repo.lastCommitIso)} />
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground" data-selectable>
              {repo.lastCommitShortHash ?? ""}
            </span>
            <Button type="button" variant="outline" size="xs" disabled={gitFetching} onClick={runGitFetch}>
              {gitFetching ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              Git fetch
            </Button>
          </div>
          {status?.source === "git" ? <StatusLine tone={status.tone}>{status.text}</StatusLine> : null}
        </Panel>

        <Panel tag="Image optimization" trailing="Last 30 days" className="lg:col-span-2">
          {!hasSavings || !compression ? (
            <EmptyHint>
              Nothing tracked yet.
              <br />
              Tinify, SVGO and conversions of files in this project show up here.
            </EmptyHint>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="w-[6.5rem] shrink-0 uppercase tracking-[0.08em] text-foreground">Total</span>
                <SegmentBar
                  value={compression.bytesIn > 0 ? compressionSaved / compression.bytesIn : 0}
                  segments={48}
                  label="Weight reduced in this project"
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
              {conversionGroups.length > 0 ? (
                <>
                  <div className="mt-2 border-b border-border/60 pb-1.5">
                    <SubLabel>Format conversion · not in total</SubLabel>
                  </div>
                  <div className="pt-1">
                    <SavingsRows groups={conversionGroups} conversion />
                  </div>
                </>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      <DevServerSection repo={repo} />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel tag="Disk" trailing={library?.label ?? null}>
          <StatRow
            label="Project"
            value={tree != null ? bytes(tree) : "Too large"}
            tone={tree == null ? "muted" : undefined}
          />
          <StatRow label="node_modules" value={nodeModules ? bytes(nodeModules) : "—"} />
          <StatRow
            label="Share"
            value={tree && nodeModules ? `${Math.round(nodeModulesShare * 100)}%` : "—"}
          />
          <SegmentBar
            value={nodeModulesShare}
            segments={24}
            label="node_modules share of the project"
            className="mt-2"
          />
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <Link
              to="/tools/cleanup"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
            >
              All projects
              <ArrowRight className="size-3" />
            </Link>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={deletingNodeModules}
              onClick={() => setDeleteDialogOpen(true)}
              className="hover:border-destructive/50 hover:text-destructive"
            >
              {deletingNodeModules ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              Delete node_modules
            </Button>
          </div>
          {status?.source === "disk" ? <StatusLine tone={status.tone}>{status.text}</StatusLine> : null}
        </Panel>

        <Panel tag="Live site" trailing={liveUrl ? hostOf(liveUrl) : null}>
          {!liveUrl ? (
            <>
              <EmptyHint>
                No live URL yet.
                <br />
                Add it to see SSL and SEO here.
              </EmptyHint>
              <div className="mt-auto flex justify-center">
                <Button type="button" variant="outline" size="xs" onClick={() => openMetadataDialog(repo.path)}>
                  <Pencil className="size-3" />
                  Add live URL
                </Button>
              </div>
            </>
          ) : (
            <>
              <StatRow
                label="URL"
                value={
                  <button
                    type="button"
                    onClick={() => window.open(liveUrl, "_blank")}
                    className="inline-flex items-center gap-1 hover:text-highlight"
                  >
                    {hostOf(liveUrl)}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </button>
                }
              />
              <StatRow label="SSL issuer" value={sslPending ? "…" : (siteSsl?.issuer ?? "—")} />
              <StatRow
                label="SSL expires"
                value={
                  sslPending
                    ? "…"
                    : siteSsl?.validTo
                      ? `${shortDate(new Date(siteSsl.validTo))} ${new Date(siteSsl.validTo).getFullYear()}`
                      : (siteSsl?.error ?? "—")
                }
                tone={
                  siteSsl && !siteSsl.ok
                    ? "destructive"
                    : siteSsl?.daysLeft != null && siteSsl.daysLeft <= SSL_WARN_DAYS
                      ? "warning"
                      : undefined
                }
              />
              <StatRow
                label="SEO score"
                value={seo ? `${seo.score} / 100` : "Not audited"}
                tone={seo ? undefined : "muted"}
              />
              <SegmentBar value={seo ? seo.score / 100 : 0} segments={24} label="SEO score" className="my-1" />
              <StatRow
                label="Checks"
                value={seo ? `${seo.pass} pass · ${seo.warn} warn · ${seo.fail} fail` : "—"}
                tone={seo && seo.fail > 0 ? "warning" : seo ? undefined : "muted"}
              />
              <StatRow
                label="Last audit"
                value={seo ? formatRelativeFromIso(seo.at) : "—"}
                tone={seo ? undefined : "muted"}
              />
              <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-border/60 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={sslLoading}
                  onClick={() => setSslReloadKey((key) => key + 1)}
                >
                  {sslLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  SSL
                </Button>
                <Button type="button" variant="outline" size="xs" disabled={seoRunning} onClick={runSeoAudit}>
                  {seoRunning ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  SEO audit
                </Button>
              </div>
              {status?.source === "site" ? <StatusLine tone={status.tone}>{status.text}</StatusLine> : null}
            </>
          )}
        </Panel>

        <Panel
          tag="Branches"
          trailing={branches ? `${branches.local.length + branches.remote.length} total` : null}
        >
          {branchesError ? (
            <p className="text-[11px] text-destructive">{branchesError}</p>
          ) : !branches ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading branches…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <BranchColumn title="Local" items={branches.local} />
              <BranchColumn title="Remote" items={branches.remote} />
            </div>
          )}
        </Panel>
      </div>

      <Panel tag="Recent runs" trailing="This project" bodyClassName="p-0">
        {stats && stats.recent.length > 0 ? (
          <RecentRunsTable runs={stats.recent} now={now} showProject={false} />
        ) : (
          <EmptyHint>Optimizations and cleanups in this project show up here.</EmptyHint>
        )}
      </Panel>

      <ReadmeSection repoPath={repo.path} />

      <DeleteNodeModulesDialog
        open={deleteDialogOpen}
        repoName={repo.name}
        busy={deletingNodeModules}
        onDismiss={() => {
          if (!deletingNodeModules) setDeleteDialogOpen(false)
        }}
        onConfirm={confirmDeleteNodeModules}
      />
    </section>
  )
}
