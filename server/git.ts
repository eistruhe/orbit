import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type GitMeta = {
  topLevel: string | null
  branch: string | null
  lastCommitHash: string | null
  lastCommitShortHash: string | null
  lastCommitAuthor: string | null
  lastCommitMessage: string | null
  lastCommitIso: string | null
  lastCommitEpoch: number | null
  upstreamBranch: string | null
  aheadCount: number | null
  behindCount: number | null
  isDirty: boolean
  remoteUrl: string | null
  error?: string
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024,
    env: process.env,
  })
}

/**
 * Collects git metadata for a repository working directory.
 */
export async function getGitMeta(repoPath: string): Promise<GitMeta> {
  const empty: GitMeta = {
    topLevel: null,
    branch: null,
    lastCommitHash: null,
    lastCommitShortHash: null,
    lastCommitAuthor: null,
    lastCommitMessage: null,
    lastCommitIso: null,
    lastCommitEpoch: null,
    upstreamBranch: null,
    aheadCount: null,
    behindCount: null,
    isDirty: false,
    remoteUrl: null,
  }

  try {
    const top = await runGit(repoPath, ["rev-parse", "--show-toplevel"])
    const topLevel = top.stdout.trim() || null

    const branchOut = await runGit(repoPath, [
      "branch",
      "--show-current",
    ]).catch(() => ({ stdout: "" }))
    const branch = branchOut.stdout.trim() || null

    const logOut = await runGit(repoPath, [
      "log",
      "-1",
      "--format=%H%x1f%s%x1f%aI%x1f%ct%x1f%an",
    ])
    const logLine = logOut.stdout.trim()
    let lastCommitHash: string | null = null
    let lastCommitShortHash: string | null = null
    let lastCommitAuthor: string | null = null
    let lastCommitMessage: string | null = null
    let lastCommitIso: string | null = null
    let lastCommitEpoch: number | null = null
    if (logLine) {
      const parts = logLine.split("\x1f")
      lastCommitHash = parts[0] ?? null
      lastCommitShortHash = lastCommitHash ? lastCommitHash.slice(0, 7) : null
      lastCommitMessage = parts[1] ?? null
      lastCommitIso = parts[2] ?? null
      if (parts[3]) {
        const n = Number(parts[3])
        lastCommitEpoch = Number.isFinite(n) ? n : null
      }
      lastCommitAuthor = parts[4] ?? null
    }

    const st = await runGit(repoPath, ["status", "--porcelain"])
    const isDirty = st.stdout.trim().length > 0

    let remoteUrl: string | null = null
    try {
      const r = await runGit(repoPath, ["remote", "get-url", "origin"])
      remoteUrl = r.stdout.trim() || null
    } catch {
      remoteUrl = null
    }

    let upstreamBranch: string | null = null
    let aheadCount: number | null = null
    let behindCount: number | null = null
    try {
      const upstreamOut = await runGit(repoPath, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ])
      upstreamBranch = upstreamOut.stdout.trim() || null
      if (upstreamBranch) {
        const countsOut = await runGit(repoPath, [
          "rev-list",
          "--left-right",
          "--count",
          `${upstreamBranch}...HEAD`,
        ])
        const raw = countsOut.stdout.trim()
        const [behindRaw, aheadRaw] = raw.split(/\s+/)
        const behind = Number(behindRaw)
        const ahead = Number(aheadRaw)
        behindCount = Number.isFinite(behind) ? behind : null
        aheadCount = Number.isFinite(ahead) ? ahead : null
      }
    } catch {
      upstreamBranch = null
      aheadCount = null
      behindCount = null
    }

    return {
      topLevel: topLevel ?? repoPath,
      branch,
      lastCommitHash,
      lastCommitShortHash,
      lastCommitAuthor,
      lastCommitMessage,
      lastCommitIso,
      lastCommitEpoch,
      upstreamBranch,
      aheadCount,
      behindCount,
      isDirty,
      remoteUrl,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ...empty, error: message }
  }
}
