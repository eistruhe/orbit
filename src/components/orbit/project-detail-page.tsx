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
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-2 break-all">{children}</span>
      </div>
    </div>
  )
}

export function ProjectDetailPage() {
  const {
    repoByPath,
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
        <p className="text-sm text-muted-foreground">
          Project not in current scan.
        </p>
        <Link to="/" className={buttonVariants()}>
          Back to Projects
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

  return (
    <section className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          to="/"
          className={buttonVariants({
            variant: "link",
            className: "h-auto px-0 text-xs",
          })}
        >
          Projects
        </Link>
        <span>/</span>
        {pathParts.map((part, index) => (
          <span key={`${part}-${index}`}>
            {part}
            {index < pathParts.length - 1 ? " / " : ""}
          </span>
        ))}
      </div>

      {/* Hero header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
            <StatusBadge repo={repo} />
          </div>
          <p className="text-xs text-muted-foreground">{repo.path}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
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
            variant="ghost"
            size="sm"
            className="h-7 px-2"
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

      <Separator />

      {/* Info grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Latest Commit */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <GitCommit className="size-4 text-muted-foreground" />
              Latest Commit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">
              {repo.lastCommitMessage ?? repo.error ?? "No commit"}
            </p>
            <Separator />
            <div className="space-y-2">
              {repo.branch ? (
                <DetailRow icon={GitBranch} label="Branch">{repo.branch}</DetailRow>
              ) : null}
              {repo.lastCommitShortHash ? (
                <DetailRow icon={Hash} label="Hash">
                  <code className="text-xs">{repo.lastCommitShortHash}</code>
                </DetailRow>
              ) : null}
              {repo.lastCommitAuthor ? (
                <DetailRow icon={User} label="Author">{repo.lastCommitAuthor}</DetailRow>
              ) : null}
              {repo.lastCommitIso ? (
                <DetailRow icon={Clock} label="When">
                  {formatRelativeFromIso(repo.lastCommitIso)}
                </DetailRow>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Repository Details */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <HardDrive className="size-4 text-muted-foreground" />
              Repository
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sync ? (
              <DetailRow icon={RefreshCw} label="Sync">{sync}</DetailRow>
            ) : null}
            {disk ? (
              <DetailRow icon={HardDrive} label="Disk">{disk}</DetailRow>
            ) : null}
            {repo.stack.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Tech Stack</span>
                  <div className="flex flex-wrap gap-1.5">
                    {repo.stack.map((tech) => (
                      <Badge key={tech} variant="secondary">{tech}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {!sync && !disk && repo.stack.length === 0 ? (
              <p className="text-xs text-muted-foreground">No repository details available</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Metadata (tags & notes) */}
      {hasMetadata ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Tag className="size-4 text-muted-foreground" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tags.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline">#{tag}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {tags.length > 0 && note ? <Separator /> : null}
            {note ? (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Notes</span>
                <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Branches */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitBranch className="size-4 text-muted-foreground" />
            Branches
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {branchesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading branches…
            </div>
          ) : null}
          {branchesError ? (
            <p className="text-destructive">{branchesError}</p>
          ) : null}
          {!branchesLoading && !branchesError && branches ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Local
                </h3>
                {branches.local.length > 0 ? (
                  <ul className="space-y-1">
                    {branches.local.map((name) => (
                      <li key={`local-${name}`} className="flex items-center gap-2 text-xs">
                        <GitBranch className="size-3 text-muted-foreground" />
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No local branches</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Remote
                </h3>
                {branches.remote.length > 0 ? (
                  <ul className="space-y-1">
                    {branches.remote.map((name) => (
                      <li key={`remote-${name}`} className="flex items-center gap-2 text-xs">
                        <GitBranch className="size-3 text-muted-foreground" />
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No remote branches</p>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
