import { Check, Clipboard } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { DropZone } from "@/components/orbit/drop-zone"
import { SegmentedControl } from "@/components/orbit/segmented-control"
import { ToolSection } from "@/components/orbit/tools/tool-section"
import { blobToBase64 } from "@/lib/image-encode"
import { formatBytes } from "@/lib/format-size"

type Mode = "base64" | "url" | "html" | "jwt"

// --- Base64 (unicode-safe) --------------------------------------------------

function textToBase64(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary)
  return urlSafe
    ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : encoded
}

function base64ToText(input: string): string {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/")
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder("utf-8").decode(bytes)
}

// --- HTML entities ----------------------------------------------------------

function encodeHtml(text: string, numericNonAscii: boolean): string {
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
  if (numericNonAscii) {
    out = out.replace(
      /[\u0080-\uffff]/g,
      (char) => `&#${char.codePointAt(0)};`,
    )
  }
  return out
}

function decodeHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, "text/html")
  return doc.documentElement.textContent ?? ""
}

// --- JWT --------------------------------------------------------------------

type JwtInfo = {
  header: unknown
  payload: Record<string, unknown>
  hasSignature: boolean
}

function decodeJwt(token: string): JwtInfo {
  const parts = token.trim().split(".")
  if (parts.length < 2) throw new Error("A JWT has at least two dot-separated parts.")
  const header = JSON.parse(base64ToText(parts[0])) as unknown
  const payload = JSON.parse(base64ToText(parts[1])) as Record<string, unknown>
  return { header, payload, hasSignature: parts.length === 3 && parts[2].length > 0 }
}

function jwtTimeRow(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value !== "number") return null
  const date = new Date(value * 1000)
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000)
  const relative =
    key === "exp"
      ? diffMinutes >= 0
        ? ` — expires in ${diffMinutes} min`
        : ` — expired ${-diffMinutes} min ago`
      : ""
  return `${date.toISOString()}${relative}`
}

type FileResult = {
  name: string
  size: number
  base64: string
  dataUri: string
}

/**
 * Encoder/decoder for Base64 (text and files), URL escaping, HTML entities,
 * and JWT inspection — everything runs locally.
 */
export function EncodePage() {
  const [mode, setMode] = useState<Mode>("base64")
  const [plain, setPlain] = useState("")
  const [encoded, setEncoded] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [urlSafe, setUrlSafe] = useState(false)
  const [fullUrl, setFullUrl] = useState(false)
  const [numericEntities, setNumericEntities] = useState(false)
  const [jwtInput, setJwtInput] = useState("")
  const [fileResult, setFileResult] = useState<FileResult | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const encodeWith = (
    text: string,
    options: { urlSafe: boolean; fullUrl: boolean; numericEntities: boolean },
  ): string => {
    switch (mode) {
      case "base64":
        return textToBase64(text, options.urlSafe)
      case "url":
        return options.fullUrl ? encodeURI(text) : encodeURIComponent(text)
      case "html":
        return encodeHtml(text, options.numericEntities)
      default:
        return text
    }
  }

  const encode = (text: string): string =>
    encodeWith(text, { urlSafe, fullUrl, numericEntities })

  // Re-encode the current plain text when an option toggles.
  const applyOption = (
    patch: Partial<{
      urlSafe: boolean
      fullUrl: boolean
      numericEntities: boolean
    }>,
  ) => {
    const next = { urlSafe, fullUrl, numericEntities, ...patch }
    if (patch.urlSafe !== undefined) setUrlSafe(patch.urlSafe)
    if (patch.fullUrl !== undefined) setFullUrl(patch.fullUrl)
    if (patch.numericEntities !== undefined)
      setNumericEntities(patch.numericEntities)
    try {
      setEncoded(encodeWith(plain, next))
      setError(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not encode")
    }
  }

  const decode = (text: string): string => {
    switch (mode) {
      case "base64":
        return base64ToText(text)
      case "url":
        return decodeURIComponent(text)
      case "html":
        return decodeHtml(text)
      default:
        return text
    }
  }

  const onPlainChange = (value: string) => {
    setPlain(value)
    setError(null)
    try {
      setEncoded(encode(value))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not encode")
    }
  }

  const onEncodedChange = (value: string) => {
    setEncoded(value)
    setError(null)
    try {
      setPlain(decode(value))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not decode")
    }
  }

  const selectMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPlain("")
    setEncoded("")
    setFileResult(null)
  }

  const copy = (id: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedId(id)
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1200,
      )
    })
  }

  const handleFile = async (files: FileList) => {
    const file = files[0]
    if (!file) return
    const base64 = await blobToBase64(file)
    const mime = file.type || "application/octet-stream"
    setFileResult({
      name: file.name,
      size: file.size,
      base64,
      dataUri: `data:${mime};base64,${base64}`,
    })
  }

  const jwt = useMemo(() => {
    const trimmed = jwtInput.trim()
    if (!trimmed) return null
    try {
      return { info: decodeJwt(trimmed) }
    } catch (cause: unknown) {
      return {
        parseError:
          cause instanceof Error ? cause.message : "Could not decode token",
      }
    }
  }, [jwtInput])

  const copyButton = (id: string, value: string, label: string) => (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={!value}
      onClick={() => copy(id, value)}
    >
      {copiedId === id ? (
        <Check className="size-3 text-success" />
      ) : (
        <Clipboard className="size-3 text-muted-foreground" />
      )}
      {label}
    </Button>
  )

  return (
    <div className="max-w-4xl space-y-4">
      <ToolSection
        title="Encoder / decoder"
        description="Base64, URL escaping, HTML entities, and JWT inspection — nothing leaves your machine."
        trailing={
          <SegmentedControl
            options={[
              { value: "base64", label: "Base64" },
              { value: "url", label: "URL" },
              { value: "html", label: "HTML" },
              { value: "jwt", label: "JWT" },
            ]}
            value={mode}
            onValueChange={selectMode}
          />
        }
      >
        {mode !== "jwt" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {mode === "base64" ? (
                <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
                  <Checkbox
                    checked={urlSafe}
                    onCheckedChange={(checked) =>
                      applyOption({ urlSafe: checked === true })
                    }
                    aria-label="URL-safe alphabet"
                  />
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    URL-safe
                  </span>
                </label>
              ) : null}
              {mode === "url" ? (
                <SegmentedControl
                  options={[
                    { value: "component", label: "Component" },
                    { value: "full", label: "Full URI" },
                  ]}
                  value={fullUrl ? "full" : "component"}
                  onValueChange={(value) =>
                    applyOption({ fullUrl: value === "full" })
                  }
                />
              ) : null}
              {mode === "html" ? (
                <label className="flex h-8 cursor-pointer items-center gap-2 border border-border px-2.5">
                  <Checkbox
                    checked={numericEntities}
                    onCheckedChange={(checked) =>
                      applyOption({ numericEntities: checked === true })
                    }
                    aria-label="Encode non-ASCII numerically"
                  />
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Encode non-ASCII
                  </span>
                </label>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Plain
                  {copyButton("plain", plain, "Copy")}
                </span>
                <Textarea
                  value={plain}
                  onChange={(event) => onPlainChange(event.target.value)}
                  rows={8}
                  placeholder="Type or paste plain text…"
                  spellCheck={false}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Encoded
                  {copyButton("encoded", encoded, "Copy")}
                </span>
                <Textarea
                  value={encoded}
                  onChange={(event) => onEncodedChange(event.target.value)}
                  rows={8}
                  placeholder="…or paste encoded text to decode"
                  spellCheck={false}
                />
              </label>
            </div>

            {error ? (
              <p className="text-[11px] text-destructive">{error}</p>
            ) : null}

            {mode === "base64" ? (
              <>
                <DropZone
                  label="Drop a file to Base64-encode it"
                  hint="Any file type — large files can freeze the tab"
                  onFiles={(files) => void handleFile(files)}
                />
                {fileResult ? (
                  <div className="space-y-2 border border-border bg-surface-2/40 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                        {fileResult.name}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {formatBytes(fileResult.size)} →{" "}
                        {formatBytes(fileResult.base64.length)}
                      </span>
                      {copyButton("file-b64", fileResult.base64, "Copy Base64")}
                      {copyButton("file-uri", fileResult.dataUri, "Copy data URI")}
                    </div>
                    {fileResult.size > 2 * 1024 * 1024 ? (
                      <p className="text-[10px] text-highlight">
                        Large file — embedding this as a data URI is rarely a
                        good idea.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={jwtInput}
              onChange={(event) => setJwtInput(event.target.value)}
              rows={4}
              placeholder="Paste a JWT (header.payload.signature)…"
              spellCheck={false}
              className="break-all"
            />
            {jwt && "parseError" in jwt ? (
              <p className="text-[11px] text-destructive">{jwt.parseError}</p>
            ) : jwt ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  {(["header", "payload"] as const).map((part) => (
                    <div key={part} className="flex flex-col gap-1">
                      <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {part}
                        {copyButton(
                          part,
                          JSON.stringify(jwt.info[part], null, 2),
                          "Copy",
                        )}
                      </span>
                      <pre className="overflow-x-auto border border-border bg-surface-2/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                        {JSON.stringify(jwt.info[part], null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {(["iat", "nbf", "exp"] as const).map((key) => {
                    const row = jwtTimeRow(jwt.info.payload, key)
                    return row ? (
                      <p key={key} className="font-mono text-[11px] text-muted-foreground">
                        <span className="uppercase text-muted-foreground/70">
                          {key}
                        </span>{" "}
                        {row}
                      </p>
                    ) : null
                  })}
                </div>
                <p className="text-[10px] text-highlight">
                  The signature is NOT verified — this tool only decodes the
                  token contents.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </ToolSection>
    </div>
  )
}
