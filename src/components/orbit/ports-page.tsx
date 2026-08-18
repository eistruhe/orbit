import { Loader2, RefreshCw, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { OrbitDialog } from "@/components/orbit/orbit-dialog"
import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import { type PortEntry, fetchPorts, killPortProcess } from "@/lib/api"
import { cn } from "@/lib/utils"

const REFRESH_MS = 2000

type PortGroup = {
  key: string
  port: number
  command: string
  user: string
  address: string
  pids: number[]
}

function groupEntries(entries: PortEntry[]): PortGroup[] {
  const groups = new Map<string, PortGroup>()
  for (const entry of entries) {
    const key = `${entry.port}·${entry.command}·${entry.user}`
    const existing = groups.get(key)
    if (existing) {
      if (!existing.pids.includes(entry.pid)) existing.pids.push(entry.pid)
    } else {
      groups.set(key, {
        key,
        port: entry.port,
        command: entry.command,
        user: entry.user,
        address: entry.address,
        pids: [entry.pid],
      })
    }
  }
  return [...groups.values()].sort((a, b) => a.port - b.port)
}

/**
 * Live view of listening TCP ports (lsof) with a guarded kill action.
 */
export function PortsPage() {
  const { devServers } = useOrbit()
  const [entries, setEntries] = useState<PortEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [killTarget, setKillTarget] = useState<PortGroup | null>(null)
  const [killing, setKilling] = useState(false)
  const [killError, setKillError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setEntries(await fetchPorts())
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not list ports")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return
      void refresh()
    }, REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  const orbitPorts = useMemo(() => {
    const ports = new Set<number>()
    for (const server of devServers) {
      if (!server.detectedUrl) continue
      if (server.status !== "running" && server.status !== "starting") continue
      try {
        const port = Number(new URL(server.detectedUrl).port)
        if (port) ports.add(port)
      } catch {
        // ignore unparsable URLs
      }
    }
    return ports
  }, [devServers])

  const groups = useMemo(() => groupEntries(entries ?? []), [entries])

  const confirmKill = () => {
    if (!killTarget) return
    setKilling(true)
    setKillError(null)
    void (async () => {
      let failure: string | null = null
      for (const pid of killTarget.pids) {
        try {
          await killPortProcess(pid, killTarget.port)
        } catch (err: unknown) {
          // "no longer listening" just means an earlier kill took the group down.
          const message = err instanceof Error ? err.message : "Kill failed"
          if (!message.toLowerCase().includes("no longer listening")) {
            failure = message
          }
        }
      }
      setKilling(false)
      if (failure) {
        setKillError(failure)
      } else {
        setKillTarget(null)
        void refresh()
      }
    })()
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-3">
        <span className="h-px w-3.5 bg-foreground" aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em]">
          Listening TCP ports
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-[10px] tabular-nums text-foreground/80">
          {groups.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void refresh()}
          aria-label="Refresh"
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="border border-border bg-card">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)_8rem_10rem_9rem_4rem] border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground [&>div]:px-2 [&>div]:py-2">
          <div>Port</div>
          <div>Command</div>
          <div>User</div>
          <div>Address</div>
          <div>PID</div>
          <div />
        </div>
        {entries === null ? (
          <div className="flex items-center gap-2 px-3 py-6 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Scanning ports…
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            No listening TCP ports found.
          </p>
        ) : (
          groups.map((group, index) => (
            <div
              key={group.key}
              className={cn(
                "grid grid-cols-[5rem_minmax(0,1fr)_8rem_10rem_9rem_4rem] items-center border-b border-border/60 text-[11px] last:border-b-0 [&>div]:px-2 [&>div]:py-1.5",
                index % 2 === 0 ? "bg-card" : "bg-surface-2/30",
              )}
            >
              <div className="font-mono tabular-nums text-foreground">
                {group.port}
                {orbitPorts.has(group.port) ? (
                  <span
                    className="ml-1.5 inline-flex items-center border border-highlight/40 bg-highlight/10 px-1 text-[9px] uppercase tracking-[0.08em] text-highlight"
                    title="Managed by Orbit dev server"
                  >
                    orbit
                  </span>
                ) : null}
              </div>
              <div className="truncate text-foreground/90" title={group.command}>
                {group.command}
              </div>
              <div className="truncate text-muted-foreground">{group.user}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {group.address}
              </div>
              <div className="truncate font-mono tabular-nums text-muted-foreground">
                {group.pids[0]}
                {group.pids.length > 1 ? ` +${group.pids.length - 1}` : ""}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Kill process on port ${group.port}`}
                  onClick={() => {
                    setKillError(null)
                    setKillTarget(group)
                  }}
                >
                  <X className="size-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {killTarget ? (
        <OrbitDialog
          title="Kill Process"
          tone="destructive"
          role="alertdialog"
          subtitle={`${killTarget.command} on port ${killTarget.port}`}
          closeDisabled={killing}
          onClose={() => setKillTarget(null)}
        >
          <div className="space-y-3 p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Send SIGTERM to{" "}
              {killTarget.pids.length === 1
                ? `PID ${killTarget.pids[0]}`
                : `${killTarget.pids.length} processes (${killTarget.pids.join(", ")})`}
              ? Unsaved state in that process will be lost.
            </p>
            {killError ? (
              <div
                role="alert"
                className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
              >
                {killError}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setKillTarget(null)}
                disabled={killing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={confirmKill}
                disabled={killing}
              >
                {killing ? "Killing…" : "Kill process"}
              </Button>
            </div>
          </div>
        </OrbitDialog>
      ) : null}
    </section>
  )
}
