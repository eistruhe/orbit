type SectionHeadingProps = {
  title: string
  /** Right-aligned extras such as a count or an icon button. */
  trailing?: React.ReactNode
}

/**
 * "— TITLE ———— trailing" heading above a panel or grid. With a backdrop
 * image it becomes a panel strip (see `.section-heading` in index.css) so
 * it stays readable on any part of the image, in light and dark.
 */
export function SectionHeading({ title, trailing }: SectionHeadingProps) {
  return (
    <header className="section-heading flex items-center gap-3">
      <span className="h-px w-3.5 bg-foreground" aria-hidden />
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
        {title}
      </h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
      {trailing}
    </header>
  )
}
