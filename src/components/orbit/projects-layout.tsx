import { Loader2, RefreshCw } from "lucide-react"
import { Outlet } from "@tanstack/react-router"

import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"

export function ProjectsLayout() {
  const { repos, scanRoot, scannedAt, loading, doScan, error } = useOrbit()

  return (
    <>
      <header className="app-drag sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border px-3 h-12 bg-sidebar/30 dark:bg-sidebar/70 backdrop-blur-lg">
        <div>
          <p className="text-xs text-muted-foreground">
            {repos.length} projects found
            {scanRoot ? (
              <span className="ml-2 text-[10px] opacity-80">
                · {scanRoot}
              </span>
            ) : null}
            {scannedAt ? (
              <span className="ml-2 text-[10px] opacity-80">
                · scanned {new Date(scannedAt).toLocaleString()}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void doScan()}
          disabled={loading}
          className="app-no-drag gap-2"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Scan projects
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-8 px-3 py-8">
        {error ? (
          <p className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Outlet />
      </div>
    </>
  )
}
