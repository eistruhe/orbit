import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

import { fetchWithTimeout, mapLimit } from "./util.ts"

const REGISTRY_TIMEOUT_MS = 8_000
const REGISTRY_CONCURRENCY = 8
const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_PROJECTS = 100

export type DiffLevel = "major" | "minor" | "patch" | "none" | "unknown"

export type DepInfo = {
  name: string
  range: string
  latest: string | null
  diff: DiffLevel
  dev: boolean
}

export type ProjectAudit = {
  path: string
  name: string
  error: string | null
  packages: DepInfo[]
  counts: { total: number; outdated: number; major: number }
}

export type DepsResult =
  | { ok: true; data: { projects: ProjectAudit[] } }
  | { ok: false; status: number; error: string }

/** dist-tags cache shared across requests; also caches lookup failures. */
const latestCache = new Map<string, { latest: string | null; at: number }>()

function isSkippableRange(range: string): boolean {
  return (
    range.startsWith("workspace:") ||
    range.startsWith("catalog:") ||
    range.startsWith("file:") ||
    range.startsWith("link:") ||
    range.startsWith("git") ||
    range.startsWith("http") ||
    range.startsWith("npm:")
  )
}

function parseVersion(text: string): [number, number, number] | null {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function diffLevel(range: string, latest: string | null): DiffLevel {
  if (!latest) return "unknown"
  const current = parseVersion(range)
  const next = parseVersion(latest)
  if (!current || !next) return "unknown"
  if (next[0] > current[0]) return "major"
  if (next[0] === current[0] && next[1] > current[1]) return "minor"
  if (next[0] === current[0] && next[1] === current[1] && next[2] > current[2])
    return "patch"
  return "none"
}

async function fetchLatest(name: string): Promise<string | null> {
  const cached = latestCache.get(name)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.latest
  let latest: string | null = null
  try {
    const res = await fetchWithTimeout(
      `https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`,
      REGISTRY_TIMEOUT_MS,
      { headers: { accept: "application/vnd.npm.install-v1+json" } },
    )
    if (res.ok) {
      const body = (await res.json()) as {
        "dist-tags"?: Record<string, string>
      }
      latest = body["dist-tags"]?.latest ?? null
    }
  } catch {
    latest = null
  }
  latestCache.set(name, { latest, at: Date.now() })
  return latest
}

type PackageJson = {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function readPackageJson(repoPath: string): Promise<PackageJson | null> {
  try {
    const content = await readFile(join(repoPath, "package.json"), "utf8")
    const parsed = JSON.parse(content) as unknown
    return parsed && typeof parsed === "object" ? (parsed as PackageJson) : null
  } catch {
    return null
  }
}

export async function auditProjects(paths: string[]): Promise<DepsResult> {
  if (paths.length === 0) {
    return { ok: false, status: 400, error: "No project paths given." }
  }
  if (paths.length > MAX_PROJECTS) {
    return {
      ok: false,
      status: 400,
      error: `Too many projects — limit is ${MAX_PROJECTS}.`,
    }
  }

  type PendingProject = {
    path: string
    name: string
    error: string | null
    deps: { name: string; range: string; dev: boolean }[]
  }

  const pending: PendingProject[] = []
  for (const path of paths) {
    const pkg = await readPackageJson(path)
    if (!pkg) {
      pending.push({
        path,
        name: basename(path),
        error: "No readable package.json",
        deps: [],
      })
      continue
    }
    const deps = [
      ...Object.entries(pkg.dependencies ?? {}).map(([name, range]) => ({
        name,
        range,
        dev: false,
      })),
      ...Object.entries(pkg.devDependencies ?? {}).map(([name, range]) => ({
        name,
        range,
        dev: true,
      })),
    ]
    pending.push({ path, name: pkg.name ?? basename(path), error: null, deps })
  }

  // One registry request per unique package across all projects.
  const uniqueNames = [
    ...new Set(
      pending.flatMap((project) =>
        project.deps
          .filter((dep) => !isSkippableRange(dep.range))
          .map((dep) => dep.name),
      ),
    ),
  ]
  const latestByName = new Map<string, string | null>()
  await mapLimit(uniqueNames, REGISTRY_CONCURRENCY, async (name) => {
    latestByName.set(name, await fetchLatest(name))
  })

  const projects: ProjectAudit[] = pending.map((project) => {
    const packages: DepInfo[] = project.deps.map((dep) => {
      const latest = isSkippableRange(dep.range)
        ? null
        : (latestByName.get(dep.name) ?? null)
      return {
        name: dep.name,
        range: dep.range,
        latest,
        diff: isSkippableRange(dep.range)
          ? "unknown"
          : diffLevel(dep.range, latest),
        dev: dep.dev,
      }
    })
    const outdated = packages.filter(
      (entry) =>
        entry.diff === "major" ||
        entry.diff === "minor" ||
        entry.diff === "patch",
    ).length
    const major = packages.filter((entry) => entry.diff === "major").length
    return {
      path: project.path,
      name: project.name,
      error: project.error,
      packages,
      counts: { total: packages.length, outdated, major },
    }
  })

  return { ok: true, data: { projects } }
}
