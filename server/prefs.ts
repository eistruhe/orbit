import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type RecentEntry = {
  path: string
  lastOpenedAt: string
}

export type Preferences = {
  pinnedPaths: string[]
  recent: RecentEntry[]
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

export type ProjectLibrary = {
  id: string
  label: string
  path: string
}

const CONFIG_DIR = join(homedir(), ".config", "orbit")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")

const defaultPreferences = (): Preferences => ({
  pinnedPaths: [],
  recent: [],
  primaryScanRootLabel: "Projects",
  additionalScanRoots: [],
  repoNotes: {},
  repoTags: {},
  appSettings: {},
})

function parseAdditionalScanRoots(input: unknown): ProjectLibrary[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id.trim() : "",
      label: typeof entry.label === "string" ? entry.label.trim() : "",
      path: typeof entry.path === "string" ? entry.path.trim() : "",
    }))
    .filter((entry) => entry.id.length > 0 && entry.label.length > 0 && entry.path.length > 0)
}

function parseAppSettings(input: unknown): Preferences["appSettings"] {
  if (!input || typeof input !== "object") return {}
  const appSettings = input as { tinify?: unknown; svgo?: unknown }
  const output: Preferences["appSettings"] = {}

  if (appSettings.tinify && typeof appSettings.tinify === "object") {
    const tinify = appSettings.tinify as { apiKey?: unknown }
    const parsedTinify: { apiKey?: string } = {}
    if (typeof tinify.apiKey === "string") {
      parsedTinify.apiKey = tinify.apiKey
    }
    output.tinify = parsedTinify
  }

  if (appSettings.svgo && typeof appSettings.svgo === "object") {
    const svgo = appSettings.svgo as {
      schemaVersion?: unknown
      plugins?: unknown
      multipass?: unknown
      pretty?: unknown
      floatPrecision?: unknown
      transformPrecision?: unknown
    }
    output.svgo = {
      ...(typeof svgo.schemaVersion === "number" &&
      Number.isFinite(svgo.schemaVersion)
        ? { schemaVersion: Math.round(svgo.schemaVersion) }
        : {}),
      ...(svgo.plugins &&
      typeof svgo.plugins === "object" &&
      !Array.isArray(svgo.plugins)
        ? {
            plugins: Object.fromEntries(
              Object.entries(svgo.plugins).filter(
                (entry): entry is [string, boolean] =>
                  typeof entry[0] === "string" &&
                  typeof entry[1] === "boolean",
              ),
            ),
          }
        : {}),
      ...(typeof svgo.multipass === "boolean"
        ? { multipass: svgo.multipass }
        : {}),
      ...(typeof svgo.pretty === "boolean" ? { pretty: svgo.pretty } : {}),
      ...(typeof svgo.floatPrecision === "number" &&
      Number.isFinite(svgo.floatPrecision)
        ? { floatPrecision: svgo.floatPrecision }
        : {}),
      ...(typeof svgo.transformPrecision === "number" &&
      Number.isFinite(svgo.transformPrecision)
        ? { transformPrecision: svgo.transformPrecision }
        : {}),
    }
  }

  return output
}

/**
 * Reads preferences from ~/.config/orbit/config.json.
 */
export async function readPreferences(): Promise<Preferences> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      ...defaultPreferences(),
      ...parsed,
      pinnedPaths: Array.isArray(parsed.pinnedPaths) ? parsed.pinnedPaths : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      primaryScanRootLabel:
        typeof parsed.primaryScanRootLabel === "string" &&
        parsed.primaryScanRootLabel.trim().length > 0
          ? parsed.primaryScanRootLabel.trim()
          : "Projects",
      additionalScanRoots: parseAdditionalScanRoots(parsed.additionalScanRoots),
      repoNotes:
        parsed.repoNotes && typeof parsed.repoNotes === "object"
          ? Object.fromEntries(
              Object.entries(parsed.repoNotes).filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === "string" && typeof entry[1] === "string",
              ),
            )
          : {},
      repoTags:
        parsed.repoTags && typeof parsed.repoTags === "object"
          ? Object.fromEntries(
              Object.entries(parsed.repoTags).map(([path, tags]) => [
                path,
                Array.isArray(tags)
                  ? tags.filter((tag): tag is string => typeof tag === "string")
                  : [],
              ]),
            )
          : {},
      appSettings: parseAppSettings(parsed.appSettings),
    }
  } catch {
    return defaultPreferences()
  }
}

/**
 * Persists preferences, creating the config directory when missing.
 */
export async function writePreferences(prefs: Preferences): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(prefs, null, 2), "utf8")
}
