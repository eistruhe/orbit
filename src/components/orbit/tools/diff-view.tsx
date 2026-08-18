import { parseDiffFromFile } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useTheme } from "next-themes"
import { useMemo } from "react"

export type DiffViewProps = {
  before: string
  after: string
  filename: string
  diffStyle: "unified" | "split"
}

/**
 * Lazy-loaded diff renderer so `@pierre/diffs` (and Shiki) stay out of the
 * main bundle. Computes the diff from the two raw texts and renders it.
 */
export default function DiffView({
  before,
  after,
  filename,
  diffStyle,
}: DiffViewProps) {
  const { resolvedTheme } = useTheme()
  const name = filename.trim() || "text.txt"

  const fileDiff = useMemo(() => {
    try {
      return parseDiffFromFile(
        { name, contents: before },
        { name, contents: after },
      )
    } catch {
      return null
    }
  }, [name, before, after])

  if (!fileDiff) {
    return (
      <p className="text-[11px] text-destructive">
        Could not compute a diff for this input.
      </p>
    )
  }

  const additions = fileDiff.hunks.reduce(
    (sum, hunk) => sum + hunk.additionLines,
    0,
  )
  const deletions = fileDiff.hunks.reduce(
    (sum, hunk) => sum + hunk.deletionLines,
    0,
  )

  if (additions === 0 && deletions === 0) {
    return (
      <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        Both texts are identical.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] text-muted-foreground">
        <span className="text-emerald-600 dark:text-emerald-400">
          +{additions}
        </span>{" "}
        <span className="text-destructive">−{deletions}</span>
      </p>
      <div className="border border-border">
        <FileDiff
          fileDiff={fileDiff}
          options={{
            diffStyle,
            disableFileHeader: true,
            // Follow the app's next-themes setting instead of the OS scheme.
            themeType: resolvedTheme === "dark" ? "dark" : "light",
          }}
        />
      </div>
    </div>
  )
}
