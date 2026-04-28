import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type ThemeToggleProps = {
  className?: string
}

/**
 * Three-state mono theme switch (light / system / dark) styled as a
 * segmented control to match the boxed terminal aesthetic.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const current = mounted ? (theme ?? "system") : "system"
  const showDarkActive =
    current === "dark" || (current === "system" && resolvedTheme === "dark")
  const showLightActive =
    current === "light" || (current === "system" && resolvedTheme === "light")

  const baseClass =
    "flex h-6.5 flex-1 items-center justify-center gap-1.5 px-2 text-[10px] uppercase tracking-[0.06em] transition-colors"

  return (
    <div
      className={cn(
        "app-no-drag inline-flex h-7 items-stretch border border-border rounded-bl-[12px]",
        className,
      )}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={showLightActive && current !== "system"}
        className={cn(
          baseClass,
          "rounded-bl-[12px]",
          current === "light"
            ? "bg-foreground text-background relative z-10 -mx-px -top-px h-[calc(100%+2px)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Sun className="size-3" aria-hidden />
        <span>Light</span>
      </button>
      <span className="w-px self-stretch bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-pressed={current === "system"}
        className={cn(
          baseClass,
          current === "system"
            ? "bg-foreground text-background relative z-10 -mx-px -top-px h-[calc(100%+2px)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        Auto
      </button>
      <span className="w-px self-stretch bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={showDarkActive && current !== "system"}
        className={cn(
          baseClass,
          current === "dark"
            ? "bg-foreground text-background relative z-10 -mx-px -top-px h-[calc(100%+2px)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Moon className="size-3" aria-hidden />
        <span>Dark</span>
      </button>
    </div>
  )
}
