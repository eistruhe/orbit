import { useCueAttrs } from "@/lib/sound"
import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
  disabled?: boolean
  title?: string
}

/**
 * Bordered single-choice button group. All control boxes in tool pages share
 * the h-8 control height — keep this in sync with Button's default size and
 * the bordered checkbox labels.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
}) {
  const cueAttrs = useCueAttrs()
  return (
    <div
      role="radiogroup"
      className={cn("flex h-8 items-stretch border border-border", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          {...cueAttrs("select")}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "flex items-center px-2.5 font-mono text-[11px] uppercase transition-colors",
            value === option.value
              ? "bg-highlight/15 text-highlight"
              : "text-muted-foreground hover:text-foreground",
            option.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
