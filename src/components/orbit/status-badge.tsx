import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

type StatusBadgeProps = {
  repo: RepoRecord
  className?: string
}

const baseClass =
  "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 border border-border bg-transparent px-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"

/**
 * Colored status dot + uppercase label, mono terminal style.
 */
export function StatusBadge({ repo, className }: StatusBadgeProps) {
  if (repo.error) {
    return (
      <span
        className={cn(
          baseClass,
          "border-destructive/40 text-destructive",
          className,
        )}
      >
        <span
          className="size-1.5 rounded-none bg-destructive shadow-[0_0_6px_var(--destructive)]"
          aria-hidden
        />
        Error
      </span>
    )
  }
  if (repo.isDirty) {
    return (
      <span
        className={cn(
          baseClass,
          "border-highlight/40 text-highlight",
          className,
        )}
      >
        <span
          className="size-1.5 rounded-none bg-highlight shadow-[0_0_6px_var(--highlight)]"
          aria-hidden
        />
        Dirty
      </span>
    )
  }
  return (
    <span
      className={cn(
        baseClass,
        "border-success/40 text-success",
        className,
      )}
    >
      <span
        className="size-1.5 rounded-none bg-success shadow-[0_0_6px_var(--success)]"
        aria-hidden
      />
      Clean
    </span>
  )
}
