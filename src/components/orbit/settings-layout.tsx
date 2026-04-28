import { Outlet } from "@tanstack/react-router"

export function SettingsLayout() {
  return (
    <>
      <header className="app-drag sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border px-3 h-12 bg-sidebar/30 dark:bg-sidebar/70 backdrop-blur-lg">
        <h2 className="text-xl font-semibold">Settings</h2>
      </header>

      <div className="flex flex-1 flex-col gap-8 p-3">
        <Outlet />
      </div>
    </>
  )
}
