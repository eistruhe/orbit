import {
  svgoPluginConfig,
  type SvgoPluginId,
} from "@/lib/svgo/svgo-plugin-config"

export const SVGO_SETTINGS_SCHEMA_VERSION = 1 as const

export type SvgoUiSettings = {
  schemaVersion: number
  plugins: Record<SvgoPluginId, boolean>
  multipass: boolean
  pretty: boolean
  floatPrecision: number
  transformPrecision: number
}

export function createDefaultSvgoSettings(): SvgoUiSettings {
  const plugins = Object.fromEntries(
    svgoPluginConfig.map((plugin) => [plugin.id, plugin.enabledByDefault]),
  ) as Record<SvgoPluginId, boolean>

  return {
    schemaVersion: SVGO_SETTINGS_SCHEMA_VERSION,
    plugins,
    multipass: false,
    pretty: false,
    floatPrecision: 3,
    transformPrecision: 5,
  }
}

function normalizePrecision(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  const normalized = Math.round(value)
  if (normalized < 0) return 0
  if (normalized > 8) return 8
  return normalized
}

export function mergeSvgoSettings(input: unknown): SvgoUiSettings {
  const defaults = createDefaultSvgoSettings()
  if (!input || typeof input !== "object") return defaults
  const parsed = input as Partial<SvgoUiSettings> & {
    plugins?: Record<string, unknown>
  }

  const mergedPlugins = { ...defaults.plugins }
  for (const plugin of svgoPluginConfig) {
    const rawValue = parsed.plugins?.[plugin.id]
    if (typeof rawValue === "boolean") {
      mergedPlugins[plugin.id] = rawValue
    }
  }

  return {
    schemaVersion:
      typeof parsed.schemaVersion === "number" && parsed.schemaVersion > 0
        ? Math.round(parsed.schemaVersion)
        : defaults.schemaVersion,
    plugins: mergedPlugins,
    multipass:
      typeof parsed.multipass === "boolean"
        ? parsed.multipass
        : defaults.multipass,
    pretty: typeof parsed.pretty === "boolean" ? parsed.pretty : defaults.pretty,
    floatPrecision: normalizePrecision(
      parsed.floatPrecision,
      defaults.floatPrecision,
    ),
    transformPrecision: normalizePrecision(
      parsed.transformPrecision,
      defaults.transformPrecision,
    ),
  }
}
