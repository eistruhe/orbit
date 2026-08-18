import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { join, relative } from "node:path"

const README_NAMES = ["readme.md", "readme.markdown", "readme"]
const MAX_README_BYTES = 500 * 1024

export type ReadmeResult =
  | { ok: true; data: { fileName: string; content: string; truncated: boolean } }
  | { ok: false; status: number; error: string }

/**
 * Reads the repo-root README (case-insensitive), guarding against symlinks
 * that point outside the repository. `repoDir` must already be validated.
 */
export async function readRepoReadme(repoDir: string): Promise<ReadmeResult> {
  let entries: string[]
  try {
    entries = await readdir(repoDir)
  } catch {
    return { ok: false, status: 500, error: "Could not read project directory" }
  }

  const fileName = README_NAMES.map((wanted) =>
    entries.find((entry) => entry.toLowerCase() === wanted),
  ).find(Boolean)
  if (!fileName) {
    return { ok: false, status: 404, error: "No README found" }
  }

  const readmePath = join(repoDir, fileName)
  let realFile: string
  try {
    realFile = await realpath(readmePath)
  } catch {
    return { ok: false, status: 404, error: "No README found" }
  }
  const rel = relative(repoDir, realFile)
  if (rel.startsWith("..")) {
    return { ok: false, status: 400, error: "README resolves outside the repository" }
  }

  try {
    const st = await stat(realFile)
    if (!st.isFile()) {
      return { ok: false, status: 404, error: "No README found" }
    }
    const truncated = st.size > MAX_README_BYTES
    let content = await readFile(realFile, "utf8")
    if (truncated) {
      content = content.slice(0, MAX_README_BYTES)
    }
    return { ok: true, data: { fileName, content, truncated } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 500, error: message }
  }
}
