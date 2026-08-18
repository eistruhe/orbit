import { ArrowLeftRight, Loader2 } from "lucide-react"
import { Suspense, lazy, useDeferredValue, useState } from "react"

import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const DiffView = lazy(() => import("@/components/orbit/tools/diff-view"))

type DiffStyle = "unified" | "split"

/**
 * Compare any two texts — code or plain text. The diff is computed locally
 * via `@pierre/diffs`; a filename hint enables syntax highlighting.
 */
export function DiffPage() {
  const [before, setBefore] = useState("")
  const [after, setAfter] = useState("")
  const [filename, setFilename] = useState("")
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("split")

  const deferredBefore = useDeferredValue(before)
  const deferredAfter = useDeferredValue(after)

  const hasInput = before.length > 0 || after.length > 0

  const textareaClass = "min-h-56 text-[11px] leading-relaxed"

  return (
    <div className="space-y-4">
      <ToolSection
        title="Diff"
        description="Compare two texts or code snippets side by side."
        className=""
        trailing={
          <div className="flex items-center gap-1">
            {(["split", "unified"] as const).map((style) => (
              <Button
                key={style}
                type="button"
                variant="outline"
                onClick={() => setDiffStyle(style)}
                className={cn(diffStyle === style && "bg-muted border-border-strong")}
              >
                {style === "split" ? "Split" : "Unified"}
              </Button>
            ))}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Original
              </span>
              <Textarea
                value={before}
                onChange={(event) => setBefore(event.target.value)}
                placeholder="Paste the original text or code…"
                spellCheck={false}
                className={textareaClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Modified
              </span>
              <Textarea
                value={after}
                onChange={(event) => setAfter(event.target.value)}
                placeholder="Paste the modified text or code…"
                spellCheck={false}
                className={textareaClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBefore(after)
                setAfter(before)
              }}
              disabled={!hasInput}
            >
              <ArrowLeftRight className="size-3.5" />
              Swap
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBefore("")
                setAfter("")
              }}
              disabled={!hasInput}
            >
              Clear
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Filename hint
              </span>
              <Input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder="e.g. app.tsx"
                className="w-36 font-mono text-[11px]"
              />
            </div>
          </div>
        </div>
      </ToolSection>

      <ToolSection title="Result" className="">
        {hasInput ? (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading diff renderer…
              </div>
            }
          >
            <DiffView
              before={deferredBefore}
              after={deferredAfter}
              filename={filename}
              diffStyle={diffStyle}
            />
          </Suspense>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Enter text on either side to see the diff.
          </p>
        )}
      </ToolSection>
    </div>
  )
}
