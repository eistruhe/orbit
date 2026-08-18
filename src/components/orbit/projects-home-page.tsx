import { useEffect, useMemo, useRef, useState } from "react"

import { BulkActionsToolbar } from "@/components/orbit/bulk-actions-toolbar"
import { BulkRunDialog, type BulkAction } from "@/components/orbit/bulk-run-dialog"
import { ProjectFilters } from "@/components/orbit/project-filters"
import { ProjectTable } from "@/components/orbit/project-table"
import { QuickResume } from "@/components/orbit/quick-resume"
import { useOrbit } from "@/components/orbit/orbit-context"
import { Separator } from "@/components/ui/separator"

export function ProjectsHomePage() {
  const {
    quickResume,
    loading,
    pinnedPathsSet,
    togglePin,
    openProject,
    openExternal,
    openRemote,
    repoNotes,
    repoTags,
    openMetadataDialog,
    query,
    setQuery,
    ownership,
    setOwnership,
    status,
    setStatus,
    stack,
    stackOptions,
    setStack,
    projectType,
    setProjectType,
    tag,
    tagOptions,
    setTag,
    filtered,
    devServersByPath,
    activeLibraryId,
    doScan,
  } = useOrbit()

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)
  const lastToggledIndexRef = useRef<number | null>(null)

  // Selection is positional (shift ranges follow the visible order), so it
  // resets whenever the visible set could change shape.
  useEffect(() => {
    setSelectedPaths(new Set())
    lastToggledIndexRef.current = null
  }, [query, ownership, status, stack, projectType, tag, activeLibraryId])

  const selectedRepos = useMemo(
    () => filtered.filter((repo) => selectedPaths.has(repo.path)),
    [filtered, selectedPaths],
  )
  const selectedNodeModulesBytes = selectedRepos.reduce(
    (sum, repo) => sum + (repo.nodeModulesBytes ?? 0),
    0,
  )

  const handleToggleSelect = (path: string, index: number, shiftKey: boolean) => {
    // Read at event time: the updater may run deferred, after the ref below
    // has already been overwritten with this click's index.
    const lastIndex = lastToggledIndexRef.current
    lastToggledIndexRef.current = index
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastIndex !== null && lastIndex !== index) {
        const [from, to] = lastIndex < index ? [lastIndex, index] : [index, lastIndex]
        const turnOn = !prev.has(path)
        for (let i = from; i <= to; i += 1) {
          const repo = filtered[i]
          if (!repo) continue
          if (turnOn) {
            next.add(repo.path)
          } else {
            next.delete(repo.path)
          }
        }
      } else if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleToggleSelectAll = () => {
    setSelectedPaths((prev) => {
      const allSelected =
        filtered.length > 0 && filtered.every((repo) => prev.has(repo.path))
      return allSelected ? new Set() : new Set(filtered.map((repo) => repo.path))
    })
    lastToggledIndexRef.current = null
  }

  const handleBulkFinished = (libraryIds: string[]) => {
    for (const libraryId of libraryIds) {
      void doScan(libraryId)
    }
  }

  return (
    <>
      <QuickResume
        repos={quickResume}
        scanLoading={loading}
        pinnedPaths={pinnedPathsSet}
        onTogglePin={togglePin}
        onOpen={openProject}
        onOpenExternal={openExternal}
        onOpenRemote={openRemote}
        repoNotes={repoNotes}
        repoTags={repoTags}
        onEditMetadata={openMetadataDialog}
      />

      <Separator />

      <ProjectFilters
        query={query}
        onQueryChange={setQuery}
        ownership={ownership}
        onOwnershipChange={setOwnership}
        status={status}
        onStatusChange={setStatus}
        stack={stack}
        stackOptions={stackOptions}
        onStackChange={setStack}
        projectType={projectType}
        onProjectTypeChange={setProjectType}
        tag={tag}
        tagOptions={tagOptions}
        onTagChange={setTag}
      />

      <ProjectTable
        repos={filtered}
        pinnedPaths={pinnedPathsSet}
        onTogglePin={togglePin}
        onOpen={openProject}
        onOpenExternal={openExternal}
        onOpenRemote={openRemote}
        repoNotes={repoNotes}
        repoTags={repoTags}
        onEditMetadata={openMetadataDialog}
        devServersByPath={devServersByPath}
        selectedPaths={selectedPaths}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
      />

      <BulkActionsToolbar
        count={selectedRepos.length}
        nodeModulesBytes={selectedNodeModulesBytes}
        onGitFetch={() => setBulkAction("git-fetch")}
        onDeleteNodeModules={() => setBulkAction("delete-node-modules")}
        onClear={() => {
          setSelectedPaths(new Set())
          lastToggledIndexRef.current = null
        }}
      />

      {bulkAction ? (
        <BulkRunDialog
          action={bulkAction}
          repos={
            bulkAction === "delete-node-modules"
              ? selectedRepos.filter((repo) => (repo.nodeModulesBytes ?? 0) > 0)
              : selectedRepos
          }
          onClose={() => setBulkAction(null)}
          onFinished={handleBulkFinished}
        />
      ) : null}
    </>
  )
}
