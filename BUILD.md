# Desktop build guide

This document covers building and packaging the Orbit Electron app.

## Runtime shipping decision

This implementation chooses:

- Ship a Bun runtime binary in packaged resources.
- Bundle the API entry into `electron/runtime/server/index.js` with `bun build --target bun`.
- Start the API at runtime with the bundled Bun binary and bundled server file.

Why:

- Keeps server behavior and existing Hono routes intact.
- Avoids a Node port of the API.
- Keeps packaged runtime smaller than shipping full server source + node_modules.

## Prerequisites

- Bun installed locally for build-time bundling.
- Node/npm available for dependency installation.
- Electron toolchain dependencies installed.

## Build flow

1. Build renderer:

```sh
bun run build
```

2. Prepare runtime artifacts:

```sh
bun run build:runtime
```

This creates:

- `electron/runtime/bun`
- `electron/runtime/server/index.js`

3. Build distributables:

```sh
bun run dist:desktop
```

Tip: if you have previous packaged outputs under `dist/` (for example `dist/mac-arm64`),
remove them before packaging to keep only web assets in `app.asar`.

For unpacked testing only:

```sh
bun run dist:desktop:dir
```

To run the production flow without packaging:

```sh
bun run electron:prod
```

## macOS signing and notarization

Set environment variables before `dist:desktop`:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Optional signing variables for your CI runner:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Notes:

- The build config enables `hardenedRuntime`.
- Entitlements file: `electron/entitlements.mac.plist`.
- Notarization hook: `scripts/notarize.mjs`.
- If notarization env vars are missing, packaging proceeds without notarization.

## Clean-machine QA checklist

Run on a machine/profile with no pre-existing app config:

1. Install and launch packaged app.
2. Confirm window loads and header renders.
3. Run **Scan projects** and verify repository cards populate.
4. Open one repo in Finder and Cursor from action buttons.
5. Open remote link button for a repo with `origin`.
6. Add tags and note through **Meta**, then restart app and confirm persistence.
7. Verify preferences file exists at `~/.config/orbit/config.json`.
8. Confirm no startup crash when ports `38488` (API) and `4173` (UI) are free.
9. Confirm clear startup error dialog if one of those ports is occupied.
