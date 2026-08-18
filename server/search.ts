import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join, relative } from "node:path"

import { collectGitRoots, SKIP_DIR_NAMES } from "./scan.ts"
import { mapLimit } from "./util.ts"

const MAX_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_MATCHES = 500
const MAX_MATCHES_PER_FILE = 20
const MAX_WALK_DEPTH = 12
const WALL_CLOCK_BUDGET_MS = 20_000
const READ_CONCURRENCY = 8
const BINARY_SNIFF_BYTES = 8 * 1024
const PREVIEW_MAX_CHARS = 200

const SKIP_FILE_NAMES = new Set([
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  ".DS_Store",
])

export type SearchMatch = {
  line: number
  column: number
  preview: string
}

export type SearchFileResult = {
  relPath: string
  matches: SearchMatch[]
}

export type SearchRepoResult = {
  repoPath: string
  repoName: string
  files: SearchFileResult[]
}

export type SearchData = {
  results: SearchRepoResult[]
  truncated: boolean
  filesScanned: number
  durationMs: number
}

export type SearchResult =
  | { ok: true; data: SearchData }
  | { ok: false; status: number; error: string }

function shouldSkipFile(name: string): boolean {
  if (SKIP_FILE_NAMES.has(name)) return true
  if (name.endsWith(".map")) return true
  if (/\.min\.[a-z0-9]+$/i.test(name)) return true
  return false
}

async function collectFiles(
  dir: string,
  depth: number,
  acc: string[],
  deadline: number,
): Promise<void> {
  if (depth > MAX_WALK_DEPTH || Date.now() > deadline) return

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      await collectFiles(join(dir, entry.name), depth + 1, acc, deadline)
    } else if (entry.isFile() && !shouldSkipFile(entry.name)) {
      acc.push(join(dir, entry.name))
    }
  }
}

function looksBinary(bytes: Uint8Array): boolean {
  const sniffLength = Math.min(bytes.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < sniffLength; i += 1) {
    if (bytes[i] === 0) return true
  }
  return false
}

function buildPreview(lineText: string, column: number): string {
  const trimmed = lineText.trimEnd()
  if (trimmed.length <= PREVIEW_MAX_CHARS) return trimmed
  const half = Math.floor(PREVIEW_MAX_CHARS / 2)
  const start = Math.max(0, column - half)
  const slice = trimmed.slice(start, start + PREVIEW_MAX_CHARS)
  return `${start > 0 ? "…" : ""}${slice}${start + PREVIEW_MAX_CHARS < trimmed.length ? "…" : ""}`
}

type Matcher = (line: string) => { index: number } | null

function buildMatcher(
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): Matcher | { error: string } {
  if (regex) {
    let pattern: RegExp
    try {
      pattern = new RegExp(query, caseSensitive ? "" : "i")
    } catch (error) {
      return {
        error: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    return (line) => {
      const match = pattern.exec(line)
      return match ? { index: match.index } : null
    }
  }

  const needle = caseSensitive ? query : query.toLowerCase()
  return (line) => {
    const haystack = caseSensitive ? line : line.toLowerCase()
    const index = haystack.indexOf(needle)
    return index >= 0 ? { index } : null
  }
}

/** Normalizes user-provided extension filters ("*.ts", ".ts", "ts" → "ts"). */
function normalizeExtensions(extensions: string[] | undefined): Set<string> {
  const normalized = new Set<string>()
  for (const raw of extensions ?? []) {
    const ext = raw.trim().toLowerCase().replace(/^\*?\.*/, "")
    if (ext.length > 0) normalized.add(ext)
  }
  return normalized
}

function fileExtension(filePath: string): string | null {
  const name = basename(filePath)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return null
  return name.slice(dot + 1).toLowerCase()
}

/**
 * JS content grep across the git repositories under the given roots, with
 * size, count, and wall-clock caps.
 */
export async function runContentSearch(input: {
  query: string
  regex?: boolean
  caseSensitive?: boolean
  extensions?: string[]
  roots: string[]
}): Promise<SearchResult> {
  const query = input.query
  if (typeof query !== "string" || query.trim().length < 3) {
    return {
      ok: false,
      status: 400,
      error: "Query must be at least 3 characters long",
    }
  }

  const matcher = buildMatcher(
    query,
    input.regex === true,
    input.caseSensitive === true,
  )
  if (typeof matcher !== "function") {
    return { ok: false, status: 400, error: matcher.error }
  }

  const extensionFilter = normalizeExtensions(input.extensions)

  const startedAt = Date.now()
  const deadline = startedAt + WALL_CLOCK_BUDGET_MS

  const repoRoots: string[] = []
  for (const root of input.roots) {
    try {
      const st = await stat(root)
      if (!st.isDirectory()) continue
    } catch {
      continue
    }
    await collectGitRoots(root, 0, repoRoots)
  }
  const uniqueRepoRoots = [...new Set(repoRoots)]

  const state = {
    totalMatches: 0,
    truncated: false,
    filesScanned: 0,
  }
  const results: SearchRepoResult[] = []

  for (const repoRoot of uniqueRepoRoots) {
    if (state.truncated || Date.now() > deadline) {
      state.truncated = true
      break
    }

    const allFiles: string[] = []
    await collectFiles(repoRoot, 0, allFiles, deadline)
    const files =
      extensionFilter.size > 0
        ? allFiles.filter((filePath) => {
            const ext = fileExtension(filePath)
            return ext !== null && extensionFilter.has(ext)
          })
        : allFiles

    const fileResults = await mapLimit(files, READ_CONCURRENCY, async (filePath) => {
      if (state.totalMatches >= MAX_TOTAL_MATCHES || Date.now() > deadline) {
        state.truncated = true
        return null
      }

      let bytes: Buffer
      try {
        const st = await stat(filePath)
        if (!st.isFile() || st.size > MAX_FILE_BYTES) return null
        bytes = await readFile(filePath)
      } catch {
        return null
      }
      if (looksBinary(bytes)) return null

      state.filesScanned += 1
      const lines = bytes.toString("utf8").split("\n")
      const matches: SearchMatch[] = []
      for (let i = 0; i < lines.length; i += 1) {
        if (matches.length >= MAX_MATCHES_PER_FILE) break
        if (state.totalMatches >= MAX_TOTAL_MATCHES) {
          state.truncated = true
          break
        }
        const hit = matcher(lines[i])
        if (!hit) continue
        state.totalMatches += 1
        matches.push({
          line: i + 1,
          column: hit.index + 1,
          preview: buildPreview(lines[i], hit.index),
        })
      }

      if (matches.length === 0) return null
      return { relPath: relative(repoRoot, filePath), matches }
    })

    const nonEmpty = fileResults.filter(
      (entry): entry is SearchFileResult => entry !== null,
    )
    if (nonEmpty.length > 0) {
      nonEmpty.sort((a, b) => a.relPath.localeCompare(b.relPath))
      results.push({
        repoPath: repoRoot,
        repoName: basename(repoRoot),
        files: nonEmpty,
      })
    }
  }

  return {
    ok: true,
    data: {
      results,
      truncated: state.truncated,
      filesScanned: state.filesScanned,
      durationMs: Date.now() - startedAt,
    },
  }
}
