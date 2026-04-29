import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import {
  app,
  autoUpdater as nativeAutoUpdater,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from "electron"
import electronUpdaterModule from "electron-updater"

/** CommonJS interop for ESM: use default export package object. */
const { autoUpdater } = electronUpdaterModule

/** Leave 8788 for `bun run dev`; Electron uses a dedicated default. */
const API_PORT = Number(process.env.ORBIT_API_PORT) || 38488
const UI_PORT = Number(process.env.ORBIT_UI_PORT) || 4173
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`
const UI_BASE_URL = `http://127.0.0.1:${UI_PORT}`

let apiProcess = null
let uiServer = null
let mainWindow = null
let isQuitting = false
let preloadScriptPath = null
let updateCheckInterval = null

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const UPDATES_ENABLED = false

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, "..")
const projectRoot = resolve(__dirname, "..")

const PACKAGE_VERSION = (() => {
  try {
    return JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    ).version
  } catch {
    return "0.0.0"
  }
})()

const PACKAGE_COPYRIGHT = `Copyright © ${new Date().getFullYear()} eistruhe`

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function resolveRuntimePaths() {
  if (app.isPackaged) {
    return {
      bunBinaryPath: join(process.resourcesPath, "runtime", "bun"),
      serverEntryPath: join(process.resourcesPath, "runtime", "server", "index.js"),
      distPath: join(app.getAppPath(), "dist"),
      preloadPath: join(app.getAppPath(), "electron", "preload.cjs"),
    }
  }
  return {
    bunBinaryPath: process.env.ORBIT_BUN_PATH || "bun",
    serverEntryPath: join(projectRoot, "electron", "runtime", "server", "index.js"),
    distPath: join(projectRoot, "dist"),
    preloadPath: join(projectRoot, "electron", "preload.cjs"),
  }
}

async function ensureExists(path) {
  await access(path)
}

async function ensureRendererBuild(distPath) {
  try {
    await readFile(join(distPath, "index.html"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`dist not found in ${distPath}: ${message}`)
  }
}

async function proxyApiRequest(req, res) {
  const targetUrl = `${API_BASE_URL}${req.url || "/"}`
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body,
      duplex: body ? "half" : undefined,
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    res.statusCode = response.status
    const contentType = response.headers.get("content-type")
    if (contentType) {
      res.setHeader("content-type", contentType)
    }
    res.end(bytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.statusCode = 502
    res.setHeader("content-type", "application/json; charset=utf-8")
    res.end(JSON.stringify({ error: `API proxy failed: ${message}` }))
  }
}

function safeDistPath(distPath, requestPathname) {
  const clean = normalize(decodeURIComponent(requestPathname)).replace(/^([/\\])+/, "")
  const filePath = resolve(distPath, clean)
  if (!filePath.startsWith(resolve(distPath))) {
    return null
  }
  return filePath
}

async function serveRendererAsset(distPath, req, res) {
  const reqUrl = new URL(req.url || "/", UI_BASE_URL)
  let requestPath = reqUrl.pathname
  if (requestPath === "/") requestPath = "/index.html"

  const directPath = safeDistPath(distPath, requestPath)
  if (directPath) {
    try {
      const bytes = await readFile(directPath)
      res.statusCode = 200
      res.setHeader(
        "content-type",
        MIME_TYPES[extname(directPath)] || "application/octet-stream",
      )
      res.end(bytes)
      return
    } catch {
      // SPA fallback below.
    }
  }

  try {
    const indexPath = join(distPath, "index.html")
    const html = await readFile(indexPath)
    res.statusCode = 200
    res.setHeader("content-type", "text/html; charset=utf-8")
    res.end(html)
  } catch {
    res.statusCode = 500
    res.end("Renderer dist not found. Run `bun run build` first.")
  }
}

function startUiServer(distPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      if ((req.url || "").startsWith("/api")) {
        void proxyApiRequest(req, res)
        return
      }
      void serveRendererAsset(distPath, req, res)
    })

    server.on("error", (error) => {
      rejectPromise(error)
    })

    server.listen(UI_PORT, "127.0.0.1", () => {
      uiServer = server
      resolvePromise(server)
    })
  })
}

function killChildProcess(child) {
  if (!child || child.killed || child.exitCode != null) return
  if (process.platform === "win32") {
    child.kill()
    return
  }
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }
}

async function waitForApi() {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`)
      if (response.ok) return
    } catch {
      // Keep polling.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
  }
  throw new Error(`API did not become healthy on ${API_BASE_URL}`)
}

function startApiProcess({ bunBinaryPath, serverEntryPath }) {
  const args = ["run", serverEntryPath]
  const child = spawn(bunBinaryPath, args, {
    cwd: app.isPackaged ? process.resourcesPath : projectRoot,
    env: {
      ...process.env,
      ORBIT_API_PORT: String(API_PORT),
    },
    detached: process.platform !== "win32",
    stdio: "pipe",
  })
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[orbit-api] ${chunk}`)
  })
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[orbit-api] ${chunk}`)
  })
  return child
}

function createMainWindow(preloadPath) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    return
  }

  const macTitleBarOptions =
    process.platform === "darwin"
      ? {
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 14, y: 16 },
        }
      : {}

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
    title: "Orbit",
    ...macTitleBarOptions,
  })
  void mainWindow.loadURL(UI_BASE_URL)

  // Route window.open("https://...") to the OS default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url)
      return { action: "deny" }
    }
    return { action: "allow" }
  })

  // Prevent accidental app reload shortcuts in production-style desktop usage.
  // With a `before-input-event` listener attached, menu accelerators (e.g. Close ⌘W)
  // must be re-enabled while Command/Control is held. See Electron `setIgnoreMenuShortcuts`.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    mainWindow.webContents.setIgnoreMenuShortcuts(!input.control && !input.meta)

    const key = typeof input.key === "string" ? input.key.toLowerCase() : ""
    const isReloadShortcut =
      key === "f5" || (key === "r" && (Boolean(input.meta) || Boolean(input.control)))
    if (isReloadShortcut) {
      event.preventDefault()
      return
    }

    const isCloseWindowShortcut =
      input.type === "keyDown" &&
      !input.isComposing &&
      key === "w" &&
      (Boolean(input.meta) || Boolean(input.control)) &&
      !input.alt &&
      !input.shift
    if (isCloseWindowShortcut) {
      event.preventDefault()
      mainWindow?.close()
    }
  })

  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

async function fetchUpdatesSilently() {
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[orbit-updater] Update check failed: ${message}\n`)
  }
}

function startAutoUpdater() {
  if (!UPDATES_ENABLED || !app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => {
    process.stdout.write("[orbit-updater] Checking for updates...\n")
  })
  autoUpdater.on("update-available", (info) => {
    process.stdout.write(`[orbit-updater] Update available: ${info.version}\n`)
  })
  autoUpdater.on("update-not-available", () => {
    process.stdout.write("[orbit-updater] No updates available.\n")
  })
  autoUpdater.on("update-downloaded", async (info) => {
    const versionLabel = typeof info?.version === "string" ? info.version : "?"
    process.stdout.write(
      `[orbit-updater] Update downloaded (${versionLabel}); prompting to restart.\n`,
    )
    try {
      const parent = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined
      const { response } = await dialog.showMessageBox(parent, {
        type: "question",
        title: "Orbit update ready",
        message: `Version ${versionLabel} has been downloaded.`,
        detail:
          "Restart now to finish installing. You can also quit later and the update will apply on exit.",
        buttons: ["Later", "Restart now"],
        defaultId: 1,
        cancelId: 0,
      })
      process.stdout.write(`[orbit-updater] Update dialog response: ${response}\n`)
      if (response === 1) {
        quitAndInstallDownloadedUpdate()
      }
    } catch {
      /* dialog failed; quit path still installs on exit via autoInstallOnAppQuit */
    }
  })
  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[orbit-updater] Error: ${message}\n`)
  })

  void fetchUpdatesSilently()

  updateCheckInterval = setInterval(() => {
    void fetchUpdatesSilently()
  }, UPDATE_CHECK_INTERVAL_MS)
}

async function boot() {
  const runtimePaths = resolveRuntimePaths()
  preloadScriptPath = runtimePaths.preloadPath
  await ensureExists(runtimePaths.serverEntryPath)
  await ensureExists(runtimePaths.preloadPath)
  if (runtimePaths.bunBinaryPath !== "bun") {
    await ensureExists(runtimePaths.bunBinaryPath)
  }
  await ensureRendererBuild(runtimePaths.distPath)

  apiProcess = startApiProcess(runtimePaths)
  await waitForApi()
  await startUiServer(runtimePaths.distPath)
  createMainWindow(runtimePaths.preloadPath)
}

async function showBootError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  await dialog.showMessageBox({
    type: "error",
    title: "Orbit failed to start",
    message: "Could not start the local runtime services.",
    detail,
  })
}

/**
 * Tear down child services shared by normal quit and `quitAndInstall()`.
 */
function disposeOrbitalServices() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }
  if (uiServer) {
    uiServer.close()
    uiServer = null
  }
  killChildProcess(apiProcess)
}

/**
 * `@electron/updater.quitAndInstall` can skip normal `before-quit` ordering. On macOS our
 * `BrowserWindow` `close` handler calls `preventDefault()` and hides the window unless
 * `isQuitting`, which blocks installer quit. Removing the listener and flushing cleanup
 * first matches electron-builder updater guidance (#8997).
 */
function quitAndInstallDownloadedUpdate() {
  process.stdout.write("[orbit-updater] Restart now requested; preparing quit and install.\n")
  isQuitting = true
  disposeOrbitalServices()

  const win = mainWindow
  if (win && !win.isDestroyed()) {
    win.removeAllListeners("close")
  }

  app.removeAllListeners("window-all-closed")

  nativeAutoUpdater.once("before-quit-for-update", () => {
    process.stdout.write("[orbit-updater] before-quit-for-update fired.\n")
    isQuitting = true
    disposeOrbitalServices()
    app.exit(0)
  })

  queueMicrotask(() => {
    try {
      process.stdout.write("[orbit-updater] Calling quitAndInstall(false, true).\n")
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[orbit-updater] quitAndInstall failed: ${message}\n`)
      app.exit(0)
    }
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  isQuitting = true
  disposeOrbitalServices()
})

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    return
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(preloadScriptPath ?? resolveRuntimePaths().preloadPath)
  }
})

ipcMain.handle("orbit:pick-image-paths", async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined
  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
  })
  if (result.canceled) return []
  return result.filePaths
})

/**
 * @returns Structured result shared by IPC and the macOS App menu command.
 */
async function performUserInitiatedUpdateCheck() {
  if (!UPDATES_ENABLED) {
    return { outcome: "disabled" }
  }
  if (!app.isPackaged) {
    return { outcome: "not_packaged" }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const isUpdateAvailable = Boolean(result?.isUpdateAvailable)
    const version =
      typeof result?.updateInfo?.version === "string" ? result.updateInfo.version : null
    return { outcome: "ok", isUpdateAvailable, version }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { outcome: "error", message }
  }
}

async function showCheckForUpdatesMenuDialog() {
  const parent = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined
  const result = await performUserInitiatedUpdateCheck()
  if (result.outcome === "disabled") {
    await dialog.showMessageBox(parent, {
      type: "info",
      title: "Orbit",
      message: "Automatic updates are disabled for now.",
    })
    return
  }
  if (result.outcome === "not_packaged") {
    await dialog.showMessageBox(parent, {
      type: "info",
      title: "Orbit",
      message: "Updates are checked in the release app.",
      detail:
        "This development build is not packaged. Install Orbit from a release installer to enable automatic updates.",
    })
    return
  }
  if (result.outcome === "error") {
    await dialog.showMessageBox(parent, {
      type: "error",
      title: "Orbit update",
      message: "Could not check for updates.",
      detail: result.message,
    })
    return
  }
  if (result.isUpdateAvailable) {
    const versionHint =
      result.version !== null ? `Version ${result.version} is available.` : "A new version is available."
    await dialog.showMessageBox(parent, {
      type: "info",
      title: "Orbit update",
      message: versionHint,
      detail:
        "The update downloads automatically when your feed provides it. Restart when prompted to finish installing.",
    })
    return
  }
  await dialog.showMessageBox(parent, {
    type: "info",
    title: "Orbit",
    message: "You're up to date.",
    detail: `Orbit ${PACKAGE_VERSION}`,
  })
}

function setDarwinApplicationMenu() {
  if (process.platform !== "darwin") return

  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        ...(UPDATES_ENABLED
          ? [
              {
                label: "Check for Updates…",
                click: () => void showCheckForUpdatesMenuDialog(),
              },
              { type: "separator" },
            ]
          : []),
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle("orbit:check-for-updates", async () => {
  const result = await performUserInitiatedUpdateCheck()
  if (result.outcome === "disabled") {
    return { ok: false, reason: "disabled" }
  }
  if (result.outcome === "not_packaged") {
    return { ok: false, reason: "not_packaged" }
  }
  if (result.outcome === "error") {
    return { ok: false, message: result.message }
  }
  return {
    ok: true,
    version: result.version,
    ...(typeof result.isUpdateAvailable === "boolean"
      ? { isUpdateAvailable: result.isUpdateAvailable }
      : {}),
  }
})

app.whenReady().then(async () => {
  app.setName("Orbit")

  if (process.platform === "darwin") {
    app.setAboutPanelOptions({
      applicationName: "Orbit",
      applicationVersion: PACKAGE_VERSION,
      version: PACKAGE_VERSION,
      copyright: PACKAGE_COPYRIGHT,
    })
  }

  try {
    await boot()
    startAutoUpdater()
    setDarwinApplicationMenu()
  } catch (error) {
    await showBootError(error)
    app.quit()
  }
})
