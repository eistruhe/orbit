const { contextBridge, ipcRenderer, webUtils } = require("electron")

contextBridge.exposeInMainWorld("orbitFiles", {
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ""
    }
  },
  async pickImagePaths() {
    try {
      const paths = await ipcRenderer.invoke("orbit:pick-image-paths")
      return Array.isArray(paths)
        ? paths.filter((path) => typeof path === "string")
        : []
    } catch {
      return []
    }
  },
})

contextBridge.exposeInMainWorld("orbitUpdates", {
  checkForUpdates() {
    return ipcRenderer.invoke("orbit:check-for-updates")
  },
})
