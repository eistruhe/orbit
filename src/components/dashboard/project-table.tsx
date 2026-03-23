import { Pin } from "lucide-react"

import { StatusBadge } from "@/components/dashboard/status-badge"
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
import { formatRelativeFromIso } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

type ProjectTableProps = {
  repos: RepoRecord[]
  pinnedPaths: Set<string>
  onTogglePin: (path: string) => void
  onOpen: (path: string) => void
}

/**
 * Full project listing with status and last activity.
 */
export function ProjectTable({
  repos,
  pinnedPaths,
  onTogglePin,
  onOpen,
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
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{repo.name}</span>
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
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge repo={repo} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatRelativeFromIso(repo.lastCommitIso)}
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
}
