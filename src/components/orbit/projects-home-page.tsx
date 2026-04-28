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
  } = useOrbit()

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
      />
    </>
  )
}
