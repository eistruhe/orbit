import { RouterProvider } from "@tanstack/react-router"
import { bind } from "cuelume"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { ThemeProvider } from "./components/theme-provider.tsx"
import "./index.css"
import { applyAppearanceToDocument } from "./lib/appearance.ts"
import { installClipboardCue } from "./lib/sound.ts"
import { router } from "./router.tsx"

// Apply stored layout/surface settings before first paint to avoid a flash.
applyAppearanceToDocument()
// Interaction sounds come from data-cuelume-* attributes (see lib/sound.ts).
bind()
installClipboardCue()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
