import { Check, Clipboard, Eye, EyeOff, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import {
  type EnvFileInfo,
  fetchEnvFiles,
  fetchEnvValues,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type DiffGroup = {
  id: string
  title: string
  description: string
  /** File whose value a reveal would show. */
  file: string
  keys: string[]
}

/**
 * Compares two .env files of a project by KEY only — values are fetched
 * per file solely when explicitly revealed, and never leave the machine.
 */
export function EnvComparePage() {
  const { allRepos } = useOrbit()
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [files, setFiles] = useState<EnvFileInfo[] | null>(null)
  const [fileA, setFileA] = useState<string | null>(null)
  const [fileB, setFileB] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  )
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const repos = useMemo(
    () => [...allRepos].sort((a, b) => a.name.localeCompare(b.name)),
    [allRepos],
  )

  const loadProject = (path: string) => {
    setProjectPath(path)
    setFiles(null)
    setFileA(null)
    setFileB(null)
    setValues({})
    setRevealed(new Set())
    setError(null)
    setLoading(true)
    void fetchEnvFiles(path)
      .then((next) => {
        setFiles(next)
        const names = next.map((file) => file.name)
        setFileA(
          names.find((name) => name === ".env") ?? names[0] ?? null,
        )
        setFileB(
          names.find((name) => name === ".env.example") ??
            names.find((name) => name !== (names.find((n) => n === ".env") ?? names[0])) ??
            null,
        )
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load"),
      )
      .finally(() => setLoading(false))
  }

  const infoA = files?.find((file) => file.name === fileA) ?? null
  const infoB = files?.find((file) => file.name === fileB) ?? null

  const groups = useMemo<DiffGroup[]>(() => {
    if (!infoA || !infoB) return []
    const keysA = new Set(infoA.keys.map((entry) => entry.key))
    const keysB = new Set(infoB.keys.map((entry) => entry.key))
    return [
      {
        id: "missing",
        title: `Missing in ${infoA.name}`,
        description: `Keys present in ${infoB.name} but not in ${infoA.name}`,
        file: infoB.name,
        keys: infoB.keys
          .map((entry) => entry.key)
          .filter((key) => !keysA.has(key)),
      },
      {
        id: "extra",
        title: `Only in ${infoA.name}`,
        description: `Keys missing from ${infoB.name}`,
        file: infoA.name,
        keys: infoA.keys
          .map((entry) => entry.key)
          .filter((key) => !keysB.has(key)),
      },
      {
        id: "empty",
        title: `Empty in ${infoA.name}`,
        description: "Keys defined without a value",
        file: infoA.name,
        keys: infoA.keys
          .filter((entry) => !entry.hasValue)
          .map((entry) => entry.key),
      },
    ]
  }, [infoA, infoB])

  const toggleReveal = (file: string, key: string) => {
    const id = `${file}:${key}`
    if (revealed.has(id)) {
      setRevealed((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      return
    }
    const show = () =>
      setRevealed((current) => new Set(current).add(id))
    if (values[file] || !projectPath) {
      show()
      return
    }
    void fetchEnvValues(projectPath, file)
      .then((next) => {
        setValues((current) => ({ ...current, [file]: next }))
        show()
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load values"),
      )
  }

  const copyMissing = () => {
    const missing = groups.find((group) => group.id === "missing")
    if (!missing || missing.keys.length === 0) return
    const block = missing.keys.map((key) => `${key}=`).join("\n")
    void navigator.clipboard.writeText(block).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <div className="space-y-4">
      <ToolSection
        title="Env compare"
        description="Compare .env files of a project by key — values stay hidden unless you reveal them per row."
        trailing={
          loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Project
            </span>
            <Select
              value={projectPath ?? ""}
              onValueChange={(value) => {
                if (typeof value === "string" && value) loadProject(value)
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

          {files && files.length > 0 ? (
            <>
              {(
                [
                  ["A", fileA, setFileA],
                  ["B", fileB, setFileB],
                ] as const
              ).map(([label, value, setValue]) => (
                <label key={label} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    File {label}
                  </span>
                  <Select
                    value={value ?? ""}
                    onValueChange={(next) => {
                      if (typeof next === "string" && next) setValue(next)
                    }}
                  >
                    <SelectTrigger className="min-w-44 font-mono">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {files.map((file) => (
                        <SelectItem key={file.name} value={file.name}>
                          {file.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </>
          ) : null}
        </div>

        {files && files.length === 0 ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            No .env files found in this project root.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-[11px] text-destructive">{error}</p>
        ) : null}
      </ToolSection>

      {infoA && infoB && infoA.name !== infoB.name ? (
        <>
          {groups.map((group) => (
            <ToolSection
              key={group.id}
              title={group.title}
              description={group.description}
              trailing={
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      group.keys.length === 0
                        ? "text-success"
                        : "text-highlight",
                    )}
                  >
                    {group.keys.length}
                  </span>
                  {group.id === "missing" && group.keys.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={copyMissing}
                    >
                      {copied ? (
                        <Check className="size-3 text-success" />
                      ) : (
                        <Clipboard className="size-3 text-muted-foreground" />
                      )}
                      Copy as KEY= block
                    </Button>
                  ) : null}
                </div>
              }
            >
              {group.keys.length === 0 ? (
                <p className="text-[11px] text-success">Nothing here — good.</p>
              ) : (
                <div className="divide-y divide-border/60 border border-border">
                  {group.keys.map((key) => {
                    const id = `${group.file}:${key}`
                    const isRevealed = revealed.has(id)
                    const value = values[group.file]?.[key]
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 px-2.5 py-1.5"
                      >
                        <span className="min-w-0 shrink-0 font-mono text-[11px] text-foreground">
                          {key}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                          {isRevealed ? (
                            (value ?? "")
                          ) : (
                            <span className="text-muted-foreground/40">
                              ••••••
                            </span>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={
                            isRevealed ? "Hide value" : "Reveal value"
                          }
                          onClick={() => toggleReveal(group.file, key)}
                        >
                          {isRevealed ? (
                            <EyeOff className="size-3 text-muted-foreground" />
                          ) : (
                            <Eye className="size-3 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </ToolSection>
          ))}
        </>
      ) : null}
    </div>
  )
}
