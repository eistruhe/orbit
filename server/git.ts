import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type GitMeta = {
  topLevel: string | null
  branch: string | null
  lastCommitHash: string | null
  lastCommitMessage: string | null
  lastCommitIso: string | null
  lastCommitEpoch: number | null
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
    lastCommitMessage: null,
    lastCommitIso: null,
    lastCommitEpoch: null,
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
      "--format=%H%x1f%s%x1f%aI%x1f%ct",
    ])
    const logLine = logOut.stdout.trim()
    let lastCommitHash: string | null = null
    let lastCommitMessage: string | null = null
    let lastCommitIso: string | null = null
    let lastCommitEpoch: number | null = null
    if (logLine) {
      const parts = logLine.split("\x1f")
      lastCommitHash = parts[0] ?? null
      lastCommitMessage = parts[1] ?? null
      lastCommitIso = parts[2] ?? null
      if (parts[3]) {
        const n = Number(parts[3])
        lastCommitEpoch = Number.isFinite(n) ? n : null
      }
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

    return {
      topLevel: topLevel ?? repoPath,
      branch,
      lastCommitHash,
      lastCommitMessage,
      lastCommitIso,
      lastCommitEpoch,
      isDirty,
      remoteUrl,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ...empty, error: message }
  }
}
