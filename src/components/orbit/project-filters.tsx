import { Search, X } from "lucide-react"
import { memo } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type OwnershipFilter = "all" | "remote" | "local"
export type StatusFilter = "all" | "clean" | "dirty" | "error"
export type ProjectTypeFilter = "all" | "web"

type ProjectFiltersProps = {
  query: string
  onQueryChange: (q: string) => void
  ownership: OwnershipFilter
  onOwnershipChange: (v: OwnershipFilter) => void
  status: StatusFilter
  onStatusChange: (v: StatusFilter) => void
  stack: string
  stackOptions: string[]
  onStackChange: (v: string) => void
  projectType: ProjectTypeFilter
  onProjectTypeChange: (v: ProjectTypeFilter) => void
  tag: string
  tagOptions: string[]
  onTagChange: (v: string) => void
}

/**
 * Search field and inline mono filter chips for the project table.
 */
export const ProjectFilters = memo(function ProjectFilters({
  query,
  onQueryChange,
  ownership,
  onOwnershipChange,
  status,
  onStatusChange,
  stack,
  stackOptions,
  onStackChange,
  projectType,
  onProjectTypeChange,
  tag,
  tagOptions,
  onTagChange,
}: ProjectFiltersProps) {
  const hasAnyFilter =
    ownership !== "all" ||
    status !== "all" ||
    stack !== "all" ||
    projectType !== "all" ||
    tag !== "all" ||
    query.trim().length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-stretch border border-border bg-card">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-r border-border px-3">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Search
          </span>
        </div>
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter by name, path, branch, tag…"
          className="h-9 border-0 bg-transparent px-3 placeholder:normal-case placeholder:tracking-normal"
        />
        {hasAnyFilter ? (
          <button
            type="button"
            onClick={() => {
              onQueryChange("")
              onOwnershipChange("all")
              onStatusChange("all")
              onStackChange("all")
              onProjectTypeChange("all")
              onTagChange("all")
            }}
            className="flex h-9 shrink-0 items-center gap-1 border-l border-border px-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
            Reset
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterChips
          label="Ownership"
          value={ownership}
          onValueChange={(v) => onOwnershipChange(v as OwnershipFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "remote", label: "Remote" },
            { value: "local", label: "Local" },
          ]}
        />
        <FilterChips
          label="Status"
          value={status}
          onValueChange={(v) => onStatusChange(v as StatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "clean", label: "Clean" },
            { value: "dirty", label: "Dirty" },
            { value: "error", label: "Error" },
          ]}
        />
        <FilterChips
          label="Stack"
          value={stack}
          onValueChange={onStackChange}
          options={[
            { value: "all", label: "All" },
            ...stackOptions.map((s) => ({ value: s, label: s })),
          ]}
        />
        <FilterChips
          label="Type"
          value={projectType}
          onValueChange={(v) => onProjectTypeChange(v as ProjectTypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "web", label: "Web" },
          ]}
        />
        <FilterChips
          label="Tags"
          value={tag}
          onValueChange={onTagChange}
          options={[
            { value: "all", label: "All" },
            ...tagOptions.map((t) => ({ value: t, label: t })),
          ]}
        />
      </div>
    </div>
  )
})

function FilterChips({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        [{label}]
      </span>
      <div className="flex items-stretch border border-border">
        {options.map((o, i) => {
          const isActive = value === o.value
          return (
            <button
              type="button"
              key={o.value}
              onClick={() => onValueChange(o.value)}
              className={cn(
                "h-6 px-2 text-[10px] uppercase tracking-[0.06em] transition-colors",
                i > 0 && "border-l border-border",
                isActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
