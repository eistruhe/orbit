import { Code2, FolderOpen, Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { OpenTarget } from "@/lib/api"

type OpenTargetButtonsProps = {
  path: string
  onOpenExternal: (path: string, target: OpenTarget) => void
  remoteUrl?: string | null
  onOpenRemote?: (remoteUrl: string) => void
  className?: string
  size?: "default" | "compact"
}

/**
 * Finder + Cursor actions for a repository path (calls the local API).
 * Tooltip triggers use `render` so we never nest `<button>` inside Base UI’s trigger button.
 */
export function OpenTargetButtons({
  path,
  onOpenExternal,
  remoteUrl,
  onOpenRemote,
  className,
  size = "default",
}: OpenTargetButtonsProps) {
  const compact = size === "compact"
  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        compact ? "justify-end" : "gap-1",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size={compact ? "icon-xs" : "icon-sm"}
              className={cn(compact && "size-6")}
              aria-label="Open in Finder"
              onClick={() => onOpenExternal(path, "finder")}
            >
              <FolderOpen
                className={cn("size-3.5", compact && "size-3")}
                aria-hidden
              />
            </Button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          Open in Finder
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size={compact ? "icon-xs" : "icon-sm"}
              className={cn(compact && "size-6")}
              aria-label="Open in Cursor"
              onClick={() => onOpenExternal(path, "cursor")}
            >
              <Code2
                className={cn("size-3.5", compact && "size-3")}
                aria-hidden
              />
            </Button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          Open in Cursor
        </TooltipContent>
      </Tooltip>
      {remoteUrl && onOpenRemote ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size={compact ? "icon-xs" : "icon-sm"}
                className={cn(compact && "size-6")}
                aria-label="Open remote in browser"
                onClick={() => onOpenRemote(remoteUrl)}
              >
                <Globe
                  className={cn("size-3.5", compact && "size-3")}
                  aria-hidden
                />
              </Button>
            }
          />
          <TooltipContent side="bottom" className="text-xs">
            Open remote
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
