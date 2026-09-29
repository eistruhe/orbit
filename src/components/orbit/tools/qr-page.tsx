import { Check, Clipboard, Download } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { downloadBlob } from "@/lib/image-encode"

type QrType = "text" | "wifi" | "vcard"
type ErrorLevel = "L" | "M" | "Q" | "H"

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"'])/g, "\\$1")
}

/**
 * QR code generator for URLs/text, Wi-Fi access, and vCards — SVG and PNG
 * export, generated fully locally.
 */
export function QrPage() {
  const [type, setType] = useState<QrType>("text")
  const [text, setText] = useState("")
  const [ssid, setSsid] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [wifiEncryption, setWifiEncryption] = useState<"WPA" | "WEP" | "nopass">(
    "WPA",
  )
  const [vcard, setVcard] = useState({
    name: "",
    org: "",
    phone: "",
    email: "",
    url: "",
  })
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>("M")
  const [size, setSize] = useState(320)
  const [margin, setMargin] = useState(2)
  const [dark, setDark] = useState("#000000")
  const [light, setLight] = useState("#ffffff")
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [svgText, setSvgText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const payload = useMemo(() => {
    switch (type) {
      case "text":
        return text.trim()
      case "wifi": {
        if (!ssid.trim()) return ""
        const auth = wifiEncryption === "nopass" ? "nopass" : wifiEncryption
        const password =
          wifiEncryption === "nopass" ? "" : `P:${escapeWifi(wifiPassword)};`
        return `WIFI:T:${auth};S:${escapeWifi(ssid.trim())};${password};`
      }
      case "vcard": {
        if (!vcard.name.trim()) return ""
        const [first, ...rest] = vcard.name.trim().split(/\s+/)
        const last = rest.join(" ")
        return [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `N:${last};${first};;;`,
          `FN:${vcard.name.trim()}`,
          vcard.org.trim() ? `ORG:${vcard.org.trim()}` : null,
          vcard.phone.trim() ? `TEL;TYPE=CELL:${vcard.phone.trim()}` : null,
          vcard.email.trim() ? `EMAIL:${vcard.email.trim()}` : null,
          vcard.url.trim() ? `URL:${vcard.url.trim()}` : null,
          "END:VCARD",
        ]
          .filter(Boolean)
          .join("\n")
      }
    }
  }, [type, text, ssid, wifiPassword, wifiEncryption, vcard])

  // When payload is empty the preview is hidden via render guards, so stale
  // state can simply stay put until the next generation overwrites it.
  useEffect(() => {
    if (!payload) return
    let cancelled = false
    const options = {
      errorCorrectionLevel: errorLevel,
      margin,
      width: size,
      color: { dark, light },
    }
    void (async () => {
      try {
        const [png, svg] = await Promise.all([
          QRCode.toDataURL(payload, options),
          QRCode.toString(payload, { ...options, type: "svg" }),
        ])
        if (cancelled) return
        setPngUrl(png)
        setSvgText(svg)
        setError(null)
      } catch (cause: unknown) {
        if (cancelled) return
        setPngUrl(null)
        setSvgText(null)
        setError(
          cause instanceof Error ? cause.message : "Could not generate QR code",
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [payload, errorLevel, size, margin, dark, light])

  const downloadPng = () => {
    if (!pngUrl) return
    const base64 = pngUrl.split(",")[1]
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    downloadBlob("qr-code.png", new Blob([bytes], { type: "image/png" }))
  }

  const downloadSvg = () => {
    if (!svgText) return
    downloadBlob(
      "qr-code.svg",
      new Blob([svgText], { type: "image/svg+xml" }),
    )
  }

  const copyPng = async () => {
    if (!pngUrl) return
    const blob = await (await fetch(pngUrl)).blob()
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const colorField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <div className="flex h-8 items-center gap-1.5 border border-border px-1.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-5 cursor-pointer border-0 bg-transparent p-0"
          aria-label={label}
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          {value}
        </span>
      </div>
    </label>
  )

  return (
    <div className="space-y-4">
      <ToolSection
        title="QR code"
        description="Generate QR codes for links, Wi-Fi access, or contact cards — exported as SVG or PNG."
        trailing={
          <SegmentedControl
            options={[
              { value: "text", label: "URL / Text" },
              { value: "wifi", label: "Wi-Fi" },
              { value: "vcard", label: "vCard" },
            ]}
            value={type}
            onValueChange={setType}
          />
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-3">
            {type === "text" ? (
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                placeholder="https://example.com or any text…"
                autoFocus
              />
            ) : null}

            {type === "wifi" ? (
              <div className="space-y-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Network name (SSID)
                  </span>
                  <Input
                    value={ssid}
                    onChange={(event) => setSsid(event.target.value)}
                    autoFocus
                  />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-44 flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Password
                    </span>
                    <Input
                      value={wifiPassword}
                      onChange={(event) => setWifiPassword(event.target.value)}
                      disabled={wifiEncryption === "nopass"}
                      className="font-mono"
                    />
                  </label>
                  <SegmentedControl
                    options={[
                      { value: "WPA", label: "WPA/WPA2" },
                      { value: "WEP", label: "WEP" },
                      { value: "nopass", label: "Open" },
                    ]}
                    value={wifiEncryption}
                    onValueChange={setWifiEncryption}
                  />
                </div>
              </div>
            ) : null}

            {type === "vcard" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["name", "Full name", "text"],
                    ["org", "Company", "text"],
                    ["phone", "Phone", "tel"],
                    ["email", "Email", "email"],
                    ["url", "Website", "url"],
                  ] as const
                ).map(([key, label, inputType]) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {label}
                    </span>
                    <Input
                      type={inputType}
                      value={vcard[key]}
                      onChange={(event) =>
                        setVcard((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Error correction
                </span>
                <SegmentedControl
                  options={(["L", "M", "Q", "H"] as const).map((level) => ({
                    value: level,
                    label: level,
                  }))}
                  value={errorLevel}
                  onValueChange={setErrorLevel}
                />
              </div>
              <div className="flex min-w-36 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Size ·{" "}
                  <span className="font-mono tabular-nums">{size}px</span>
                </span>
                <Slider
                  value={size}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value
                    if (typeof next === "number") setSize(next)
                  }}
                  min={128}
                  max={1024}
                  step={32}
                  aria-label="Size"
                />
              </div>
              <div className="flex min-w-28 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Margin ·{" "}
                  <span className="font-mono tabular-nums">{margin}</span>
                </span>
                <Slider
                  value={margin}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value
                    if (typeof next === "number") setMargin(next)
                  }}
                  min={0}
                  max={8}
                  step={1}
                  aria-label="Margin"
                />
              </div>
              {colorField("Foreground", dark, setDark)}
              {colorField("Background", light, setLight)}
            </div>

            {error ? (
              <p className="text-[11px] text-destructive">{error}</p>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="flex size-56 items-center justify-center border border-border bg-surface-2/40 p-2">
              {payload && pngUrl ? (
                <img
                  src={pngUrl}
                  alt="QR code preview"
                  className="max-h-full max-w-full"
                />
              ) : (
                <span className="px-4 text-center text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Enter content to generate
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!pngUrl}
                onClick={() => void copyPng()}
              >
                {copied ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Clipboard className="size-3 text-muted-foreground" />
                )}
                PNG
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!pngUrl}
                onClick={downloadPng}
              >
                <Download className="size-3 text-muted-foreground" />
                PNG
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!svgText}
                onClick={downloadSvg}
              >
                <Download className="size-3 text-muted-foreground" />
                SVG
              </Button>
            </div>
          </div>
        </div>
      </ToolSection>
    </div>
  )
}
