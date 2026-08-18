import { cn } from "@/lib/utils"

/**
 * Sharp-edged mono textarea. Mirrors Input's border, focus, and typography
 * so multiline fields match single-line inputs everywhere.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block w-full min-w-0 resize-y rounded-none border border-input bg-transparent px-2.5 py-2 font-mono text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/15 dark:focus-visible:border-foreground dark:disabled:bg-input/40 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
