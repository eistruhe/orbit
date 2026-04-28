export {}

declare global {
  interface Window {
    orbitFiles?: {
      getPathForFile: (file: File) => string
      pickImagePaths: () => Promise<string[]>
    }
  }
}
