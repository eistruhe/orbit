import { Pencil, Pin } from "lucide-react"
import { memo } from "react"

import { OpenTargetButtons } from "@/components/orbit/open-target-buttons"
import { StatusBadge } from "@/components/orbit/status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { diskLabel, syncLabel } from "@/lib/repo-facts"
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"
import type { RepoRecord } from "@/types/repo"

type ProjectTableProps = {
  repos: RepoRecord[]
  pinnedPaths: Set<string>
  onTogglePin: (path: string) => void
  onOpen: (path: string) => void
  onOpenExternal: (path: string, target: OpenTarget) => void
  onOpenRemote: (remoteUrl: string | null) => void
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
  onEditMetadata: (path: string) => void
}

/**
 * Full project listing with status and last activity.
 */
export const ProjectTable = memo(function ProjectTable({
  repos,
  pinnedPaths,
  onTogglePin,
  onOpen,
  onOpenExternal,
  onOpenRemote,
  repoNotes,
  repoTags,
  onEditMetadata,
}: ProjectTableProps) {
  return (
    <div className="overflow-hidden border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10" />
            <TableHead className="text-[11px] uppercase tracking-wider">
              Project
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Last activity
            </TableHead>
            <TableHead className="w-28 text-[11px] uppercase tracking-wider">
              Open
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repos.map((repo) => (
            <TableRow
              key={repo.path}
              className="cursor-pointer"
              onClick={() => onOpen(repo.path)}
            >
              <TableCell className="w-10">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePin(repo.path)
                    }}
                    aria-label={
                      pinnedPaths.has(repo.path) ? "Unpin project" : "Pin project"
                    }
                  >
                    <Pin
                      className={cn(
                        "size-4",
                        pinnedPaths.has(repo.path)
                          ? "text-highlight"
                          : "text-muted-foreground",
                      )}
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditMetadata(repo.path)
                    }}
                    aria-label="Edit metadata"
                  >
                    <Pencil className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{repo.name}</span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground">
                    {repo.branch ? <span>{repo.branch}</span> : null}
                    {repo.lastCommitShortHash ? (
                      <span>{repo.lastCommitShortHash}</span>
                    ) : null}
                    {repo.lastCommitAuthor ? (
                      <span className="truncate">by {repo.lastCommitAuthor}</span>
                    ) : null}
                  </div>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="line-clamp-1 cursor-default text-[11px] text-muted-foreground text-left">
                        {repo.path}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-md text-xs"
                    >
                      {repo.path}
                    </TooltipContent>
                  </Tooltip>
                  {repoTags[repo.path]?.length ? (
                    <span className="line-clamp-1 text-[10px] text-muted-foreground">
                      #{repoTags[repo.path].join(" #")}
                    </span>
                  ) : null}
                  {repoNotes[repo.path] ? (
                    <span className="line-clamp-1 text-[10px] italic text-muted-foreground">
                      {repoNotes[repo.path]}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge repo={repo} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <div className="flex flex-col gap-0.5">
                  <span>{formatRelativeFromIso(repo.lastCommitIso)}</span>
                  {syncLabel(repo) ? <span>{syncLabel(repo)}</span> : null}
                  {diskLabel(repo) ? <span>{diskLabel(repo)}</span> : null}
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <OpenTargetButtons
                  path={repo.path}
                  onOpenExternal={onOpenExternal}
                  remoteUrl={repo.remoteUrl}
                  onOpenRemote={() => onOpenRemote(repo.remoteUrl)}
                  size="compact"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {repos.length === 0 ? (
        <p className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No projects match the current filters.
        </p>
      ) : null}
    </div>
  )
})
