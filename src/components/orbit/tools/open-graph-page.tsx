import { Loader2 } from "lucide-react"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchOgPreview, type OgPreviewData } from "@/lib/api"
import { ToolSection } from "@/components/orbit/tools/tool-section"

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function OpenGraphPage() {
  const [url, setUrl] = useState<string>("")
  const [data, setData] = useState<OgPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setData(null)
      if (!isValidHttpUrl(url)) {
        setError("Please enter a valid http(s) URL.")
        return
      }
      setLoading(true)
      try {
        const result = await fetchOgPreview(url)
        setData(result)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load preview")
      } finally {
        setLoading(false)
      }
    },
    [url],
  )

  return (
    <div className="space-y-4">
      <ToolSection
        title="Open graph preview"
        description="Paste a URL to inspect its Open Graph, Twitter, and meta tags."
        className="max-w-3xl"
        trailing={
          loading ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading
            </span>
          ) : null
        }
      >
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={onSubmit}
          aria-busy={loading}
        >
          <Input
            id="og-url"
            type="url"
            placeholder="https://example.com/"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="flex-1"
            autoComplete="url"
          />
          <Button type="submit" variant="outline" disabled={loading}>
            Preview
          </Button>
        </form>
        {error ? (
          <p className="mt-3 border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
        {!loading && !data && !error ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Enter a URL and submit to fetch the preview.
          </p>
        ) : null}
      </ToolSection>

      {data ? (
        <ToolSection title="Preview" className="max-w-3xl">
          <article className="border border-border bg-surface">
            {data.image ? (
              <img
                src={data.image}
                alt="Open Graph preview"
                className="aspect-1200/630 w-full border-b border-border object-cover"
              />
            ) : null}
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {data.favicon ? (
                  <img
                    src={data.favicon}
                    alt=""
                    className="size-3.5"
                    aria-hidden
                  />
                ) : null}
                <span className="truncate">
                  {data.siteName ?? safeHostname(data.url)}
                </span>
              </div>
              <h3 className="text-sm font-medium text-foreground">
                {data.title ?? "Untitled"}
              </h3>
              {data.description ? (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {data.description}
                </p>
              ) : null}
            </div>
          </article>
        </ToolSection>
      ) : null}

      {data ? (
        <ToolSection
          title="Raw meta tags"
          description="Open Graph, Twitter, and other meta tags found on the page."
          className="max-w-3xl"
          trailing={
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
              {data.raw.length}
            </span>
          }
        >
          {data.raw.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%] text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Tag
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Value
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.raw.map((item, idx) => (
                  <TableRow key={`${item.tag}-${idx}`}>
                    <TableCell className="whitespace-normal align-top font-mono text-[11px] text-muted-foreground">
                      {item.tag}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top wrap-break-word text-[11px] text-foreground">
                      {item.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No meta tags found.
            </p>
          )}
        </ToolSection>
      ) : null}
    </div>
  )
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}
