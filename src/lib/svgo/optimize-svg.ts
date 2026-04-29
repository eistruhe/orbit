import { optimize } from "svgo/browser"

import {
  mergeSvgoSettings,
  type SvgoUiSettings,
} from "@/lib/svgo/default-settings"
import { svgoPluginConfig } from "@/lib/svgo/svgo-plugin-config"

export function optimizeSvgString(
  input: string,
  settings: SvgoUiSettings,
): string {
  const normalized = mergeSvgoSettings(settings)
  const plugins: Array<Record<string, unknown>> = []

  for (const plugin of svgoPluginConfig) {
    if (!normalized.plugins[plugin.id]) continue

    plugins.push({
      name: plugin.id,
      params: {
        floatPrecision:
          plugin.id === "cleanupNumericValues" && normalized.floatPrecision === 0
            ? 1
            : normalized.floatPrecision,
        transformPrecision: normalized.transformPrecision,
      },
    })
  }

  const result = optimize(input, {
    multipass: normalized.multipass,
    plugins: plugins as unknown as NonNullable<
      Parameters<typeof optimize>[1]
    >["plugins"],
    js2svg: {
      indent: 2,
      pretty: normalized.pretty,
    },
  })

  if ("error" in result && typeof result.error === "string") {
    throw new Error(result.error)
  }

  return result.data
}
