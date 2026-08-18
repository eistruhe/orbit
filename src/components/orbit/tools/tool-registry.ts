import {
  ArrowLeftRight,
  Binary,
  Blocks,
  Bot,
  Camera,
  Clock,
  Contrast,
  Crop,
  KeyRound,
  Network,
  GitCompareArrows,
  Palette,
  FileCode2,
  FileJson2,
  FileSearch2,
  Image as ImageIcon,
  ImageDown,
  QrCode,
  Regex,
  Route,
  Ruler,
  SearchCheck,
  ShieldCheck,
  Signpost,
  Sparkles,
  Star,
  Table2,
  TextSearch,
  Type,
} from "lucide-react"

export type ToolMeta = {
  id: string
  /** Absolute route path under the tools layout. */
  path:
    | "/tools/tinify"
    | "/tools/svgo"
    | "/tools/px-to-rem"
    | "/tools/seo-audit"
    | "/tools/schema-viewer"
    | "/tools/clamp"
    | "/tools/contrast"
    | "/tools/color-convert"
    | "/tools/redirects"
    | "/tools/robots"
    | "/tools/diff"
    | "/tools/image-convert"
    | "/tools/image-crop"
    | "/tools/favicon"
    | "/tools/cleanup"
    | "/tools/csv-viewer"
    | "/tools/strings"
    | "/tools/time"
    | "/tools/serp"
    | "/tools/encode"
    | "/tools/regex"
    | "/tools/json"
    | "/tools/qr"
    | "/tools/exif"
    | "/tools/redirect-rules"
    | "/tools/dns"
    | "/tools/ssl"
    | "/tools/env-compare"
    | "/tools/deps"
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const TOOL_ENTRIES: ToolMeta[] = [
  {
    id: "cleanup",
    path: "/tools/cleanup",
    name: "Cleanup",
    description:
      "Reclaim disk space: delete node_modules of stale projects across all libraries.",
    icon: Sparkles,
  },
  {
    id: "tinify",
    path: "/tools/tinify",
    name: "Tinify",
    description: "Compress PNG and JPG images via the TinyPNG API.",
    icon: ImageIcon,
  },
  {
    id: "image-convert",
    path: "/tools/image-convert",
    name: "Image convert",
    description:
      "Convert images to WebP or AVIF locally, with optional srcset widths.",
    icon: ImageDown,
  },
  {
    id: "image-crop",
    path: "/tools/image-crop",
    name: "Image crop",
    description:
      "Crop images interactively with fixed ratios, free form, or a circular mask.",
    icon: Crop,
  },
  {
    id: "csv-viewer",
    path: "/tools/csv-viewer",
    name: "CSV viewer",
    description:
      "Inspect CSV/TSV from file or clipboard: delimiter, search, sorting, column stats.",
    icon: Table2,
  },
  {
    id: "deps",
    path: "/tools/deps",
    name: "Dependency audit",
    description:
      "Find outdated npm dependencies across one or all scanned projects.",
    icon: Blocks,
  },
  {
    id: "env-compare",
    path: "/tools/env-compare",
    name: "Env compare",
    description:
      "Diff .env files of a project by key — missing, extra, and empty entries.",
    icon: KeyRound,
  },
  {
    id: "dns",
    path: "/tools/dns",
    name: "DNS lookup",
    description:
      "Resolve DNS records via Cloudflare and Google DoH — spot propagation differences.",
    icon: Network,
  },
  {
    id: "ssl",
    path: "/tools/ssl",
    name: "SSL check",
    description:
      "Check certificate expiry, issuer, chain, and SANs for a list of domains.",
    icon: ShieldCheck,
  },
  {
    id: "json",
    path: "/tools/json",
    name: "JSON viewer",
    description:
      "Inspect, format, and search JSON; copy node paths and generate TypeScript types.",
    icon: FileJson2,
  },
  {
    id: "qr",
    path: "/tools/qr",
    name: "QR code",
    description:
      "Generate QR codes for links, Wi-Fi, and vCards — export as SVG or PNG.",
    icon: QrCode,
  },
  {
    id: "exif",
    path: "/tools/exif",
    name: "EXIF",
    description:
      "View image metadata including GPS, and strip it via local re-encode.",
    icon: Camera,
  },
  {
    id: "redirect-rules",
    path: "/tools/redirect-rules",
    name: "Redirect rules",
    description:
      "Turn old → new URL lists into .htaccess, nginx, Vercel, or Netlify syntax.",
    icon: Signpost,
  },
  {
    id: "strings",
    path: "/tools/strings",
    name: "String utils",
    description:
      "Slug, case conversions, and character/word/byte counts for any text.",
    icon: Type,
  },
  {
    id: "time",
    path: "/tools/time",
    name: "Timestamp & cron",
    description:
      "Convert Unix timestamps, ISO dates, and time zones; explain cron expressions.",
    icon: Clock,
  },
  {
    id: "serp",
    path: "/tools/serp",
    name: "SERP preview",
    description:
      "Preview Google snippets with pixel-width limits for title and description.",
    icon: TextSearch,
  },
  {
    id: "encode",
    path: "/tools/encode",
    name: "Encoder",
    description:
      "Encode and decode Base64, URLs, and HTML entities; inspect JWTs.",
    icon: Binary,
  },
  {
    id: "regex",
    path: "/tools/regex",
    name: "Regex",
    description:
      "Test regular expressions with match highlighting, groups, and replace preview.",
    icon: Regex,
  },
  {
    id: "favicon",
    path: "/tools/favicon",
    name: "Favicon",
    description:
      "Generate favicon.ico, touch icons, and a web manifest from one image.",
    icon: Star,
  },
  {
    id: "svgo",
    path: "/tools/svgo",
    name: "SVGO",
    description: "Optimize one or many SVG files with SVGO settings.",
    icon: FileCode2,
  },
  {
    id: "px-to-rem",
    path: "/tools/px-to-rem",
    name: "Px ↔ rem",
    description:
      "Convert between pixels and rem with a configurable root font size.",
    icon: ArrowLeftRight,
  },
  {
    id: "clamp",
    path: "/tools/clamp",
    name: "Clamp()",
    description:
      "Fluid typography and spacing: generate CSS clamp() between two viewports.",
    icon: Ruler,
  },
  {
    id: "color-convert",
    path: "/tools/color-convert",
    name: "Color convert",
    description:
      "Convert any color between HEX, RGB, HSL, LAB, LCH, OKLCH, and more — edit any format.",
    icon: Palette,
  },
  {
    id: "contrast",
    path: "/tools/contrast",
    name: "Contrast",
    description:
      "WCAG contrast checker and color converter for hex, RGB, HSL, and OKLCH.",
    icon: Contrast,
  },
  {
    id: "diff",
    path: "/tools/diff",
    name: "Diff",
    description:
      "Compare two texts or code snippets with a split or unified diff view.",
    icon: GitCompareArrows,
  },
  {
    id: "seo-audit",
    path: "/tools/seo-audit",
    name: "SEO audit",
    description:
      "Audit a URL: SEO checks, headings, links, page weight, and social previews.",
    icon: SearchCheck,
  },
  {
    id: "redirects",
    path: "/tools/redirects",
    name: "Redirects",
    description:
      "Trace redirect chains and audit security and caching headers.",
    icon: Route,
  },
  {
    id: "robots",
    path: "/tools/robots",
    name: "Robots & sitemap",
    description:
      "Validate robots.txt rules and every referenced sitemap of a site.",
    icon: Bot,
  },
  {
    id: "schema-viewer",
    path: "/tools/schema-viewer",
    name: "Schema viewer",
    description:
      "Inspect and validate JSON-LD, Microdata, and RDFa from URLs or snippets.",
    icon: FileSearch2,
  },
]

/**
 * Single source of truth for tool pages, sorted A→Z by name. The tools hub
 * grid, the tools layout subtitle, the command palette, and the sidebar
 * sub-nav all derive from this list; adding a tool means one entry in
 * `TOOL_ENTRIES` plus a route in `src/router.tsx`.
 */
export const TOOLS: ToolMeta[] = [...TOOL_ENTRIES].sort((a, b) =>
  a.name.localeCompare(b.name),
)
