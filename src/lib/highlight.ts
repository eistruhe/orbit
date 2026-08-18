import type { BundledLanguage, BundledTheme, HighlighterGeneric } from "shiki"

export type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

export const HIGHLIGHT_THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const satisfies Record<string, BundledTheme>

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  php: "php",
  twig: "twig",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  md: "markdown",
  mdx: "mdx",
  yml: "yaml",
  yaml: "yaml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  xml: "xml",
  svg: "xml",
  toml: "toml",
  ini: "ini",
  graphql: "graphql",
  gql: "graphql",
  liquid: "liquid",
  prisma: "prisma",
}

/** Maps a file path to a Shiki language id, or null when unknown. */
export function langForPath(relPath: string): BundledLanguage | null {
  const name = relPath.slice(relPath.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return null
  return EXT_TO_LANG[name.slice(dot + 1).toLowerCase()] ?? null
}

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({
      themes: [HIGHLIGHT_THEMES.light, HIGHLIGHT_THEMES.dark],
      langs: [],
    }),
  )
  return highlighterPromise
}

/**
 * Returns the shared highlighter with the given languages loaded. Shiki is
 * imported lazily so it stays out of the main bundle; unknown or failing
 * languages are skipped silently (callers fall back to plain text).
 */
export async function loadHighlighter(
  langs: BundledLanguage[],
): Promise<Highlighter> {
  const highlighter = await getHighlighter()
  const loaded = new Set(highlighter.getLoadedLanguages())
  await Promise.all(
    langs
      .filter((lang) => !loaded.has(lang))
      .map((lang) => highlighter.loadLanguage(lang).catch(() => undefined)),
  )
  return highlighter
}
