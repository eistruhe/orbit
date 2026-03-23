import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ReactNode } from "react"

type ThemeProviderProps = {
  children: ReactNode
}

/**
 * Wraps the app so light/dark styles follow the OS appearance.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
