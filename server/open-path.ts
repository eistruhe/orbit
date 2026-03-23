import { realpath, stat } from "node:fs/promises"
import { relative, resolve } from "node:path"

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Resolves the path and ensures it exists and lies under `allowedRoot` (after realpath).
 */
export async function resolvePathUnderRoot(
  pathStr: string,
  allowedRoot: string,
): Promise<string> {
  const rootReal = await realpath(resolve(allowedRoot))
  const abs = resolve(pathStr)
  let targetReal: string
  try {
    targetReal = await realpath(abs)
  } catch {
    throw new Error("Path does not exist")
  }
  const rel = relative(rootReal, targetReal)
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("Path is outside the configured scan root")
  }
  const st = await stat(targetReal)
  if (!st.isDirectory()) {
    throw new Error("Path is not a directory")
  }
  return targetReal
}

export type OpenTarget = "finder" | "cursor"

/**
 * Opens a directory in Finder or Cursor on macOS (validated path only).
 */
export async function openLocalPath(
  dir: string,
  target: OpenTarget,
): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Open in Finder/Cursor is only supported on macOS")
  }

  if (target === "finder") {
    await execFileAsync("open", [dir], { env: process.env })
    return
  }

  try {
    await execFileAsync("cursor", [dir], { env: process.env })
  } catch {
    await execFileAsync("open", ["-a", "Cursor", dir], { env: process.env })
  }
}
