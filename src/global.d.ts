export {}

declare global {
  interface Window {
    orbitFiles?: {
      getPathForFile: (file: File) => string
      pickImagePaths: () => Promise<string[]>
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
