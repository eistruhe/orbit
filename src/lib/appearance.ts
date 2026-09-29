import { useSyncExternalStore } from "react"

const STORAGE_KEY = "orbit.appearance"

export type ContentLayout = "centered" | "left" | "full"
export type SurfaceMode = "opaque" | "tinted" | "frosted"
export type BackdropEffect = "none" | "dither" | "halftone" | "pixelate" | "grain"
export type BackdropPalette = "color" | "posterize" | "mono" | "duotone"
export type BackdropFit = "width" | "cover"

export type BackdropSettings = {
  /** `width`: full width, anchored top (fades out below); `cover`: whole window. */
  fit: BackdropFit
  /** Height of the top band for `width` fit, in percent of the window. */
  bandHeight: number
  /** Crop focus in percent (0 = left/top, 100 = right/bottom). */
  focusX: number
  focusY: number
  effect: BackdropEffect
  palette: BackdropPalette
  /** Dither/halftone contrast between lit and shadow levels, 0–100. */
  strength: number
  /** Effect cell size in CSS px (dither pixel, halftone spacing unit, …). */
  cellSize: number
  /** Percent, 100 = unchanged. */
  contrast: number
  /** Percent, 100 = unchanged. */
  brightness: number
  /** Lower part of the visible image (percent) that fades out. */
  fade: number
  /** Percent of background color laid over the image, per theme. */
  dimLight: number
  dimDark: number
}

export type BackdropImageMeta = {
  name: string
  /** Changes whenever a new image is stored; used to reload the blob. */
  updatedAt: number
}

export type Appearance = {
  /** Accent color as #rrggbb; drives `--highlight` everywhere. */
  accent: string
  layout: ContentLayout
  surface: SurfaceMode
  /** Panel opacity in percent for tinted/frosted surfaces. */
  panelOpacity: number
  /** Backdrop blur in px for frosted surfaces. */
  panelBlur: number
  backdrop: BackdropSettings
  /** The image blob itself lives in IndexedDB (see backdrop-image-store). */
  image: BackdropImageMeta | null
}

export const DEFAULT_ACCENT = "#FF6B1A"

/** Swatches offered in settings; any other hex works via the color picker. */
export const ACCENT_PRESETS = [
  { value: DEFAULT_ACCENT, label: "Orange" },
  { value: "#F5B400", label: "Amber" },
  { value: "#84CC16", label: "Lime" },
  { value: "#10B981", label: "Emerald" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#EC4899", label: "Pink" },
  { value: "#EF4444", label: "Red" },
] as const

export const DEFAULT_APPEARANCE: Appearance = {
  accent: DEFAULT_ACCENT,
  layout: "centered",
  surface: "opaque",
  panelOpacity: 78,
  panelBlur: 16,
  backdrop: {
    fit: "width",
    bandHeight: 65,
    focusX: 50,
    focusY: 25,
    effect: "dither",
    palette: "color",
    strength: 45,
    cellSize: 2,
    contrast: 105,
    brightness: 100,
    fade: 50,
    dimLight: 0,
    dimDark: 10,
  },
  image: null,
}

/** Lowest panel opacity allowed, so 11px text stays readable. */
export const MIN_PANEL_OPACITY = 40

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Parses #rrggbb into channels, or null for anything else. */
export function parseHexColor(value: string): [number, number, number] | null {
  const trimmed = value.trim()
  if (!HEX_COLOR.test(trimmed)) return null
  const n = Number.parseInt(trimmed.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Near-black or white, whichever reads better on `accent`. */
function accentForeground(accent: string): string {
  const [r, g, b] = parseHexColor(accent) ?? [255, 107, 26]
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.62 ? "#111111" : "#ffffff"
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function parseAppearance(input: unknown): Appearance {
  if (!input || typeof input !== "object") return DEFAULT_APPEARANCE
  const raw = input as Partial<Record<keyof Appearance, unknown>>
  const rawBackdrop = (
    raw.backdrop && typeof raw.backdrop === "object" ? raw.backdrop : {}
  ) as Partial<Record<keyof BackdropSettings, unknown>>
  const rawImage = raw.image as Partial<BackdropImageMeta> | null | undefined
  const d = DEFAULT_APPEARANCE
  const db = d.backdrop

  return {
    accent:
      typeof raw.accent === "string" && HEX_COLOR.test(raw.accent)
        ? raw.accent.toUpperCase()
        : d.accent,
    layout: pick(raw.layout, ["centered", "left", "full"], d.layout),
    surface: pick(raw.surface, ["opaque", "tinted", "frosted"], d.surface),
    panelOpacity: clampNumber(raw.panelOpacity, MIN_PANEL_OPACITY, 100, d.panelOpacity),
    panelBlur: clampNumber(raw.panelBlur, 0, 40, d.panelBlur),
    backdrop: {
      fit: pick(rawBackdrop.fit, ["width", "cover"], db.fit),
      bandHeight: clampNumber(rawBackdrop.bandHeight, 30, 100, db.bandHeight),
      focusX: clampNumber(rawBackdrop.focusX, 0, 100, db.focusX),
      focusY: clampNumber(rawBackdrop.focusY, 0, 100, db.focusY),
      effect: pick(
        rawBackdrop.effect,
        ["none", "dither", "halftone", "pixelate", "grain"],
        db.effect,
      ),
      palette: pick(
        rawBackdrop.palette,
        ["color", "posterize", "mono", "duotone"],
        db.palette,
      ),
      strength: clampNumber(rawBackdrop.strength, 0, 100, db.strength),
      cellSize: clampNumber(rawBackdrop.cellSize, 1, 12, db.cellSize),
      contrast: clampNumber(rawBackdrop.contrast, 50, 200, db.contrast),
      brightness: clampNumber(rawBackdrop.brightness, 30, 170, db.brightness),
      fade: clampNumber(rawBackdrop.fade, 0, 100, db.fade),
      dimLight: clampNumber(rawBackdrop.dimLight, 0, 95, db.dimLight),
      dimDark: clampNumber(rawBackdrop.dimDark, 0, 95, db.dimDark),
    },
    image:
      rawImage &&
      typeof rawImage.name === "string" &&
      typeof rawImage.updatedAt === "number"
        ? { name: rawImage.name, updatedAt: rawImage.updatedAt }
        : null,
  }
}

function readAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? parseAppearance(JSON.parse(stored)) : DEFAULT_APPEARANCE
  } catch {
    return DEFAULT_APPEARANCE
  }
}

let snapshot: Appearance = readAppearance()
const listeners = new Set<() => void>()

/**
 * Mirrors layout and surface settings onto <html> so plain CSS (index.css)
 * can react without every component reading the store.
 */
export function applyAppearanceToDocument(appearance: Appearance = snapshot) {
  const root = document.documentElement
  root.dataset.layout = appearance.layout
  root.dataset.surface = appearance.surface
  root.dataset.backdrop = appearance.image ? "image" : "none"
  root.style.setProperty("--highlight", appearance.accent)
  root.style.setProperty("--highlight-foreground", accentForeground(appearance.accent))
  root.style.setProperty(
    "--panel-alpha",
    appearance.surface === "opaque" ? "1" : String(appearance.panelOpacity / 100),
  )
  root.style.setProperty("--panel-blur", `${appearance.panelBlur}px`)
  root.style.setProperty("--backdrop-dim-light", String(appearance.backdrop.dimLight / 100))
  root.style.setProperty("--backdrop-dim-dark", String(appearance.backdrop.dimDark / 100))
}

function write(next: Appearance) {
  snapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable; the in-memory snapshot still applies.
  }
  applyAppearanceToDocument(next)
  for (const listener of listeners) listener()
}

export function updateAppearance(patch: Partial<Omit<Appearance, "backdrop">>) {
  write({ ...snapshot, ...patch })
}

export function updateBackdrop(patch: Partial<BackdropSettings>) {
  write({ ...snapshot, backdrop: { ...snapshot.backdrop, ...patch } })
}

/** Restores all appearance defaults but keeps the stored image. */
export function resetAppearance() {
  write({ ...DEFAULT_APPEARANCE, image: snapshot.image })
}

export function getAppearance(): Appearance {
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

/** Appearance settings stored on this machine, shared across subscribers. */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getSnapshot)
}
