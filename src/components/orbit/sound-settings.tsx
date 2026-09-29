import { sounds, type SoundName, type ThemeName } from "cuelume"

import { SegmentedControl, type SegmentedOption } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { Slider } from "@/components/ui/slider"
import {
  previewCue,
  SOUND_THEMES,
  updateSoundSettings,
  useSoundSettings,
  type SoundScope,
} from "@/lib/sound"

const SCOPE_OPTIONS: SegmentedOption<SoundScope>[] = [
  { value: "off", label: "Off" },
  { value: "results", label: "Results", title: "Finished work: dev server ready, batch done, copied, errors" },
  { value: "all", label: "All", title: "Results plus interactions: selecting, toggling, dialogs, navigation" },
]

const THEME_OPTIONS: SegmentedOption<ThemeName>[] = SOUND_THEMES.map((theme) => ({
  value: theme,
  label: theme,
}))

/** Where each cue plays in Orbit, shown under the preview buttons. */
const CUE_USAGE: Record<SoundName, string> = {
  tap: "Primary buttons",
  type: "Not used",
  select: "Filters, segments",
  toggle: "Checkboxes, pins",
  open: "Dialogs, palette",
  close: "Close, confirm delete",
  navigate: "Page changes",
  success: "Done, saved, copied",
  warning: "Partly failed, issues",
  error: "Failed",
  loading: "Slow work started",
  ready: "Dev server, results",
  attention: "Not used",
  count: "Not used",
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * Sound settings: scope, material, volume, and a preview of every cue.
 * Applies instantly and is stored on this machine.
 */
export function SoundSettings() {
  const settings = useSoundSettings()
  const off = settings.scope === "off"

  return (
    <ToolSection
      title="Sound"
      description="Interface sounds via cuelume, synthesized live. Applies instantly and is stored on this machine."
    >
      <div className="space-y-3">
        <FieldRow label="Play">
          <SegmentedControl
            options={SCOPE_OPTIONS}
            value={settings.scope}
            onValueChange={(scope) => updateSoundSettings({ scope })}
            className="w-fit"
          />
        </FieldRow>
        <FieldRow label="Theme">
          <SegmentedControl
            options={THEME_OPTIONS}
            value={settings.theme}
            onValueChange={(theme) => updateSoundSettings({ theme })}
            className="w-fit"
          />
        </FieldRow>
        <FieldRow label="Volume">
          <div className="flex items-center gap-3">
            <Slider
              value={settings.volume}
              min={0}
              max={100}
              step={5}
              disabled={off}
              onValueChange={(next) => {
                const resolved = Array.isArray(next) ? next[0] : next
                if (typeof resolved === "number") updateSoundSettings({ volume: resolved })
              }}
              onValueCommitted={() => previewCue("tap")}
            />
            <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-foreground">
              {settings.volume}%
            </span>
          </div>
        </FieldRow>

        <div className="space-y-2 border-t border-border pt-3">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </span>
          <div className="cell-grid grid grid-cols-2 gap-px border border-border bg-card sm:grid-cols-4 lg:grid-cols-7">
            {sounds.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => previewCue(name)}
                className="flex flex-col items-start gap-0.5 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <span className="text-[11px] uppercase tracking-[0.06em] text-foreground">
                  {name}
                </span>
                <span className="text-[10px] text-muted-foreground">{CUE_USAGE[name]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </ToolSection>
  )
}
