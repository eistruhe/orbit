import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

import { getGitMeta } from "./git.ts"
import { detectStack } from "./stack.ts"

export type RepoRecord = {
  id: string
  name: string
  path: string
  topLevelPath: string
  branch: string | null
  lastCommitHash: string | null
  lastCommitMessage: string | null
  lastCommitIso: string | null
  lastCommitEpoch: number | null
  isDirty: boolean
  remoteUrl: string | null
  stack: string[]
  error?: string
}

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".Trash",
  ".yarn",
  "coverage",
  ".turbo",
  ".git",
])

const MAX_DEPTH = 8
const GIT_CONCURRENCY = 10

async function collectGitRoots(
  dir: string,
  depth: number,
  acc: string[],
): Promise<void> {
  if (depth > MAX_DEPTH) return

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  let hasGit = false
  for (const ent of entries) {
    if (ent.name === ".git" && (ent.isDirectory() || ent.isFile())) {
      hasGit = true
      break
    }
  }

  if (hasGit) {
    acc.push(dir)
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (SKIP_DIR_NAMES.has(ent.name)) continue
    await collectGitRoots(join(dir, ent.name), depth + 1, acc)
  }
}

function poolMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    const results: R[] = new Array(items.length)
    let next = 0
    let active = 0

    const kick = () => {
      while (active < limit && next < items.length) {
        const idx = next++
        active++
        const item = items[idx]!
        fn(item)
          .then((r) => {
            results[idx] = r
          })
          .catch(reject)
          .finally(() => {
            active--
            if (next >= items.length && active === 0) {
              resolve(results)
            } else {
              kick()
            }
          })
      }
    }

    kick()
  })
}

/**
 * Recursively finds git repos and enriches them with git metadata and stack hints.
 */
export async function scanRepos(scanRoot: string): Promise<RepoRecord[]> {
  const roots: string[] = []
  try {
    const st = await stat(scanRoot)
    if (!st.isDirectory()) {
      return []
    }
  } catch {
    return []
  }

  await collectGitRoots(scanRoot, 0, roots)

  const metas = await poolMap(roots, GIT_CONCURRENCY, async (repoPath) => {
    const git = await getGitMeta(repoPath)
    const stack = git.error ? [] : await detectStack(git.topLevel ?? repoPath)
    const top = git.topLevel ?? repoPath
    const name = top.split(/[/\\]/).filter(Boolean).pop() ?? top

    const record: RepoRecord = {
      id: top,
      name,
      path: top,
      topLevelPath: top,
      branch: git.branch,
      lastCommitHash: git.lastCommitHash,
      lastCommitMessage: git.lastCommitMessage,
      lastCommitIso: git.lastCommitIso,
      lastCommitEpoch: git.lastCommitEpoch,
      isDirty: git.isDirty,
      remoteUrl: git.remoteUrl,
      stack,
    }
    if (git.error) {
      record.error = git.error
    }
    return record
  })

  const byTop = new Map<string, RepoRecord>()
  for (const r of metas) {
    if (!byTop.has(r.topLevelPath)) {
      byTop.set(r.topLevelPath, r)
    }
  }

  return [...byTop.values()].sort((a, b) => {
    const ae = a.lastCommitEpoch ?? 0
    const be = b.lastCommitEpoch ?? 0
    return be - ae
  })
}
