import { useEffect, useState } from "react"

import { validateTinifyKey } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Preferences } from "@/types/repo"

type SettingsPageProps = {
  prefs: Preferences
  onSave: (next: Preferences) => Promise<void>
}

export function SettingsPage({ prefs, onSave }: SettingsPageProps) {
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
      await onSave({
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
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          App-wide configuration. More settings will be added here over time.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>TinyPNG API key</CardTitle>
          <CardDescription>
            Paste your API key from{" "}
            <a
              href="https://tinypng.com/developers"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              https://tinypng.com/developers
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            type="password"
            value={tinifyApiKey}
            onChange={(event) => {
              setTinifyApiKey(event.target.value)
              setValidationResult(null)
            }}
            placeholder="API key"
          />
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : validationResult ? (
            <div className="space-y-1">
              <p
                className={`text-xs ${validationResult.valid ? "text-emerald-600" : "text-destructive"}`}
              >
                {validationResult.message}
              </p>
              {typeof validationResult.compressionCount === "number" ? (
                <p className="text-xs text-muted-foreground">
                  This month: {validationResult.compressionCount} compressions
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Stored locally in Orbit preferences on this machine.
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void validateKey()}
            disabled={saving || validating}
          >
            {validating ? "Validating..." : "Validate key"}
          </Button>
          <Button type="button" onClick={() => void saveSettings()} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
