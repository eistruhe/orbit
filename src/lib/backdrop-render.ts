import type { BackdropSettings } from "@/lib/appearance"

type Rgb = [number, number, number]

type Viewport = {
  /** CSS pixels. */
  width: number
  height: number
  devicePixelRatio: number
}

/** Classic 8×8 ordered-dither threshold matrix (values 0–63). */
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
]

const INK_DARK: Rgb = [8, 8, 8]
const INK_LIGHT: Rgb = [236, 236, 236]

/** Upper bound for full-resolution effects, keeps renders well under 100ms. */
const MAX_PIXELS = 6_000_000

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function paletteColors(palette: BackdropSettings["palette"], highlight: Rgb): [Rgb, Rgb] {
  return [INK_DARK, palette === "duotone" ? highlight : INK_LIGHT]
}

/** Largest device pixel ratio that stays within MAX_PIXELS. */
function effectiveDpr({ width, height, devicePixelRatio }: Viewport): number {
  return Math.min(devicePixelRatio, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)))
}

/**
 * Draws `source` into a `width`×`height` context with object-fit: cover
 * cropping, applying brightness and contrast on the way.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap,
  width: number,
  height: number,
  settings: BackdropSettings,
) {
  const scale = Math.max(width / source.width, height / source.height)
  const cropWidth = width / scale
  const cropHeight = height / scale
  ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(
    source,
    (source.width - cropWidth) / 2,
    (source.height - cropHeight) / 2,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height,
  )
  ctx.filter = "none"
}

function sample(
  source: ImageBitmap,
  width: number,
  height: number,
  settings: BackdropSettings,
): ImageData {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Canvas is not available")
  drawCover(ctx, source, width, height, settings)
  return ctx.getImageData(0, 0, width, height)
}

/** Maps pixels to grayscale (mono) or a dark → accent ramp (duotone). */
function applyPalette(image: ImageData, settings: BackdropSettings, highlight: Rgb) {
  if (settings.palette === "color") return
  const [dark, light] = paletteColors(settings.palette, highlight)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2])
    data[i] = dark[0] + (light[0] - dark[0]) * l
    data[i + 1] = dark[1] + (light[1] - dark[1]) * l
    data[i + 2] = dark[2] + (light[2] - dark[2]) * l
  }
}

function dither(image: ImageData, settings: BackdropSettings, highlight: Rgb) {
  const { data, width } = image
  if (settings.palette === "color") {
    // Four levels per channel keeps the image's hues while showing the pattern.
    const steps = 3
    for (let i = 0; i < data.length; i += 4) {
      const px = (i / 4) % width
      const py = Math.floor(i / 4 / width)
      const threshold = (BAYER_8[(py & 7) * 8 + (px & 7)] + 0.5) / 64
      for (let c = 0; c < 3; c += 1) {
        const level = Math.min(steps, Math.floor((data[i + c] / 255) * steps + threshold))
        data[i + c] = (level * 255) / steps
      }
    }
    return
  }

  const [dark, light] = paletteColors(settings.palette, highlight)
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % width
    const py = Math.floor(i / 4 / width)
    const threshold = (BAYER_8[(py & 7) * 8 + (px & 7)] + 0.5) / 64
    const ink = luminance(data[i], data[i + 1], data[i + 2]) >= threshold ? light : dark
    data[i] = ink[0]
    data[i + 1] = ink[1]
    data[i + 2] = ink[2]
  }
}

function grain(image: ImageData, blockSize: number) {
  const { data, width } = image
  const amplitude = 42
  for (let i = 0; i < data.length; i += 4) {
    const bx = Math.floor(((i / 4) % width) / blockSize)
    const by = Math.floor(i / 4 / width / blockSize)
    // Cheap deterministic hash so grain does not shimmer between renders.
    const hash = Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453
    const noise = (hash - Math.floor(hash) - 0.5) * 2 * amplitude
    data[i] += noise
    data[i + 1] += noise
    data[i + 2] += noise
  }
}

function renderHalftone(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  viewport: Viewport,
  settings: BackdropSettings,
  highlight: Rgb,
) {
  const dpr = effectiveDpr(viewport)
  const width = Math.round(viewport.width * dpr)
  const height = Math.round(viewport.height * dpr)
  const cell = (settings.cellSize * 2 + 4) * dpr
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const cells = sample(source, cols, rows, settings).data

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.fillStyle = `rgb(${INK_DARK.join(",")})`
  ctx.fillRect(0, 0, width, height)

  const maxRadius = cell * 0.62
  const [, light] = paletteColors(settings.palette, highlight)
  const singleInk = settings.palette !== "color"
  if (singleInk) {
    ctx.fillStyle = `rgb(${light.join(",")})`
    ctx.beginPath()
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = (row * cols + col) * 4
      const l = luminance(cells[i], cells[i + 1], cells[i + 2])
      const radius = maxRadius * Math.sqrt(l)
      if (radius < 0.4) continue
      const cx = col * cell + cell / 2
      const cy = row * cell + cell / 2
      if (singleInk) {
        ctx.moveTo(cx + radius, cy)
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      } else {
        // Brighten by the inverse dot coverage so the cell keeps its average
        // brightness; otherwise dark hues on small dots turn to near-black.
        const coverage = (Math.PI * radius * radius) / (cell * cell)
        const peak = Math.max(1, cells[i], cells[i + 1], cells[i + 2])
        const gain = Math.min(1 / coverage, 255 / peak)
        ctx.fillStyle = `rgb(${cells[i] * gain},${cells[i + 1] * gain},${cells[i + 2] * gain})`
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  if (singleInk) ctx.fill()
}

/**
 * Renders the backdrop image with the configured effect into `canvas`,
 * sized to cover the viewport. Returns whether the canvas should be shown
 * with `image-rendering: pixelated` (low-res effects scaled up crisply).
 */
export function renderBackdrop(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  viewport: Viewport,
  settings: BackdropSettings,
  highlight: Rgb,
): { pixelated: boolean } {
  if (settings.effect === "halftone") {
    renderHalftone(canvas, source, viewport, settings, highlight)
    return { pixelated: false }
  }

  if (settings.effect === "none" && settings.palette === "color") {
    // No per-pixel work: let the GPU scale at full device resolution.
    const dpr = effectiveDpr(viewport)
    canvas.width = Math.round(viewport.width * dpr)
    canvas.height = Math.round(viewport.height * dpr)
    const ctx = canvas.getContext("2d")
    if (ctx) drawCover(ctx, source, canvas.width, canvas.height, settings)
    return { pixelated: false }
  }

  let width: number
  let height: number
  let pixelated = false
  if (settings.effect === "dither") {
    width = Math.ceil(viewport.width / settings.cellSize)
    height = Math.ceil(viewport.height / settings.cellSize)
    pixelated = true
  } else if (settings.effect === "pixelate") {
    const block = settings.cellSize * 3
    width = Math.ceil(viewport.width / block)
    height = Math.ceil(viewport.height / block)
    pixelated = true
  } else {
    // Per-pixel passes (palette, grain) at CSS resolution: 4× cheaper on
    // Retina, and the dimmed, faded backdrop does not need more detail.
    width = Math.round(viewport.width)
    height = Math.round(viewport.height)
  }

  const image = sample(source, Math.max(1, width), Math.max(1, height), settings)
  if (settings.effect === "dither") {
    dither(image, settings, highlight)
  } else {
    applyPalette(image, settings, highlight)
    if (settings.effect === "grain") {
      grain(image, Math.max(1, Math.round(settings.cellSize / 2)))
    }
  }

  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext("2d")?.putImageData(image, 0, 0)
  return { pixelated }
}

/** Reads `--highlight` (hex) from the document, falling back to Orbit orange. */
export function readHighlightColor(): Rgb {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--highlight")
    .trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(value)
  if (!match) return [255, 107, 26]
  const n = Number.parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
