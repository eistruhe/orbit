import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Themed GFM renderer for README content. Raw HTML in the markdown is
 * ignored by react-markdown by default, so no sanitizer is needed. Loaded
 * lazily — keep this module's imports self-contained.
 */
export default function ReadmeMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="border-b border-border pb-1 text-[15px] font-semibold uppercase tracking-[0.06em]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 text-[13px] font-semibold uppercase tracking-[0.06em]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 text-[12px] font-semibold uppercase tracking-[0.06em]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 text-[12px] font-medium">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-highlight underline decoration-highlight/40 underline-offset-2 hover:decoration-highlight"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          code: ({ className, children }) => {
            const isBlock = typeof className === "string"
            return isBlock ? (
              <code className="block font-mono text-[11px]">{children}</code>
            ) : (
              <code className="border border-border bg-surface-2 px-1 py-0.5 font-mono text-[10.5px]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto border border-border bg-surface-2/60 p-2.5 font-mono text-[11px] leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-highlight bg-highlight/5 px-2.5 py-1 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse border border-border text-[11px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-surface-2 px-2 py-1 text-left text-[10px] uppercase tracking-[0.06em]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),
          hr: () => <hr className="my-3 border-border" />,
          img: ({ alt }) => (
            <span className="inline-flex items-center border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              [img{alt ? `: ${alt}` : ""}]
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
