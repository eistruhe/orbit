import { DotColumns, Leader, SubLabel, ToolBadge } from "@/components/orbit/stats-primitives"
import type { StatsRecentRun, StatsSavingsGroup } from "@/lib/api"
import {
  TOOL_LABELS,
  baseName,
  bytes,
  count,
  formatLabel,
  reduction,
  runTime,
} from "@/lib/stats-format"
import { cn } from "@/lib/utils"

export const TABLE_HEAD =
  "border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground [&>div]:px-2 [&>div]:py-2"
export const TABLE_ROW =
  "items-center border-b border-border/60 text-[11px] last:border-b-0 [&>div]:px-2 [&>div]:py-1.5"

const SAVINGS_GRID =
  "grid grid-cols-[6.5rem_minmax(0,1fr)_auto_3.5rem_3rem_4.25rem] items-center gap-x-3"

/** Column labels above `SavingsRows`; `label` names the block. */
export function SavingsHeader({ label }: { label: string }) {
  return (
    <div className={cn(SAVINGS_GRID, "border-b border-border/60 pb-1.5")}>
      <SubLabel>{label}</SubLabel>
      <span />
      <span />
      <span className="text-right">
        <SubLabel>Files</SubLabel>
      </span>
      <span className="text-right">
        <SubLabel>Δ</SubLabel>
      </span>
      <span className="text-right">
        <SubLabel>Saved</SubLabel>
      </span>
    </div>
  )
}

/** One row per format (and tool) with a daily savings sparkline. */
export function SavingsRows({
  groups,
  conversion = false,
}: {
  groups: StatsSavingsGroup[]
  conversion?: boolean
}) {
  return groups.map((group) => (
    <div
      key={`${group.tool}|${group.formatIn}|${group.formatOut}`}
      className={cn(SAVINGS_GRID, "py-[5px] text-[11px]")}
    >
      <span className="flex items-baseline gap-2 truncate">
        {conversion ? (
          <span className="text-foreground">
            {formatLabel(group.formatIn)} → {formatLabel(group.formatOut)}
          </span>
        ) : (
          <>
            <span className="text-foreground">{formatLabel(group.formatIn)}</span>
            <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {TOOL_LABELS[group.tool]}
            </span>
          </>
        )}
      </span>
      <Leader />
      <DotColumns values={group.dailySaved} />
      <span className="text-right tabular-nums text-muted-foreground">{count(group.files)}</span>
      <span className="text-right tabular-nums text-muted-foreground">
        {reduction(group.bytesIn, group.bytesOut)}
      </span>
      <span className="text-right tabular-nums text-foreground">
        {bytes(group.bytesIn - group.bytesOut)}
      </span>
    </div>
  ))
}

const RUNS_GRID = "grid grid-cols-[3.75rem_4.25rem_minmax(0,1fr)_8.5rem_3.25rem]"

function RecentRunRow({
  run,
  now,
  showProject,
}: {
  run: StatsRecentRun
  now: Date
  showProject: boolean
}) {
  const project = showProject && run.project ? baseName(run.project) : null
  const file =
    run.type === "cleanup"
      ? "node_modules"
      : run.tool === "convert"
        ? `${run.name} → .${run.formatOut}`
        : run.name
  return (
    <div className={cn(RUNS_GRID, TABLE_ROW)}>
      <div className="tabular-nums text-muted-foreground">{runTime(run.at, now)}</div>
      <div>
        <ToolBadge tool={TOOL_LABELS[run.type === "cleanup" ? "cleanup" : run.tool]} />
      </div>
      <div className="truncate" title={run.project ? `${run.project} · ${file}` : file}>
        <span className="text-foreground">{file}</span>
        {project ? <span className="ml-2 text-[10px] text-muted-foreground">{project}</span> : null}
      </div>
      <div className="text-right tabular-nums text-muted-foreground">
        {run.type === "cleanup"
          ? run.bytesFreed == null
            ? "freed"
            : `${bytes(run.bytesFreed)} freed`
          : `${bytes(run.bytesIn)} → ${bytes(run.bytesOut)}`}
      </div>
      <div className="text-right tabular-nums text-foreground">
        {run.type === "cleanup" ? "—" : reduction(run.bytesIn, run.bytesOut)}
      </div>
    </div>
  )
}

/** Latest runs across tools; `showProject` adds the project after the file. */
export function RecentRunsTable({
  runs,
  now,
  showProject = true,
}: {
  runs: StatsRecentRun[]
  now: Date
  showProject?: boolean
}) {
  return (
    <>
      <div className={cn(RUNS_GRID, TABLE_HEAD)}>
        <div>Time</div>
        <div>Tool</div>
        <div>File</div>
        <div className="text-right">Before → after</div>
        <div className="text-right">Δ</div>
      </div>
      {runs.map((run, index) => (
        <RecentRunRow key={`${run.at}|${index}`} run={run} now={now} showProject={showProject} />
      ))}
    </>
  )
}
