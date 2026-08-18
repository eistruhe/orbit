export {}

declare global {
  interface Window {
    orbitFiles?: {
      getPathForFile: (file: File) => string
      pickImagePaths: () => Promise<string[]>
      pickDirectory: () => Promise<string | null>
    }
    orbitUpdates?: {
      checkForUpdates: () => Promise<
        | { ok: true; version: string | null; isUpdateAvailable?: boolean }
        | { ok: false; reason: string }
        | { ok: false; message: string }
      >
    }
  }
}
