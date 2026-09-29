import { useEffect, useRef, useState } from "react"

import { useAppearance } from "@/lib/appearance"
import { loadBackdropImage } from "@/lib/backdrop-image-store"
import { readHighlightColor, renderBackdrop } from "@/lib/backdrop-render"

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  }))

  useEffect(() => {
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      // Re-rendering full-resolution effects on every resize frame is wasteful.
      timer = window.setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        })
      }, 150)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return size
}

/**
 * Fixed, full-window background image behind the app shell. The effect is
 * baked into a canvas once per settings/viewport change; fade and per-theme
 * dimming are plain CSS (see `.app-backdrop` in index.css).
 */
export function AppBackdrop() {
  const { image, backdrop } = useAppearance()
  const viewport = useViewportSize()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [loaded, setLoaded] = useState<{ version: number; bitmap: ImageBitmap } | null>(null)
  const [pixelated, setPixelated] = useState(false)

  const imageVersion = image?.updatedAt ?? null
  // A bitmap from a previous image version is never rendered.
  const bitmap = loaded && loaded.version === imageVersion ? loaded.bitmap : null

  useEffect(() => {
    if (imageVersion === null) return
    let cancelled = false
    let decoded: ImageBitmap | null = null
    void (async () => {
      try {
        const blob = await loadBackdropImage()
        if (!blob || cancelled) return
        decoded = await createImageBitmap(blob)
        if (cancelled) {
          decoded.close()
          return
        }
        setLoaded({ version: imageVersion, bitmap: decoded })
      } catch {
        // Missing or undecodable blob: the backdrop simply stays hidden.
      }
    })()
    return () => {
      cancelled = true
      decoded?.close()
    }
  }, [imageVersion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap) return
    const frame = window.requestAnimationFrame(() => {
      try {
        const result = renderBackdrop(canvas, bitmap, viewport, backdrop, readHighlightColor())
        setPixelated(result.pixelated)
      } catch {
        // A bitmap closed by an image swap mid-frame; the next load re-renders.
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [bitmap, viewport, backdrop])

  if (!image) return null

  return (
    <div
      aria-hidden
      className="app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      data-ready={bitmap ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={{ imageRendering: pixelated ? "pixelated" : "auto" }}
      />
      <div className="app-backdrop-dim absolute inset-0 bg-background" />
    </div>
  )
}
