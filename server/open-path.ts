import { realpath, stat } from "node:fs/promises"
import { basename, relative, resolve } from "node:path"

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
  return resolvePathUnderAllowedRoots(pathStr, [allowedRoot])
}

export async function resolvePathUnderAllowedRoots(
  pathStr: string,
  allowedRoots: string[],
): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new Error("No scan roots are configured")
  }

  const rootReals: string[] = []
  for (const root of allowedRoots) {
    try {
      rootReals.push(await realpath(resolve(root)))
    } catch {
      // Skip missing or inaccessible roots.
    }
  }
  if (rootReals.length === 0) {
    throw new Error("No configured scan roots exist on disk")
  }
  const abs = resolve(pathStr)
  let targetReal: string
  try {
    targetReal = await realpath(abs)
  } catch {
    throw new Error("Path does not exist")
  }

  const sortedRoots = [...new Set(rootReals)].sort((a, b) => b.length - a.length)
  const insideAllowedRoot = sortedRoots.some((rootReal) => {
    const rel = relative(rootReal, targetReal)
    return !(rel.startsWith("..") || rel === "..")
  })
  if (!insideAllowedRoot) {
    throw new Error("Path is outside the configured scan roots")
  }

  const st = await stat(targetReal)
  if (!st.isDirectory()) {
    throw new Error("Path is not a directory")
  }
  return targetReal
}

export type OpenTarget = "finder" | "cursor" | "github" | "browser"

/**
 * Opens a directory in desktop tools on macOS (validated path only).
 */
export async function openLocalPath(
  dir: string,
  target: OpenTarget,
): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Open actions are only supported on macOS")
  }

  if (target === "finder") {
    await execFileAsync("open", [dir], { env: process.env })
    return
  }

  if (target === "cursor") {
    try {
      await execFileAsync("cursor", [dir], { env: process.env })
    } catch {
      await execFileAsync("open", ["-a", "Cursor", dir], { env: process.env })
    }
    return
  }

  if (target === "github") {
    try {
      await execFileAsync("github", [dir], { env: process.env })
    } catch {
      await execFileAsync("open", ["-a", "GitHub Desktop", dir], {
        env: process.env,
      })
    }
    return
  }

  if (target === "browser") {
    const host = basename(dir).trim().toLowerCase()
    if (!host) {
      throw new Error("Could not derive host name from directory path")
    }
    const httpsUrl = `https://${host}.test`
    try {
      await execFileAsync("open", [httpsUrl], { env: process.env })
    } catch {
      const httpUrl = `http://${host}.test`
      await execFileAsync("open", [httpUrl], { env: process.env })
    }
    return
  }
}
