import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { APP_SCROLL_CONTAINER_ID } from "@/components/orbit/app-scroll"
import { OrbitApp } from "@/components/orbit/orbit-app"
import { PageLayout } from "@/components/orbit/page-layout"
import { PortsPage } from "@/components/orbit/ports-page"
import { ProjectDetailPage } from "@/components/orbit/project-detail-page"
import { ProjectsHomePage } from "@/components/orbit/projects-home-page"
import { ProjectsLayout } from "@/components/orbit/projects-layout"
import { SearchPage } from "@/components/orbit/search-page"
import { SettingsLayout } from "@/components/orbit/settings-layout"
import { SettingsPage } from "@/components/orbit/settings-page"
import { ClampPage } from "@/components/orbit/tools/clamp-page"
import { CleanupPage } from "@/components/orbit/tools/cleanup-page"
import { ColorConvertPage } from "@/components/orbit/tools/color-convert-page"
import { ContrastPage } from "@/components/orbit/tools/contrast-page"
import { CsvViewerPage } from "@/components/orbit/tools/csv-viewer-page"
import { DiffPage } from "@/components/orbit/tools/diff-page"
import { DepsPage } from "@/components/orbit/tools/deps-page"
import { DnsPage } from "@/components/orbit/tools/dns-page"
import { EnvComparePage } from "@/components/orbit/tools/env-compare-page"
import { SslPage } from "@/components/orbit/tools/ssl-page"
import { EncodePage } from "@/components/orbit/tools/encode-page"
import { ExifPage } from "@/components/orbit/tools/exif-page"
import { JsonPage } from "@/components/orbit/tools/json-page"
import { QrPage } from "@/components/orbit/tools/qr-page"
import { RedirectRulesPage } from "@/components/orbit/tools/redirect-rules-page"
import { RegexPage } from "@/components/orbit/tools/regex-page"
import { SerpPage } from "@/components/orbit/tools/serp-page"
import { StringsPage } from "@/components/orbit/tools/strings-page"
import { TimePage } from "@/components/orbit/tools/time-page"
import { FaviconPage } from "@/components/orbit/tools/favicon-page"
import { ImageConvertPage } from "@/components/orbit/tools/image-convert-page"
import { ImageCropPage } from "@/components/orbit/tools/image-crop-page"
import { SeoAuditPage } from "@/components/orbit/tools/seo-audit-page"
import { PxToRemPage } from "@/components/orbit/tools/px-to-rem-page"
import { RedirectsPage } from "@/components/orbit/tools/redirects-page"
import { RobotsPage } from "@/components/orbit/tools/robots-page"
import { SchemaViewerPage } from "@/components/orbit/tools/schema-viewer-page"
import { SvgoPage } from "@/components/orbit/tools/svgo-page"
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

const projectsLibraryRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/lib/$libraryId",
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

const seoAuditRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "seo-audit",
  component: SeoAuditPage,
})

const svgoRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "svgo",
  component: SvgoPage,
})

const colorConvertRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "color-convert",
  component: ColorConvertPage,
})

const cleanupRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "cleanup",
  component: CleanupPage,
})

const imageConvertRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "image-convert",
  component: ImageConvertPage,
})

const imageCropRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "image-crop",
  component: ImageCropPage,
})

const csvViewerRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "csv-viewer",
  component: CsvViewerPage,
})

const faviconRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "favicon",
  component: FaviconPage,
})

const redirectsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "redirects",
  component: RedirectsPage,
})

const robotsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "robots",
  component: RobotsPage,
})

const clampRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "clamp",
  component: ClampPage,
})

const contrastRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "contrast",
  component: ContrastPage,
})

const diffRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "diff",
  component: DiffPage,
})

const schemaViewerRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "schema-viewer",
  component: SchemaViewerPage,
})

const stringsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "strings",
  component: StringsPage,
})

const timeRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "time",
  component: TimePage,
})

const serpRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "serp",
  component: SerpPage,
})

const encodeRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "encode",
  component: EncodePage,
})

const regexRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "regex",
  component: RegexPage,
})

const jsonRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "json",
  component: JsonPage,
})

const qrRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "qr",
  component: QrPage,
})

const exifRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "exif",
  component: ExifPage,
})

const redirectRulesRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "redirect-rules",
  component: RedirectRulesPage,
})

const dnsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "dns",
  component: DnsPage,
})

const sslRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "ssl",
  component: SslPage,
})

const envCompareRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "env-compare",
  component: EnvComparePage,
})

const depsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "deps",
  component: DepsPage,
})

const portsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ports",
  component: () => (
    <PageLayout title="Ports" subtitle="Listening processes" />
  ),
})

const portsIndexRoute = createRoute({
  getParentRoute: () => portsLayoutRoute,
  path: "/",
  component: PortsPage,
})

const searchLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: () => (
    <PageLayout title="Search" subtitle="Across all projects" />
  ),
})

const searchIndexRoute = createRoute({
  getParentRoute: () => searchLayoutRoute,
  path: "/",
  component: SearchPage,
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
  projectsLayoutRoute.addChildren([
    projectsIndexRoute,
    projectsLibraryRoute,
    projectDetailRoute,
  ]),
  toolsLayoutRoute.addChildren([
    toolsIndexRoute,
    tinifyRoute,
    pxToRemRoute,
    seoAuditRoute,
    svgoRoute,
    schemaViewerRoute,
    clampRoute,
    contrastRoute,
    diffRoute,
    redirectsRoute,
    robotsRoute,
    imageConvertRoute,
    imageCropRoute,
    csvViewerRoute,
    faviconRoute,
    cleanupRoute,
    colorConvertRoute,
    stringsRoute,
    timeRoute,
    serpRoute,
    encodeRoute,
    regexRoute,
    jsonRoute,
    qrRoute,
    exifRoute,
    redirectRulesRoute,
    dnsRoute,
    sslRoute,
    envCompareRoute,
    depsRoute,
  ]),
  portsLayoutRoute.addChildren([portsIndexRoute]),
  searchLayoutRoute.addChildren([searchIndexRoute]),
  settingsLayoutRoute.addChildren([settingsIndexRoute]),
])

export const router = createRouter({
  routeTree,
  // Page content scrolls inside <main>, not the window.
  scrollToTopSelectors: [`#${APP_SCROLL_CONTAINER_ID}`],
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
