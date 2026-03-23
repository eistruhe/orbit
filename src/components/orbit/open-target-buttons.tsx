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

function AppIcon({
  src,
  alt,
  compact,
  /** Map asset to near-black in light mode and near-white in dark (for SVG logos). */
  themeMono = false,
}: {
  src: string
  alt: string
  compact: boolean
  themeMono?: boolean
}) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === ""}
      className={cn(
        "object-contain",
        compact ? "size-3" : "size-3.5",
        themeMono && "brightness-0 dark:invert",
      )}
      draggable={false}
    />
  )
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
              <AppIcon
                src="/finder.svg"
                alt=""
                compact={compact}
                themeMono
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
              <AppIcon
                src="/cursor.svg"
                alt=""
                compact={compact}
                themeMono
              />
            </Button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          Open in Cursor
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
              aria-label="Open in GitHub Desktop"
              onClick={() => onOpenExternal(path, "github")}
            >
              <AppIcon
                src="/github.svg"
                alt=""
                compact={compact}
                themeMono
              />
            </Button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          Open in GitHub Desktop
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size={compact ? "icon-xs" : "icon-sm"}
              className={cn(compact && "size-6 px-1")}
              aria-label="Open in Browser"
              onClick={() => onOpenExternal(path, "browser")}
            >
              <span className="text-[9px] font-semibold tracking-wider uppercase">
                Web
              </span>
            </Button>
          }
        />
        <TooltipContent side="bottom" className="text-xs">
          Open in Browser ({`<repo>.test`})
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
                <AppIcon
                  src="/github.svg"
                  alt=""
                  compact={compact}
                  themeMono
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
