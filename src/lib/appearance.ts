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
  /** Crop focus in percent (0 = left/top, 100 = right/bottom). */
  focusX: number
  focusY: number
  effect: BackdropEffect
  palette: BackdropPalette
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

export const DEFAULT_APPEARANCE: Appearance = {
  layout: "centered",
  surface: "opaque",
  panelOpacity: 78,
  panelBlur: 16,
  backdrop: {
    fit: "width",
    focusX: 50,
    focusY: 25,
    effect: "dither",
    palette: "color",
    cellSize: 2,
    contrast: 105,
    brightness: 100,
    fade: 50,
    dimLight: 45,
    dimDark: 10,
  },
  image: null,
}

/** Lowest panel opacity allowed, so 11px text stays readable. */
export const MIN_PANEL_OPACITY = 40

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
    layout: pick(raw.layout, ["centered", "left", "full"], d.layout),
    surface: pick(raw.surface, ["opaque", "tinted", "frosted"], d.surface),
    panelOpacity: clampNumber(raw.panelOpacity, MIN_PANEL_OPACITY, 100, d.panelOpacity),
    panelBlur: clampNumber(raw.panelBlur, 0, 40, d.panelBlur),
    backdrop: {
      fit: pick(rawBackdrop.fit, ["width", "cover"], db.fit),
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
