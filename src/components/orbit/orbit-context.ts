import { createContext, useContext } from "react"

import type {
  OwnershipFilter,
  ProjectTypeFilter,
  StatusFilter,
} from "@/components/orbit/project-filters"
import type { DevServerInfo, OpenTarget } from "@/lib/api"
import type { Preferences, ProjectLibrary, RepoRecord } from "@/types/repo"

export type OrbitContextValue = {
  prefs: Preferences
  projectLibraries: ProjectLibrary[]
  activeLibraryId: string
  activeLibrary: ProjectLibrary
  repos: RepoRecord[]
  /** Flat list across all scanned libraries. */
  allRepos: RepoRecord[]
  scanRoot: string | null
  scannedAt: string | null
  /** Last successful scan per library id; missing until it was scanned. */
  scanMetaByLibrary: Record<string, { scanRoot: string; scannedAt: string }>
  loadingByLibrary: Record<string, boolean>
  loading: boolean
  error: string | null
  query: string
  ownership: OwnershipFilter
  status: StatusFilter
  stack: string
  projectType: ProjectTypeFilter
  tag: string
  stackOptions: string[]
  tagOptions: string[]
  filtered: RepoRecord[]
  quickResume: RepoRecord[]
  pinnedPathsSet: Set<string>
  pinnedRepos: RepoRecord[]
  recentRepos: RepoRecord[]
  activeThisWeek: number
  stalled: number
  repoByPath: Map<string, RepoRecord>
  repoNotes: Record<string, string>
  repoTags: Record<string, string[]>
  devServers: DevServerInfo[]
  /** Active (starting/running) dev servers keyed by repo path. */
  devServersByPath: Map<string, DevServerInfo>
  refreshDevServers: () => Promise<void>
  setQuery: (value: string) => void
  setOwnership: (value: OwnershipFilter) => void
  setStatus: (value: StatusFilter) => void
  setStack: (value: string) => void
  setProjectType: (value: ProjectTypeFilter) => void
  setTag: (value: string) => void
  /** Resolves true when the scan succeeded. */
  doScan: (libraryId?: string) => Promise<boolean>
  saveAllPreferences: (next: Preferences) => Promise<void>
  togglePin: (path: string) => Promise<void>
  openProject: (path: string) => Promise<void>
  openExternal: (path: string, target: OpenTarget) => Promise<void>
  openRemote: (remoteUrl: string | null) => void
  openMetadataDialog: (path: string) => void
}

export const OrbitContext = createContext<OrbitContextValue | null>(null)

export function useOrbit(): OrbitContextValue {
  const context = useContext(OrbitContext)
  if (!context) {
    throw new Error("useOrbit must be used within OrbitContextProvider")
  }
  return context
}
