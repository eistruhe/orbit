import { formatBytes } from "@/lib/format-size"
import type { RepoRecord } from "@/types/repo"

export function syncLabel(repo: RepoRecord): string | null {
  if (repo.aheadCount == null || repo.behindCount == null) return null
  if (repo.aheadCount === 0 && repo.behindCount === 0) return "Synced"
  return `↑${repo.aheadCount} ↓${repo.behindCount}`
}

export function diskLabel(repo: RepoRecord): string | null {
  const repoSize = formatBytes(repo.workingTreeBytes)
  const nodeModulesSize = formatBytes(repo.nodeModulesBytes)
  if (!repoSize && !nodeModulesSize) return null
  if (repoSize && nodeModulesSize) {
    return `repo ${repoSize} · node_modules ${nodeModulesSize}`
  }
  if (repoSize) return `repo ${repoSize}`
  return `node_modules ${nodeModulesSize}`
}
