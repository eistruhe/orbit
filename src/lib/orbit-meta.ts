declare const __ORBIT_APP_VERSION__: string

/** Semver from package.json at build time. */
export const ORBIT_APP_VERSION = __ORBIT_APP_VERSION__

export const ORBIT_COPYRIGHT_NOTICE = `Copyright © ${new Date().getFullYear()} eistruhe`
