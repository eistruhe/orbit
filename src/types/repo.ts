export type RepoRecord = {
  id: string
  name: string
  path: string
  topLevelPath: string
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
  workingTreeBytes: number | null
  nodeModulesBytes: number | null
  lastFsMtimeIso: string | null
  isDirty: boolean
  remoteUrl: string | null
  stack: string[]
  error?: string
}

export type Preferences = {
  pinnedPaths: string[]
  recent: { path: string; lastOpenedAt: string }[]
  scanRoot?: string
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
}

export type ScanResponse = {
  scanRoot: string
  scannedAt: string
  repos: RepoRecord[]
  error?: string
}
