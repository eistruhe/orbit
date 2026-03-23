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
  scanRoot?: string
}

const CONFIG_DIR = join(homedir(), ".config", "dashboard")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")

const defaultPreferences = (): Preferences => ({
  pinnedPaths: [],
  recent: [],
})

/**
 * Reads preferences from ~/.config/dashboard/config.json.
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
