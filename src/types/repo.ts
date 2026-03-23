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

export type Preferences = {
  pinnedPaths: string[]
  recent: { path: string; lastOpenedAt: string }[]
  scanRoot?: string
}

export type ScanResponse = {
  scanRoot: string
  scannedAt: string
  repos: RepoRecord[]
  error?: string
}
