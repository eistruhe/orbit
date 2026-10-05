import { ExternalLink, Loader2, Play, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { PanelTag } from "@/components/orbit/stats-primitives"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type DevServerInfo,
  type DevServerLogLine,
  type RepoScriptsResponse,
  fetchDevServerLogs,
  fetchRepoScripts,
  startDevServer,
  stopDevServer,
} from "@/lib/api"
import { cue, interactionCue } from "@/lib/sound"
import { cn } from "@/lib/utils"
import type { RepoRecord } from "@/types/repo"

const LOG_POLL_MS = 1000
const MAX_CLIENT_LOG_LINES = 2000
/** Distance from the bottom (px) under which we keep auto-sticking. */
const STICK_THRESHOLD_PX = 48

function statusLabel(server: DevServerInfo | null): {
  text: string
  className: string
} {
  if (!server) {
    return { text: "stopped", className: "text-muted-foreground" }
  }
  switch (server.status) {
    case "starting":
      return { text: "starting", className: "text-foreground" }
    case "running":
      return { text: "running", className: "text-success" }
    case "error":
      return { text: "error", className: "text-destructive" }
    case "exited":
      return {
        text: server.exitCode === 0 ? "exited" : `exited (${server.exitCode ?? "?"})`,
        className: "text-muted-foreground",
      }
  }
}

/**
 * `[Dev Server]` panel on the project detail page: pick a package.json
 * script, start/stop it, watch polled logs, open the detected URL.
 */
export function DevServerSection({ repo }: { repo: RepoRecord }) {
  const { devServers, refreshDevServers } = useOrbit()

  const [scriptsInfo, setScriptsInfo] = useState<RepoScriptsResponse | null | undefined>(undefined)
  const [selectedScript, setSelectedScript] = useState<string>("dev")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<DevServerLogLine[]>([])

  const logSinceRef = useRef(0)
  const logPaneRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  // Latest server for this repo — active preferred, otherwise most recent
  // exited one so its logs stay visible.
  const server = useMemo(() => {
    const forRepo = devServers.filter((s) => s.repoPath === repo.path)
    if (forRepo.length === 0) return null
    const active = forRepo.filter(
      (s) => s.status === "starting" || s.status === "running",
    )
    const pool = active.length > 0 ? active : forRepo
    return pool.reduce((latest, s) =>
      s.startedAt > latest.startedAt ? s : latest,
    )
  }, [devServers, repo.path])
  const serverId = server?.id ?? null
  const serverActive =
    server?.status === "starting" || server?.status === "running"

  useEffect(() => {
    let cancelled = false
    setScriptsInfo(undefined)
    void (async () => {
      try {
        const info = await fetchRepoScripts(repo.path)
        if (cancelled) return
        setScriptsInfo(info)
        if (info) {
          const names = Object.keys(info.scripts)
          setSelectedScript(names.includes("dev") ? "dev" : names[0] ?? "dev")
        }
      } catch {
        if (!cancelled) setScriptsInfo(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repo.path])

  // Reset the log buffer whenever we watch a different server instance.
  useEffect(() => {
    logSinceRef.current = 0
    stickToBottomRef.current = true
    setLogLines([])
  }, [serverId])

  const pollLogs = useCallback(async () => {
    if (!serverId) return
    try {
      const response = await fetchDevServerLogs(serverId, logSinceRef.current)
      if (response.lines.length > 0) {
        logSinceRef.current = response.nextSince
        setLogLines((current) => {
          const merged = [...current, ...response.lines]
          return merged.length > MAX_CLIENT_LOG_LINES
            ? merged.slice(merged.length - MAX_CLIENT_LOG_LINES)
            : merged
        })
      }
    } catch {
      // Server record may be gone (stopped + dismissed); status poll handles it.
    }
  }, [serverId])

  useEffect(() => {
    if (!serverId) return
    void pollLogs()
    if (!serverActive) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return
      void pollLogs()
    }, LOG_POLL_MS)
    return () => window.clearInterval(interval)
  }, [serverId, serverActive, pollLogs])

  useEffect(() => {
    const pane = logPaneRef.current
    if (!pane || !stickToBottomRef.current) return
    pane.scrollTop = pane.scrollHeight
  }, [logLines])

  if (scriptsInfo === null) return null

  const scriptNames = scriptsInfo ? Object.keys(scriptsInfo.scripts) : []
  const status = statusLabel(server)

  const handleStart = () => {
    setActionError(null)
    setBusy(true)
    // `ready` follows from orbit-app once the server reports its URL.
    cue("loading", { emphasis: "subtle" })
    void (async () => {
      try {
        await startDevServer(repo.path, selectedScript)
        await refreshDevServers()
      } catch (error: unknown) {
        cue("error")
        setActionError(
          error instanceof Error ? error.message : "Could not start dev server",
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  const handleStop = () => {
    if (!serverId) return
    setActionError(null)
    setBusy(true)
    void (async () => {
      try {
        await stopDevServer(serverId)
        await refreshDevServers()
        interactionCue("close")
      } catch (error: unknown) {
        cue("error")
        setActionError(
          error instanceof Error ? error.message : "Could not stop dev server",
        )
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <section className="border border-border bg-card">
      <header className="flex h-9 items-center justify-between gap-3 border-b border-border/60 px-3">
        <PanelTag>Dev server</PanelTag>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]",
            status.className,
          )}
        >
          {serverActive ? (
            <span
              className="size-1.5 animate-pulse rounded-full bg-success shadow-[0_0_6px_var(--success,currentColor)]"
              aria-hidden
            />
          ) : null}
          {status.text}
        </span>
      </header>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={selectedScript}
            onValueChange={(value) => {
              if (typeof value === "string") setSelectedScript(value)
            }}
            disabled={serverActive || scriptNames.length === 0}
          >
            <SelectTrigger size="sm" className="min-w-36 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scriptNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {serverActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={handleStop}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5 text-muted-foreground" />
              )}
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              variant="highlight"
              size="sm"
              disabled={busy || scriptNames.length === 0}
              onClick={handleStart}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Start
            </Button>
          )}

          {server?.detectedUrl ? (
            <button
              type="button"
              onClick={() => window.open(server.detectedUrl ?? "", "_blank")}
              className="inline-flex h-7 items-center gap-1.5 border border-highlight/40 bg-highlight/10 px-2 font-mono text-[11px] text-highlight transition-colors hover:bg-highlight/20"
            >
              <ExternalLink className="size-3" aria-hidden />
              {server.detectedUrl}
            </button>
          ) : null}

          {scriptsInfo ? (
            <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {scriptsInfo.packageManager} run {serverActive && server ? server.script : selectedScript}
            </span>
          ) : null}
        </div>

        {scriptNames.length === 0 && scriptsInfo ? (
          <p className="text-[11px] text-muted-foreground">
            No scripts defined in package.json.
          </p>
        ) : null}

        {actionError ? (
          <div
            role="alert"
            className="flex items-start gap-2 border border-destructive/35 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive"
          >
            <span className="min-w-0 leading-snug">{actionError}</span>
          </div>
        ) : null}

        {server ? (
          <div
            ref={logPaneRef}
            onScroll={(event) => {
              const pane = event.currentTarget
              stickToBottomRef.current =
                pane.scrollHeight - pane.scrollTop - pane.clientHeight <
                STICK_THRESHOLD_PX
            }}
            className="max-h-72 overflow-y-auto border border-border bg-surface-2/40 p-2 font-mono text-[10.5px] leading-relaxed"
          >
            {logLines.length === 0 ? (
              <p className="text-muted-foreground">Waiting for output…</p>
            ) : (
              logLines.map((line) => (
                <p
                  key={line.seq}
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    line.stream === "stderr"
                      ? "text-muted-foreground"
                      : "text-foreground/90",
                  )}
                >
                  {line.text}
                </p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
