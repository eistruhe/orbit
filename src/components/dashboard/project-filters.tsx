import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
}

/**
 * Search field and compact filter tabs for the project table.
 */
export function ProjectFilters({
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
}: ProjectFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search projects..."
          className="h-10 border-border bg-background pl-9 text-sm uppercase"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <FilterTabs
          label="Ownership"
          value={ownership}
          onValueChange={(v) => onOwnershipChange(v as OwnershipFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "remote", label: "With remote" },
            { value: "local", label: "Local only" },
          ]}
        />
        <FilterTabs
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
        <FilterTabs
          label="Tech stack"
          value={stack}
          onValueChange={onStackChange}
          options={[
            { value: "all", label: "All" },
            ...stackOptions.map((s) => ({ value: s, label: s })),
          ]}
        />
        <FilterTabs
          label="Project type"
          value={projectType}
          onValueChange={(v) => onProjectTypeChange(v as ProjectTypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "web", label: "Web app" },
          ]}
        />
      </div>
    </div>
  )
}

function FilterTabs({
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
    <div className="space-y-1.5">
      <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <Tabs value={value} onValueChange={onValueChange}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted p-1">
          {options.map((o) => (
            <TabsTrigger
              key={o.value}
              value={o.value}
              className="px-2 py-1 text-[11px] data-[state=active]:border data-[state=active]:border-foreground/20"
            >
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
