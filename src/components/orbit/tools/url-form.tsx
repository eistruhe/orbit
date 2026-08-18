import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type UrlFormProps = {
  value: string
  onValueChange: (value: string) => void
  /** Called on submit; the form already prevents the default submit. */
  onSubmit: () => void
  submitLabel: string
  loading?: boolean
  placeholder?: string
  autoFocus?: boolean
}

/**
 * Shared URL input row for URL-based tools (redirects, robots, SEO audit,
 * schema viewer): h-8 input plus a highlight submit button of the same height.
 */
export function UrlForm({
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  loading = false,
  placeholder = "https://example.com",
  autoFocus,
}: UrlFormProps) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      aria-busy={loading}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Input
        type="url"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="url"
        autoFocus={autoFocus}
        className="flex-1"
      />
      <Button
        type="submit"
        variant="highlight"
        disabled={loading || value.trim().length === 0}
      >
        {submitLabel}
      </Button>
    </form>
  )
}
