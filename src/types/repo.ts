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
  orbitLibraryId: string
  error?: string
}

export type ProjectLibrary = {
  id: string
  label: string
  path: string
}

export type Preferences = {
  pinnedPaths: string[]
  recent: { path: string; lastOpenedAt: string }[]
  primaryScanRootLabel: string
  scanRoot?: string
  additionalScanRoots: ProjectLibrary[]
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
  appSettings: {
    tinify?: {
      apiKey?: string
    }
    svgo?: {
      schemaVersion?: number
      plugins?: Record<string, boolean>
      multipass?: boolean
      pretty?: boolean
      floatPrecision?: number
      transformPrecision?: number
    }
  }
}

export type ScanResponse = {
  libraryId: string
  scanRoot: string
  scannedAt: string
  repos: RepoRecord[]
  error?: string
}
