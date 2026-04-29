import { useEffect, useState } from "react"

import { useOrbit } from "@/components/orbit/orbit-context"
import { validateTinifyKey } from "@/lib/api"
import { ORBIT_APP_VERSION, ORBIT_COPYRIGHT_NOTICE } from "@/lib/orbit-meta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ProjectLibrary } from "@/types/repo"

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
  const [primaryScanRootLabel, setPrimaryScanRootLabel] = useState(
    prefs.primaryScanRootLabel || "Projects",
  )
  const [scanRoot, setScanRoot] = useState(prefs.scanRoot ?? "~/Sites")
  const [additionalScanRoots, setAdditionalScanRoots] = useState<ProjectLibrary[]>(
    prefs.additionalScanRoots,
  )
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
    setPrimaryScanRootLabel(prefs.primaryScanRootLabel || "Projects")
    setScanRoot(prefs.scanRoot ?? "~/Sites")
    setAdditionalScanRoots(prefs.additionalScanRoots)
    setTinifyApiKey(prefs.appSettings.tinify?.apiKey ?? "")
  }, [
    prefs.primaryScanRootLabel,
    prefs.scanRoot,
    prefs.additionalScanRoots,
    prefs.appSettings.tinify?.apiKey,
  ])

  const addAdditionalRoot = () => {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `library-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setAdditionalScanRoots((current) => [
      ...current,
      {
        id,
        label: "",
        path: "",
      },
    ])
  }

  const updateAdditionalRoot = (
    id: string,
    field: "label" | "path",
    value: string,
  ) => {
    setAdditionalScanRoots((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    )
  }

  const removeAdditionalRoot = (id: string) => {
    setAdditionalScanRoots((current) =>
      current.filter((entry) => entry.id !== id),
    )
  }

  const saveSettings = async () => {
    const sanitizedAdditionalRoots = additionalScanRoots
      .map((entry) => ({
        ...entry,
        label: entry.label.trim(),
        path: entry.path.trim(),
      }))
      .filter((entry) => entry.label.length > 0 && entry.path.length > 0)

    try {
      setSaving(true)
      setError(null)
      await saveAllPreferences({
        ...prefs,
        primaryScanRootLabel: primaryScanRootLabel.trim() || "Projects",
        scanRoot: scanRoot.trim() || undefined,
        additionalScanRoots: sanitizedAdditionalRoots,
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
        title="Projects directories"
        description="Set the main projects directory and optional additional libraries."
      >
        <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Main projects name
            </label>
            <Input
              value={primaryScanRootLabel}
              onChange={(event) => setPrimaryScanRootLabel(event.target.value)}
              placeholder="Projects"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Main projects directory
            </label>
            <Input
              value={scanRoot}
              onChange={(event) => setScanRoot(event.target.value)}
              placeholder="~/Sites"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Additional directories
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAdditionalRoot}
              disabled={saving}
            >
              Add directory
            </Button>
          </div>
          {additionalScanRoots.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No additional directories configured.
            </p>
          ) : (
            <div className="space-y-2">
              {additionalScanRoots.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2"
                >
                  <Input
                    value={entry.label}
                    onChange={(event) =>
                      updateAdditionalRoot(entry.id, "label", event.target.value)
                    }
                    placeholder="Label (e.g. Apps)"
                  />
                  <Input
                    value={entry.path}
                    onChange={(event) =>
                      updateAdditionalRoot(entry.id, "path", event.target.value)
                    }
                    placeholder="~/Apps"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeAdditionalRoot(entry.id)}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section
        title="TinyPNG API key"
        description="Stored locally in Orbit preferences on this machine."
        footer={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void validateKey()}
            disabled={saving || validating}
          >
            {validating ? "Validating…" : "Validate key"}
          </Button>
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

      <div className="max-w-3xl flex justify-end">
        <Button
          type="button"
          variant="highlight"
          size="sm"
          onClick={() => void saveSettings()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <Section
        title="Copyright"
      >
        <div className="space-y-2 text-[11px] text-muted-foreground">
          <p>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Version
            </span>{" "}
            <span className="tabular-nums text-foreground">{ORBIT_APP_VERSION}</span>
          </p>
          <p className="text-foreground">{ORBIT_COPYRIGHT_NOTICE}</p>
        </div>
      </Section>
    </div>
  )
}
