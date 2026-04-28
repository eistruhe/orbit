import { ChevronRight, Image as ImageIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

const tools = [
  {
    id: "tinify",
    name: "Tinify",
    description: "Compress PNG and JPG images via the TinyPNG API.",
    icon: ImageIcon,
    target: "/tools/tinify" as const,
  },
]

export function ToolsHubPage() {
  const navigate = useNavigate()

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-3">
        <span className="h-px w-3.5 bg-foreground uppercase tracking-[0.16em] text-muted-foreground"></span>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em]">
          Available tools
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-[10px] tabular-nums text-foreground/80">
          {tools.length}
        </span>
      </header>

      <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3 border border-border">
        {tools.map((tool, idx) => {
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => navigate({ to: tool.target })}
              className="group/tool flex flex-col gap-2 bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-[12px] uppercase tracking-[0.06em] text-foreground">
                    {tool.name}
                  </span>
                </div>
                <ChevronRight
                  className="size-3.5 text-muted-foreground transition-transform group-hover/tool:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
