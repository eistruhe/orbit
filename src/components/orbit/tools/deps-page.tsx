import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { useMemo, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import {
  type DepDiffLevel,
  type DepInfo,
  type ProjectAudit,
  auditDeps,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const DIFF_ORDER: Record<DepDiffLevel, number> = {
  major: 0,
  minor: 1,
  patch: 2,
  unknown: 3,
  none: 4,
}

const DIFF_CLASS: Record<DepDiffLevel, string> = {
  major: "border-destructive/40 bg-destructive/10 text-destructive",
  minor: "border-highlight/40 bg-highlight/10 text-highlight",
  patch: "border-border text-muted-foreground",
  unknown: "border-border text-muted-foreground/60",
  none: "border-success/40 bg-success/10 text-success",
}

function sortPackages(packages: DepInfo[]): DepInfo[] {
  return [...packages].sort(
    (a, b) =>
      DIFF_ORDER[a.diff] - DIFF_ORDER[b.diff] || a.name.localeCompare(b.name),
  )
}

function PackageTable({
  packages,
  query,
  majorOnly,
  prodOnly,
}: {
  packages: DepInfo[]
  query: string
  majorOnly: boolean
  prodOnly: boolean
}) {
  const needle = query.trim().toLowerCase()
  const rows = sortPackages(packages).filter((entry) => {
    if (majorOnly && entry.diff !== "major") return false
    if (prodOnly && entry.dev) return false
    if (needle && !entry.name.toLowerCase().includes(needle)) return false
    return true
  })
  if (rows.length === 0) {
    return (
      <p className="border border-border px-4 py-6 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        No packages match.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto border border-border">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_5.5rem_3.5rem_2rem] border-b border-border bg-card text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="px-2 py-1.5">Package</span>
          <span className="px-2 py-1.5">Range</span>
          <span className="px-2 py-1.5">Latest</span>
          <span className="px-2 py-1.5">Diff</span>
          <span className="px-2 py-1.5">Type</span>
          <span />
        </div>
        {rows.map((entry, index) => (
          <div
            key={`${entry.name}-${entry.dev}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_7rem_7rem_5.5rem_3.5rem_2rem] items-center border-b border-border/40 font-mono text-[11px]",
              index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
            )}
          >
            <span
              className="truncate px-2 py-1 text-foreground"
              title={entry.name}
            >
              {entry.name}
            </span>
            <span className="truncate px-2 py-1 tabular-nums text-muted-foreground">
              {entry.range}
            </span>
            <span className="truncate px-2 py-1 tabular-nums text-foreground">
              {entry.latest ?? "—"}
            </span>
            <span className="px-2 py-1">
              <span
                className={cn(
                  "border px-1 py-px text-[9px] uppercase tracking-[0.06em]",
                  DIFF_CLASS[entry.diff],
                )}
              >
                {entry.diff}
              </span>
            </span>
            <span className="px-2 py-1 text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
              {entry.dev ? "dev" : "prod"}
            </span>
            <a
              href={`https://www.npmjs.com/package/${entry.name}`}
              target="_blank"
              rel="noreferrer"
              className="flex justify-center text-muted-foreground hover:text-foreground"
              aria-label={`Open ${entry.name} on npm`}
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Dependency audit: compares package.json ranges against the npm registry's
 * latest versions — for one project or every scanned project at once.
 */
export function DepsPage() {
  const { allRepos } = useOrbit()
  const [scope, setScope] = useState<"project" | "all">("project")
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ProjectAudit[] | null>(null)
  const [query, setQuery] = useState("")
  const [majorOnly, setMajorOnly] = useState(false)
  const [prodOnly, setProdOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const repos = useMemo(
    () => [...allRepos].sort((a, b) => a.name.localeCompare(b.name)),
    [allRepos],
  )

  const run = () => {
    const paths =
      scope === "all"
        ? repos.map((repo) => repo.path)
        : projectPath
          ? [projectPath]
          : []
    if (loading || paths.length === 0) return
    setLoading(true)
    setError(null)
    void auditDeps(paths)
      .then((next) => {
        setResults(next)
        setExpanded(new Set(next.length === 1 ? [next[0].path] : []))
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Audit failed")
        setResults(null)
      })
      .finally(() => setLoading(false))
  }

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const audited = results?.filter((project) => !project.error) ?? []
  const totals = audited.reduce(
    (sum, project) => ({
      outdated: sum.outdated + project.counts.outdated,
      major: sum.major + project.counts.major,
    }),
    { outdated: 0, major: 0 },
  )

  return (
    <div className="space-y-4">
      <ToolSection
        title="Dependency audit"
        description="Compare package.json ranges against the npm registry — per project or across every scanned project."
        trailing={
          loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Scope
            </span>
            <SegmentedControl
              options={[
                { value: "project", label: "One project" },
                { value: "all", label: `All (${repos.length})` },
              ]}
              value={scope}
              onValueChange={setScope}
            />
          </div>

          {scope === "project" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Project
              </span>
              <Select
                value={projectPath ?? ""}
                onValueChange={(value) => {
                  if (typeof value === "string" && value) setProjectPath(value)
                }}
              >
                <SelectTrigger className="min-w-64 font-mono">
                  <SelectValue placeholder="Choose a project…" />
                </SelectTrigger>
                <SelectContent>
                  {repos.map((repo) => (
                    <SelectItem key={repo.path} value={repo.path}>
                      {repo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <Button
            type="button"
            variant="highlight"
            disabled={loading || (scope === "project" && !projectPath)}
            onClick={run}
          >
            Audit
          </Button>
        </div>

        {scope === "all" ? (
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            First run fetches every unique package from the registry — this can
            take a while; results are cached for an hour.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-[11px] text-destructive">{error}</p>
        ) : null}
      </ToolSection>

      {results ? (
        <ToolSection
          title="Results"
          trailing={
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {totals.outdated} outdated ·{" "}
              <span className="text-destructive">{totals.major} major</span>
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter packages…"
              className="h-8 max-w-64 font-mono"
            />
            <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
              <Checkbox
                checked={majorOnly}
                onCheckedChange={(checked) => setMajorOnly(checked === true)}
                aria-label="Only major updates"
              />
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Major only
              </span>
            </label>
            <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
              <Checkbox
                checked={prodOnly}
                onCheckedChange={(checked) => setProdOnly(checked === true)}
                aria-label="Only production dependencies"
              />
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Prod only
              </span>
            </label>
          </div>

          <div className="space-y-2">
            {results.map((project) => {
              const isOpen = expanded.has(project.path)
              return (
                <div key={project.path} className="border border-border">
                  <button
                    type="button"
                    onClick={() => toggle(project.path)}
                    className="flex w-full items-center gap-2 bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                      {project.name}
                    </span>
                    {project.error ? (
                      <span className="text-[10px] text-muted-foreground">
                        {project.error}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {project.counts.outdated}/{project.counts.total}{" "}
                        outdated
                        {project.counts.major > 0 ? (
                          <span className="text-destructive">
                            {" "}
                            · {project.counts.major} major
                          </span>
                        ) : null}
                      </span>
                    )}
                  </button>
                  {isOpen && !project.error ? (
                    <div className="border-t border-border p-2">
                      <PackageTable
                        packages={project.packages}
                        query={query}
                        majorOnly={majorOnly}
                        prodOnly={prodOnly}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </ToolSection>
      ) : null}
    </div>
  )
}
