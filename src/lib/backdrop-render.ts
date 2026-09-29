import type { BackdropSettings } from "@/lib/appearance"

export type Rgb = [number, number, number]

export type BackdropColors = {
  /** Duotone ink (the Orbit highlight). */
  highlight: Rgb
  /** Mono ink; light on dark themes, dark on light themes. */
  ink: Rgb
  /**
   * The app background behind the canvas is light. Mono and duotone ink then
   * follows how dark a pixel is (ink on a light page). Color effects are
   * background-independent and only show the page through the fade.
   */
  lightBackground: boolean
}

type Viewport = {
  /** CSS pixels. */
  width: number
  height: number
  devicePixelRatio: number
}

type Placement = {
  x: number
  y: number
  width: number
  height: number
  /** The image is clipped below this canvas row (bottom of the band). */
  clipBottom: number
}

/** Classic 8×8 ordered-dither threshold matrix (values 0–63). */
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
]

/**
 * Color dither levels around the pixel's own color: "lit" and "shadow"
 * pixels, and the paper under halftone dots. Kept opaque so the image reads
 * the same on light and dark pages (like Ceron); only the fade reveals the
 * page. `strength` (0–100) spreads them from a faint texture (0) to a
 * near-black/bright split (100).
 */
function ditherLevels(strength: number): { shadow: number; lit: number } {
  const k = strength / 100
  return { shadow: 1 - 0.85 * k, lit: 1 + 0.3 * k }
}

/** Upper bound for full-resolution effects, keeps renders well under 100ms. */
const MAX_PIXELS = 6_000_000

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Dot/pixel density: contrast against the page background (brightness on a
 * dark page, darkness on a light one). The gamma lifts mid-tones so the
 * image does not fade once gaps show the background.
 */
function tone(r: number, g: number, b: number, lightBackground: boolean): number {
  const l = luminance(r, g, b)
  return Math.pow(lightBackground ? 1 - l : l, 0.8)
}

function threshold(x: number, y: number): number {
  return (BAYER_8[(y & 7) * 8 + (x & 7)] + 0.5) / 64
}

/** Largest device pixel ratio that stays within MAX_PIXELS. */
function effectiveDpr({ width, height, devicePixelRatio }: Viewport): number {
  return Math.min(devicePixelRatio, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)))
}

/**
 * Where the image lands in a `width`×`height` canvas.
 *
 * `width` fit covers a top band (full width × `bandHeight` % of the window),
 * like Ceron: wide windows crop the image at the bottom, narrow windows keep
 * the band height and crop left/right instead of shrinking the image.
 * `cover` fills the whole window. Placement is scale-invariant, so it works
 * at any render resolution.
 */
function place(
  source: ImageBitmap,
  width: number,
  height: number,
  settings: BackdropSettings,
): Placement {
  const focusX = settings.focusX / 100
  const focusY = settings.focusY / 100
  const boxHeight = settings.fit === "width" ? height * (settings.bandHeight / 100) : height
  const scale = Math.max(width / source.width, boxHeight / source.height)
  const scaledWidth = source.width * scale
  const scaledHeight = source.height * scale
  return {
    x: (width - scaledWidth) * focusX,
    y: (boxHeight - scaledHeight) * focusY,
    width: scaledWidth,
    height: scaledHeight,
    clipBottom: boxHeight,
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Per-row opacity: 1 above the fade, easing to 0 at the bottom edge of the
 * visible image across its lower `fade` percent.
 */
function fadeRows(placement: Placement, rows: number, fade: number): Float32Array {
  const top = Math.max(0, placement.y)
  const bottom = Math.min(rows, placement.clipBottom, placement.y + placement.height)
  const length = Math.max(0, bottom - top) * (fade / 100)
  const ramp = new Float32Array(rows)
  for (let row = 0; row < rows; row += 1) {
    const y = row + 0.5
    if (length <= 0 || y <= bottom - length) ramp[row] = 1
    else if (y >= bottom) ramp[row] = 0
    else ramp[row] = smoothstep((bottom - y) / length)
  }
  return ramp
}

function drawPlaced(ctx: CanvasRenderingContext2D, source: ImageBitmap, placement: Placement) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, ctx.canvas.width, placement.clipBottom)
  ctx.clip()
  ctx.drawImage(source, placement.x, placement.y, placement.width, placement.height)
  ctx.restore()
}

function sample(
  source: ImageBitmap,
  width: number,
  height: number,
  settings: BackdropSettings,
): { image: ImageData; placement: Placement } {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Canvas is not available")
  const placement = place(source, width, height, settings)
  ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  drawPlaced(ctx, source, placement)
  ctx.filter = "none"
  return { image: ctx.getImageData(0, 0, width, height), placement }
}

/** Brightens a kept pixel/dot so sparse coverage keeps the image's energy. */
function gainFor(r: number, g: number, b: number, coverage: number): number {
  const peak = Math.max(1, r, g, b)
  return Math.min(255 / peak, 1 / Math.max(0.05, coverage))
}

function grainNoise(x: number, y: number, blockSize: number): number {
  const bx = Math.floor(x / blockSize)
  const by = Math.floor(y / blockSize)
  // Cheap deterministic hash so grain does not shimmer between renders.
  const hash = Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453
  return (hash - Math.floor(hash) - 0.5) * 2 * 42
}

/**
 * Dither, pixelate, grain, and "none" with a mono/duotone palette: one
 * per-pixel pass. Dither and pixelate dissolve the fade into the ordered
 * pattern (pixels drop out, the app background shows through); none and
 * grain fade smoothly.
 */
function processPixels(
  image: ImageData,
  placement: Placement,
  settings: BackdropSettings,
  colors: BackdropColors,
) {
  const { data, width, height } = image
  const ramp = fadeRows(placement, height, settings.fade)
  const { effect, palette } = settings
  const grainBlock = Math.max(1, Math.round(settings.cellSize / 2))
  const levels = ditherLevels(settings.strength)

  for (let y = 0; y < height; y += 1) {
    const rowFade = ramp[y]
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const alpha = (data[i + 3] / 255) * rowFade
      if (alpha <= 0) {
        data[i + 3] = 0
        continue
      }
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      const t = threshold(x, y)

      if (effect === "dither") {
        if (palette === "posterize") {
          // Four levels per channel: the retro, posterized look.
          r = (Math.min(3, Math.floor((r / 255) * 3 + t)) * 255) / 3
          g = (Math.min(3, Math.floor((g / 255) * 3 + t)) * 255) / 3
          b = (Math.min(3, Math.floor((b / 255) * 3 + t)) * 255) / 3
          data[i + 3] = alpha >= t ? 255 : 0
        } else if (palette === "color") {
          // Tone picks a lit or shadow version of the pixel's own color. In
          // the fade, pixels thin out along the pattern and also turn
          // translucent, so the image dissolves softly instead of in steps.
          if (alpha < t * 0.7) {
            data[i + 3] = 0
            continue
          }
          const lit = tone(r, g, b, false) >= t
          const gain = lit ? Math.min(levels.lit, 255 / Math.max(1, r, g, b)) : levels.shadow
          r *= gain
          g *= gain
          b *= gain
          data[i + 3] = alpha * 255
        } else {
          // Ink on the page: tone and fade together decide whether it lands.
          const density = tone(r, g, b, colors.lightBackground) * alpha
          if (density < t) {
            data[i + 3] = 0
            continue
          }
          ;[r, g, b] = palette === "duotone" ? colors.highlight : colors.ink
          data[i + 3] = 255
        }
      } else {
        if (palette === "mono" || palette === "duotone") {
          const l = luminance(r, g, b)
          const light = palette === "duotone" ? colors.highlight : [255, 255, 255]
          r = light[0] * l
          g = light[1] * l
          b = light[2] * l
        }
        if (effect === "grain") {
          const noise = grainNoise(x, y, grainBlock)
          r += noise
          g += noise
          b += noise
        }
        data[i + 3] = effect === "pixelate" && alpha < t * 0.7 ? 0 : alpha * 255
      }
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
  }
}

function renderHalftone(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  viewport: Viewport,
  settings: BackdropSettings,
  colors: BackdropColors,
) {
  const dpr = effectiveDpr(viewport)
  const width = Math.round(viewport.width * dpr)
  const height = Math.round(viewport.height * dpr)
  const cell = (settings.cellSize * 2 + 4) * dpr
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const { image, placement } = sample(source, cols, rows, settings)
  const cells = image.data
  const ramp = fadeRows(placement, rows, settings.fade)

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)

  const maxRadius = cell * 0.62
  const { shadow } = ditherLevels(settings.strength)
  const singleInk = settings.palette === "mono" || settings.palette === "duotone"
  if (singleInk) {
    const ink = settings.palette === "duotone" ? colors.highlight : colors.ink
    ctx.fillStyle = `rgb(${ink.join(",")})`
    ctx.beginPath()
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = (row * cols + col) * 4
      const alpha = (cells[i + 3] / 255) * ramp[row]
      const [r, g, b] = [cells[i], cells[i + 1], cells[i + 2]]
      const cx = col * cell + cell / 2
      const cy = row * cell + cell / 2
      if (singleInk) {
        // Ink on the page: dots shrink with tone and fade.
        const radius = maxRadius * Math.sqrt(tone(r, g, b, colors.lightBackground) * alpha)
        if (radius < 0.4) continue
        ctx.moveTo(cx + radius, cy)
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        continue
      }
      if (alpha <= 0.01) continue
      // Color: shadow paper plus a lit dot, both faded together, so the
      // image reads the same on light and dark pages.
      ctx.globalAlpha = alpha
      ctx.fillStyle = `rgb(${r * shadow},${g * shadow},${b * shadow})`
      const x0 = Math.floor(col * cell)
      const y0 = Math.floor(row * cell)
      ctx.fillRect(x0, y0, Math.ceil((col + 1) * cell) - x0, Math.ceil((row + 1) * cell) - y0)
      const radius = maxRadius * Math.sqrt(tone(r, g, b, false))
      if (radius < 0.4) continue
      // Brighten by the inverse dot coverage so the cell keeps its average
      // brightness; otherwise dark hues on small dots turn to near-black.
      const coverage = (Math.PI * radius * radius) / (cell * cell)
      const gain = gainFor(r, g, b, coverage)
      ctx.fillStyle = `rgb(${r * gain},${g * gain},${b * gain})`
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  if (singleInk) ctx.fill()
}

/** Plain image: GPU-scaled at device resolution, faded via a gradient mask. */
function renderPlain(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  viewport: Viewport,
  settings: BackdropSettings,
) {
  const dpr = effectiveDpr(viewport)
  canvas.width = Math.round(viewport.width * dpr)
  canvas.height = Math.round(viewport.height * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const placement = place(source, canvas.width, canvas.height, settings)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  drawPlaced(ctx, source, placement)
  ctx.filter = "none"

  const bottom = Math.min(canvas.height, placement.clipBottom, placement.y + placement.height)
  const length = (bottom - Math.max(0, placement.y)) * (settings.fade / 100)
  if (length <= 0) return
  const gradient = ctx.createLinearGradient(0, bottom - length, 0, bottom)
  for (let step = 0; step <= 8; step += 1) {
    const t = step / 8
    gradient.addColorStop(t, `rgba(0,0,0,${smoothstep(1 - t)})`)
  }
  // destination-in clears everything outside the filled shape, so the mask
  // must span the whole canvas; the gradient pads opaque above the fade.
  ctx.globalCompositeOperation = "destination-in"
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = "source-over"
}

/**
 * Renders the backdrop image with the configured effect into `canvas`
 * (transparent where the app background should show). Returns whether the
 * canvas should be displayed with `image-rendering: pixelated`.
 */
export function renderBackdrop(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  viewport: Viewport,
  settings: BackdropSettings,
  colors: BackdropColors,
): { pixelated: boolean } {
  if (settings.effect === "halftone") {
    renderHalftone(canvas, source, viewport, settings, colors)
    return { pixelated: false }
  }
  if (
    settings.effect === "none" &&
    (settings.palette === "color" || settings.palette === "posterize")
  ) {
    renderPlain(canvas, source, viewport, settings)
    return { pixelated: false }
  }

  // Dither and pixelate compute one pixel per cell and are scaled up
  // crisply; grain/none work at CSS resolution (4× cheaper on Retina, and
  // the dimmed, faded backdrop does not need more detail).
  const cell =
    settings.effect === "dither"
      ? settings.cellSize
      : settings.effect === "pixelate"
        ? settings.cellSize * 3
        : 1
  const width = Math.max(1, Math.ceil(viewport.width / cell))
  const height = Math.max(1, Math.ceil(viewport.height / cell))
  const { image, placement } = sample(source, width, height, settings)
  processPixels(image, placement, settings, colors)

  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.putImageData(image, 0, 0)
  return { pixelated: cell > 1 }
}
