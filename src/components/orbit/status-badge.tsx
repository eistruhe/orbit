import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

type StatusBadgeProps = {
  repo: RepoRecord
  className?: string
}

/**
 * Renders a compact status label for a repository row or card.
 */
export function StatusBadge({ repo, className }: StatusBadgeProps) {
  if (repo.error) {
    return (
      <Badge variant="destructive" className={cn("gap-1.5", className)}>
        <span className="size-1.5 bg-current" aria-hidden />
        Error
      </Badge>
    )
  }
  if (repo.isDirty) {
    return (
      <Badge variant="outline" className={cn("gap-1.5 border-highlight/50 text-foreground", className)}>
        <span className="size-1.5 bg-highlight" aria-hidden />
        Dirty
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={cn("gap-1.5", className)}>
      <span className="size-1.5 bg-foreground/40" aria-hidden />
      Clean
    </Badge>
  )
}
