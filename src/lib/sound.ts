import {
  play,
  setTheme,
  setVolume,
  themes,
  type PlayOptions,
  type SoundName,
  type ThemeName,
} from "cuelume"
import { useSyncExternalStore } from "react"

const STORAGE_KEY = "orbit.sound"

/**
 * `results`: outcomes of work (dev server ready, batch done, copied, errors).
 * `all`: additionally interactions (selecting, toggling, dialogs, routes).
 */
export type SoundScope = "off" | "results" | "all"

export type SoundSettings = {
  scope: SoundScope
  theme: ThemeName
  /** Percent, 0–100. */
  volume: number
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  scope: "results",
  theme: "default",
  volume: 60,
}

export const SOUND_THEMES = themes

function parseSettings(input: unknown): SoundSettings {
  if (!input || typeof input !== "object") return DEFAULT_SOUND_SETTINGS
  const raw = input as Partial<Record<keyof SoundSettings, unknown>>
  const d = DEFAULT_SOUND_SETTINGS
  return {
    scope:
      raw.scope === "off" || raw.scope === "results" || raw.scope === "all"
        ? raw.scope
        : d.scope,
    theme:
      typeof raw.theme === "string" && (themes as readonly string[]).includes(raw.theme)
        ? (raw.theme as ThemeName)
        : d.theme,
    volume:
      typeof raw.volume === "number" && Number.isFinite(raw.volume)
        ? Math.min(100, Math.max(0, raw.volume))
        : d.volume,
  }
}

function readSettings(): SoundSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? parseSettings(JSON.parse(stored)) : DEFAULT_SOUND_SETTINGS
  } catch {
    return DEFAULT_SOUND_SETTINGS
  }
}

let snapshot: SoundSettings = readSettings()
const listeners = new Set<() => void>()

function applyToEngine(settings: SoundSettings) {
  setTheme(settings.theme)
  setVolume(settings.volume / 100)
}

applyToEngine(snapshot)

export function updateSoundSettings(patch: Partial<SoundSettings>) {
  snapshot = { ...snapshot, ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage can be unavailable; the in-memory snapshot still applies.
  }
  applyToEngine(snapshot)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Plays an outcome cue (work finished, failed, needs a look). Silent only
 * when sound is off.
 */
export function cue(name: SoundName, options?: PlayOptions) {
  if (snapshot.scope === "off") return
  play(name, options)
}

/** Plays an interaction cue from code; only with scope `all`. */
export function interactionCue(name: SoundName, options?: PlayOptions) {
  if (snapshot.scope !== "all") return
  play(name, options)
}

/** Plays a cue regardless of scope, for the preview in settings. */
export function previewCue(name: SoundName, options?: PlayOptions) {
  play(name, options)
}

/**
 * One cue for the end of a batch: success when everything worked, warning
 * when some items failed, error when all failed. Nothing for an empty batch.
 */
export function batchCue(total: number, failed: number, options?: PlayOptions) {
  if (total === 0) return
  if (failed === 0) cue("success", options)
  else if (failed < total) cue("warning", options)
  else cue("error", options)
}

export type CueBinding = "tap" | "select" | "toggle" | "open" | "close" | "navigate"

/**
 * Declarative interaction sounds. cuelume's `bind()` listeners cannot be
 * removed, so instead the `data-cuelume-*` attributes are only rendered while
 * the scope is `all`:
 *
 *   const cueAttrs = useCueAttrs()
 *   <button {...cueAttrs("select")}>
 */
export function useCueAttrs() {
  const { scope } = useSoundSettings()
  const enabled = scope === "all"
  return (binding: CueBinding, cueName?: SoundName): Record<string, string> =>
    enabled ? { [`data-cuelume-${binding}`]: cueName ?? "" } : {}
}

let clipboardPatched = false

/**
 * Plays a subtle success after every successful clipboard write, so the
 * copy buttons across all tools confirm themselves without each page
 * wiring a cue. Failures reject exactly as before and stay silent.
 */
export function installClipboardCue() {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined
  if (clipboardPatched || !clipboard?.writeText) return
  clipboardPatched = true
  const writeText = clipboard.writeText.bind(clipboard)
  clipboard.writeText = async (text: string) => {
    await writeText(text)
    cue("success", { emphasis: "subtle" })
  }
  if (clipboard.write) {
    // Image copies (QR code, crop result).
    const write = clipboard.write.bind(clipboard)
    clipboard.write = async (items: ClipboardItems) => {
      await write(items)
      cue("success", { emphasis: "subtle" })
    }
  }
}
