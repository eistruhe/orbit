import { Loader2, RefreshCw } from "lucide-react"
import { Outlet } from "@tanstack/react-router"

import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import { DotmCircular4 } from "@/components/ui/dotm-circular-4"

type StatItemProps = {
  label: string
  value: React.ReactNode
  emphasis?: boolean
}

function StatItem({ label, value, emphasis }: StatItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-[12px] tabular-nums text-foreground"
            : "text-[11px] tabular-nums text-foreground/90"
        }
      >
        {value}
      </span>
    </div>
  )
}

export function ProjectsLayout() {
  const { repos, scanRoot, scannedAt, loading, doScan, error } = useOrbit()

  const dirtyCount = repos.filter((r) => r.isDirty && !r.error).length
  const errorCount = repos.filter((r) => Boolean(r.error)).length
  const cleanCount = repos.length - dirtyCount - errorCount

  return (
    <>
      <header className="app-drag sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-border bg-sidebar/85 px-3 backdrop-blur-md">
        <div className="flex items-center gap-5 overflow-hidden">
          <StatItem label="Projects" value={repos.length} emphasis />
          <span className="stat-divider" aria-hidden />
          <StatItem
            label="Clean"
            value={
              <span className="text-success">{cleanCount}</span>
            }
          />
          <StatItem
            label="Dirty"
            value={
              <span className="text-highlight">{dirtyCount}</span>
            }
          />
          {errorCount > 0 ? (
            <StatItem
              label="Error"
              value={
                <span className="text-destructive">{errorCount}</span>
              }
            />
          ) : null}
          <span className="stat-divider hidden md:block" aria-hidden />
          <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Scan root
            </span>
            <span className="truncate text-[11px] text-foreground/80">
              {scanRoot ?? "—"}
            </span>
          </div>
          <span className="stat-divider hidden lg:block" aria-hidden />
          <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Last scan
            </span>
            <span className="truncate text-[11px] tabular-nums text-foreground/80">
              {scannedAt ? new Date(scannedAt).toLocaleString() : "—"}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void doScan()}
          disabled={loading}
          className="app-no-drag gap-1.5"
        >
          {loading ? (
            // <Loader2 className="size-3.5 animate-spin" />
            <DotmCircular4
              size={16}
              dotSize={2}
              speed={1.5}
            />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Scan
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-3 py-6">
        {error ? (
          <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] uppercase tracking-[0.04em] text-destructive">
            {error}
          </p>
        ) : null}

        <Outlet />
      </div>
    </>
  )
}
