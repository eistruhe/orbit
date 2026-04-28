import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { OrbitApp } from "@/components/orbit/orbit-app"
import { ProjectDetailPage } from "@/components/orbit/project-detail-page"
import { ProjectsHomePage } from "@/components/orbit/projects-home-page"
import { ProjectsLayout } from "@/components/orbit/projects-layout"
import { SettingsLayout } from "@/components/orbit/settings-layout"
import { SettingsPage } from "@/components/orbit/settings-page"
import { OpenGraphPage } from "@/components/orbit/tools/open-graph-page"
import { PxToRemPage } from "@/components/orbit/tools/px-to-rem-page"
import { TinifyPage } from "@/components/orbit/tools/tinify-page"
import { ToolsHubPage } from "@/components/orbit/tools/tools-hub-page"
import { ToolsLayout } from "@/components/orbit/tools-layout"

const rootRoute = createRootRoute({
  component: OrbitApp,
})

const projectsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "projects-layout",
  component: ProjectsLayout,
})

const projectsIndexRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/",
  component: ProjectsHomePage,
})

const projectDetailRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/project/$encodedPath",
  component: ProjectDetailPage,
})

const toolsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tools",
  component: ToolsLayout,
})

const toolsIndexRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/",
  component: ToolsHubPage,
})

const tinifyRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "tinify",
  component: TinifyPage,
})

const pxToRemRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "px-to-rem",
  component: PxToRemPage,
})

const openGraphRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "open-graph",
  component: OpenGraphPage,
})

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/",
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  projectsLayoutRoute.addChildren([projectsIndexRoute, projectDetailRoute]),
  toolsLayoutRoute.addChildren([
    toolsIndexRoute,
    tinifyRoute,
    pxToRemRoute,
    openGraphRoute,
  ]),
  settingsLayoutRoute.addChildren([settingsIndexRoute]),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
