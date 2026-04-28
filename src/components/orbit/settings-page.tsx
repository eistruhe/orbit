import { useEffect, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { validateTinifyKey } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type SectionProps = {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

function Section({ title, description, children, footer }: SectionProps) {
  return (
    <section className="max-w-3xl border border-border bg-card">
      <header className="flex flex-col gap-1 border-b border-border px-3 py-2">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-foreground">
          [{title}]
        </h3>
        {description ? (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="space-y-3 p-3">{children}</div>
      {footer ? (
        <footer className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

export function SettingsPage() {
  const { prefs, saveAllPreferences } = useOrbit()
  const [tinifyApiKey, setTinifyApiKey] = useState(
    prefs.appSettings.tinify?.apiKey ?? "",
  )
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<{
    message: string
    valid: boolean
    compressionCount?: number
  } | null>(null)

  useEffect(() => {
    setTinifyApiKey(prefs.appSettings.tinify?.apiKey ?? "")
  }, [prefs.appSettings.tinify?.apiKey])

  const saveSettings = async () => {
    try {
      setSaving(true)
      setError(null)
      await saveAllPreferences({
        ...prefs,
        appSettings: {
          ...prefs.appSettings,
          tinify: {
            ...prefs.appSettings.tinify,
            apiKey: tinifyApiKey.trim(),
          },
        },
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save settings",
      )
    } finally {
      setSaving(false)
    }
  }

  const validateKey = async () => {
    const apiKey = tinifyApiKey.trim()
    if (!apiKey) {
      setValidationResult({
        valid: false,
        message: "Paste an API key first.",
      })
      return
    }

    try {
      setValidating(true)
      setError(null)
      const result = await validateTinifyKey(apiKey)
      setValidationResult({
        valid: result.valid,
        message: result.message,
        compressionCount: result.compressionCount,
      })
    } catch (validationError) {
      setValidationResult({
        valid: false,
        message:
          validationError instanceof Error
            ? validationError.message
            : "Could not validate API key.",
      })
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="TinyPNG API key"
        description="Stored locally in Orbit preferences on this machine."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void validateKey()}
              disabled={saving || validating}
            >
              {validating ? "Validating…" : "Validate key"}
            </Button>
            <Button
              type="button"
              variant="highlight"
              size="sm"
              onClick={() => void saveSettings()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            API key
          </label>
          <Input
            type="password"
            value={tinifyApiKey}
            onChange={(event) => {
              setTinifyApiKey(event.target.value)
              setValidationResult(null)
            }}
            placeholder="Paste tinypng api key"
          />
        </div>
        {error ? (
          <p className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : validationResult ? (
          <div
            className={
              validationResult.valid
                ? "border border-success/40 bg-success/10 px-2 py-1 text-[11px] text-success"
                : "border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
            }
          >
            <p>{validationResult.message}</p>
            {typeof validationResult.compressionCount === "number" ? (
              <p className="text-muted-foreground">
                Compressions this month:{" "}
                <span className="tabular-nums text-foreground">
                  {validationResult.compressionCount}/500
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  )
}
