import {
  Clock,
  GitBranch,
  GitCommit,
  HardDrive,
  Hash,
  Loader2,
  Pencil,
  Pin,
  RefreshCw,
  Tag,
  User,
} from "lucide-react"
import { Link, useParams } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { StatusBadge } from "@/components/orbit/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import type { RepoBranchesResponse } from "@/lib/api"
import { fetchRepoBranches } from "@/lib/api"
import { diskLabel, syncLabel } from "@/lib/repo-facts"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"

function decodeProjectPath(value: string | undefined): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

type SectionProps = {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
}

function Section({ title, icon: Icon, trailing, children, className }: SectionProps) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-3.5 text-muted-foreground" aria-hidden /> : null}
          <h2 className="text-[10px] uppercase tracking-[0.16em] text-foreground">
            [{title}]
          </h2>
        </div>
        {trailing}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

type DataRowProps = {
  label: string
  children: React.ReactNode
  mono?: boolean
}

function DataRow({ label, children, mono }: DataRowProps) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 wrap-break-word text-[11px] text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </span>
    </div>
  )
}

export function ProjectDetailPage() {
  const {
    repoByPath,
    projectLibraries,
    pinnedPathsSet,
    repoNotes,
    repoTags,
    togglePin,
    openExternal,
    openRemote,
    openMetadataDialog,
  } = useOrbit()
  const { encodedPath } = useParams({ from: "/projects-layout/project/$encodedPath" })
  const decodedPath = useMemo(
    () => decodeProjectPath(encodedPath),
    [encodedPath],
  )
  const repo = decodedPath ? repoByPath.get(decodedPath) ?? null : null

  const [branches, setBranches] = useState<RepoBranchesResponse | null>(null)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchesError, setBranchesError] = useState<string | null>(null)

  useEffect(() => {
    if (!repo) return
    let cancelled = false
    const loadBranches = async () => {
      setBranchesLoading(true)
      setBranchesError(null)
      setBranches(null)
      try {
        const result = await fetchRepoBranches(repo.path)
        if (cancelled) return
        setBranches(result)
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "Could not load branches"
        setBranchesError(message)
      } finally {
        if (!cancelled) {
          setBranchesLoading(false)
        }
      }
    }
    void loadBranches()
    return () => {
      cancelled = true
    }
  }, [repo])

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

  const pathParts = repo.path.split("/").filter(Boolean)
  const tags = repoTags[repo.path] ?? []
  const note = repoNotes[repo.path]
  const sync = syncLabel(repo)
  const disk = diskLabel(repo)
  const hasMetadata = tags.length > 0 || !!note
  const library =
    projectLibraries.find((entry) => entry.id === repo.orbitLibraryId) ?? null
  const isPrimaryLibrary = repo.orbitLibraryId === "primary"

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {isPrimaryLibrary ? (
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
        <span className="text-border-strong">/</span>
        {pathParts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={cn(
              index === pathParts.length - 1 && "text-foreground",
            )}
          >
            {part}
            {index < pathParts.length - 1 ? (
              <span className="ml-1.5 text-border-strong">/</span>
            ) : null}
          </span>
        ))}
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 bg-highlight shadow-[0_0_8px_var(--highlight)]" aria-hidden />
              <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Repository
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-medium uppercase tracking-[0.04em]">
                {repo.name}
              </h1>
              <StatusBadge repo={repo} />
            </div>
            <p className="text-[11px] text-muted-foreground">{repo.path}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void togglePin(repo.path)}
            >
              <Pin
                className={cn(
                  "size-3.5",
                  pinnedPathsSet.has(repo.path)
                    ? "text-highlight"
                    : "text-muted-foreground",
                )}
              />
              {pinnedPathsSet.has(repo.path) ? "Pinned" : "Pin"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openMetadataDialog(repo.path)}
            >
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

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Latest Commit" icon={GitCommit}>
          <p className="mb-3 border-l-2 border-highlight bg-highlight/5 px-2 py-1 text-[12px] leading-relaxed text-foreground">
            {repo.lastCommitMessage ?? repo.error ?? "No commit"}
          </p>
          <div>
            {repo.branch ? (
              <DataRow label="Branch">
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3 text-muted-foreground" aria-hidden />
                  {repo.branch}
                </span>
              </DataRow>
            ) : null}
            {repo.lastCommitShortHash ? (
              <DataRow label="Hash" mono>
                <span className="inline-flex items-center gap-1">
                  <Hash className="size-3 text-muted-foreground" aria-hidden />
                  {repo.lastCommitShortHash}
                </span>
              </DataRow>
            ) : null}
            {repo.lastCommitAuthor ? (
              <DataRow label="Author">
                <span className="inline-flex items-center gap-1">
                  <User className="size-3 text-muted-foreground" aria-hidden />
                  {repo.lastCommitAuthor}
                </span>
              </DataRow>
            ) : null}
            {repo.lastCommitIso ? (
              <DataRow label="When" mono>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3 text-muted-foreground" aria-hidden />
                  {formatRelativeFromIso(repo.lastCommitIso)}
                </span>
              </DataRow>
            ) : null}
          </div>
        </Section>

        <Section title="Repository" icon={HardDrive}>
          <div>
            {sync ? (
              <DataRow label="Sync">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="size-3 text-muted-foreground" aria-hidden />
                  {sync}
                </span>
              </DataRow>
            ) : null}
            {disk ? (
              <DataRow label="Disk" mono>
                {disk}
              </DataRow>
            ) : null}
            {repo.stack.length > 0 ? (
              <DataRow label="Tech Stack">
                <div className="flex flex-wrap gap-1">
                  {repo.stack.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex h-5 items-center border border-border bg-surface-2 px-1.5 text-[10px] uppercase tracking-[0.06em] text-foreground/80"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </DataRow>
            ) : null}
            {!sync && !disk && repo.stack.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No repository details available
              </p>
            ) : null}
          </div>
        </Section>
      </div>

      {hasMetadata ? (
        <Section title="Metadata" icon={Tag}>
          {tags.length > 0 ? (
            <DataRow label="Tags">
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex h-5 items-center border border-highlight/40 bg-highlight/10 px-1.5 text-[10px] uppercase tracking-[0.06em] text-highlight"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </DataRow>
          ) : null}
          {note ? (
            <DataRow label="Notes">
              <span className="italic text-muted-foreground">{note}</span>
            </DataRow>
          ) : null}
        </Section>
      ) : null}

      <Section title="Branches" icon={GitBranch}>
        {branchesLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading branches…
          </div>
        ) : null}
        {branchesError ? (
          <p className="text-[11px] text-destructive">{branchesError}</p>
        ) : null}
        {!branchesLoading && !branchesError && branches ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BranchList
              title="Local"
              count={branches.local.length}
              items={branches.local}
            />
            <BranchList
              title="Remote"
              count={branches.remote.length}
              items={branches.remote}
            />
          </div>
        ) : null}
      </Section>
    </section>
  )
}

function BranchList({
  title,
  count,
  items,
}: {
  title: string
  count: number
  items: string[]
}) {
  return (
    <div className="border border-border bg-surface-2/40">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        <span className="text-[10px] tabular-nums text-foreground/80">
          {count}
        </span>
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((name) => (
            <li
              key={`${title}-${name}`}
              className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1 text-[11px] last:border-b-0"
            >
              <GitBranch className="size-3 text-muted-foreground" aria-hidden />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          No branches
        </p>
      )}
    </div>
  )
}
