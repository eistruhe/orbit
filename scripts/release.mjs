#!/usr/bin/env node
/**
 * Guided macOS release: bump semver, build desktop, publish to GitHub Releases, commit + tag + push.
 * Requires GH_TOKEN (or GITHUB_TOKEN) with repo scope for uploads.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import readline from "node:readline/promises"
import process from "node:process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import semver from "semver"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const packageJsonPath = join(projectRoot, "package.json")

/**
 * Load `.env` from the repo root so `bun run release` sees `GITHUB_TOKEN` / `GH_TOKEN`
 * without exporting them in the shell. Does not override vars already set.
 */
function loadDotenvFromProjectRoot() {
  const path = join(projectRoot, ".env")
  if (!existsSync(path)) return
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDotenvFromProjectRoot()

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (${result.status ?? "unknown"})`)
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  })
  if (result.error) throw result.error
  return { status: result.status ?? 1, stdout: (result.stdout ?? "").trimEnd() }
}

function usage() {
  console.log(`
Orbit desktop release (macOS + GitHub)

Usage:
  bun run release
  bun run release --dry-run
  bun run release -- --version=1.2.3

Options:
  --version=X.Y.Z   Bump to this semver (otherwise prompt interactive)
  --dry-run         Print steps only
  --no-push         Build + publish; skip git commit, tag, and push
  --allow-dirty     Allow uncommitted changes before bumping

Env:
  GH_TOKEN or GITHUB_TOKEN   Required for uploading release assets unless --dry-run
  (Loads project .env automatically; exports still win.)
`)
}

function parseArgs(argv) {
  /** @type {{ dryRun: boolean; noPush: boolean; allowDirty: boolean; version?: string }} */
  const out = { dryRun: false, noPush: false, allowDirty: false, version: undefined }
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a === "-h" || a === "--help") {
      usage()
      process.exit(0)
    }
    if (a === "--dry-run") {
      out.dryRun = true
      i++
      continue
    }
    if (a === "--no-push") {
      out.noPush = true
      i++
      continue
    }
    if (a === "--allow-dirty") {
      out.allowDirty = true
      i++
      continue
    }
    if (a.startsWith("--version=")) {
      out.version = a.slice("--version=".length)
      i++
      continue
    }
    if (a === "--version") {
      const next = argv[i + 1]
      if (!next || next.startsWith("-")) {
        console.error("--version expects a semver value.")
        usage()
        process.exit(2)
      }
      out.version = next
      i += 2
      continue
    }
    console.error(`Unknown argument: ${a}`)
    usage()
    process.exit(2)
  }
  return out
}

function isWorkingTreeDirty() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: projectRoot,
    encoding: "utf8",
  })
  return Boolean(result.stdout && result.stdout.trim().length > 0)
}

/**
 * @param {string} raw
 * @param {string} currentValid
 */
function resolveNextVersion(raw, currentValid) {
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const coerced = semver.coerce(trimmed)
  const v =
    semver.valid(trimmed) || (coerced ? semver.valid(coerced.version) : null)
  if (!v) return null
  if (semver.lte(v, currentValid)) return null
  return v
}

function resolvePushTarget() {
  const head = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout || "main"
  const upstream = runCapture("git", ["rev-parse", "--abbrev-ref", `${head}@{u}`])
  if (upstream.status !== 0 || !upstream.stdout) {
    return { remote: "origin", useHead: true }
  }
  const full = upstream.stdout.trim()
  const slash = full.indexOf("/")
  if (slash === -1) {
    return { remote: "origin", useHead: true }
  }
  return {
    remote: full.slice(0, slash),
    branch: full.slice(slash + 1),
    useHead: false,
  }
}

function getGitHeadSha() {
  const r = runCapture("git", ["rev-parse", "HEAD"])
  if (r.status !== 0) return null
  return r.stdout.trim()
}

/** @param {string} tagName */
function tagExistsLocally(tagName) {
  const r = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`], {
    cwd: projectRoot,
  })
  return (r.status ?? 1) === 0
}

/**
 * Create or move an annotated tag to the current HEAD (e.g. after a failed run left an old tag).
 * @param {string} tagName
 * @param {string} message
 */
function ensureReleaseTag(tagName, message) {
  const head = getGitHeadSha()
  if (!head) throw new Error("Could not read git HEAD")
  if (tagExistsLocally(tagName)) {
    const pointed = runCapture("git", ["rev-parse", tagName]).stdout.trim()
    if (pointed === head) {
      console.log(`Tag ${tagName} already points at the release commit; not recreating.`)
      return
    }
    console.log(
      `Replacing local tag ${tagName} (${pointed.slice(0, 7)} → ${head.slice(0, 7)}) to match this release.`,
    )
    run("git", ["tag", "-d", tagName])
  }
  run("git", ["tag", "-a", tagName, "-m", message])
}

function pushTag(remote, tagName) {
  const pipeOptions = {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
  }
  let result = spawnSync("git", ["push", remote, tagName], pipeOptions)
  if ((result.status ?? 1) === 0) return

  const out = `${result.stderr || ""}${result.stdout || ""}`
  const remoteTagFromPublish =
    /already exists|\[rejected\]|\b tag \b.*already|Updates were rejected/i.test(out)

  if (!remoteTagFromPublish) {
    process.stderr.write(out)
    throw new Error(`git push ${remote} ${tagName} failed (${result.status ?? "unknown"})`)
  }

  console.log(
    `\nRemote already has ${tagName} (electron-builder creates it during publish). Updating it to the local release commit.`,
  )
  result = spawnSync("git", ["push", "--force", remote, tagName], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git push --force ${remote} ${tagName} failed (${result.status ?? "unknown"})`)
  }
}

async function promptLine(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer = await rl.question(prompt)
    return String(answer ?? "").trim()
  } finally {
    rl.close()
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))

  if (!flags.allowDirty && isWorkingTreeDirty()) {
    console.error("\nabort: Working tree has uncommitted changes.")
    console.error("Commit or stash, or rerun with --allow-dirty\n")
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const current = pkg.version
  const currentValid = semver.valid(current)
  if (!currentValid) {
    throw new Error(`Invalid current package.json version: ${JSON.stringify(current)}`)
  }

  const suggested = semver.inc(currentValid, "patch")
  if (!suggested) {
    throw new Error("Could not compute next patch version.")
  }

  let next
  if (flags.version !== undefined && flags.version.trim().length > 0) {
    next = resolveNextVersion(flags.version.trim(), currentValid)
    if (!next) {
      console.error(`Invalid semver or version must be greater than ${currentValid}: ${flags.version}`)
      process.exit(1)
    }
  } else {
    const rawInput = await promptLine(
      `New semver version (current: ${current}, suggested: ${suggested}): `,
    )
    next = resolveNextVersion(rawInput.trim() || suggested, currentValid)
    if (!next) {
      console.error(`Invalid or non-incrementing version: ${JSON.stringify(rawInput || suggested)}`)
      process.exit(1)
    }
  }

  const ghToken =
    typeof process.env.GH_TOKEN === "string" && process.env.GH_TOKEN.trim().length > 0
      ? process.env.GH_TOKEN.trim()
      : typeof process.env.GITHUB_TOKEN === "string" && process.env.GITHUB_TOKEN.trim().length > 0
        ? process.env.GITHUB_TOKEN.trim()
        : ""

  if (!flags.dryRun && !ghToken) {
    console.error("GH_TOKEN or GITHUB_TOKEN must be set (repo scope) to publish artifacts.")
    process.exit(1)
  }

  const tagName = `v${next}`

  const steps = [
    `Set package.json version → ${next}`,
    "bun run build:desktop",
    "electron-builder --publish always --mac",
    `git commit: Release ${next}`,
    `git tag: ${tagName}`,
    "git push: branch + tag",
  ]

  console.log("\nRelease plan:")
  steps.forEach((s, idx) => console.log(`  ${idx + 1}. ${s}`))
  console.log("")

  if (flags.dryRun) {
    console.log("Dry run completed.")
    process.exit(0)
  }

  const pkgNext = { ...pkg, version: next }
  writeFileSync(packageJsonPath, `${JSON.stringify(pkgNext, null, 2)}\n`, "utf8")

  console.log("\nBuilding desktop bundle...")
  run("bun", ["run", "build:desktop"])

  console.log("\nPublishing GitHub Release assets...")
  process.env.GH_TOKEN = ghToken
  process.env.GITHUB_TOKEN = ghToken
  run("bunx", ["electron-builder", "--publish", "always", "--mac"])

  if (flags.noPush) {
    console.log(
      "\nSkipping git commit/tag/push (--no-push).\nVersion bump is in package.json; commit manually.",
    )
    process.exit(0)
  }

  console.log("\nRecording release in git...")
  run("git", ["add", "package.json"])
  run("git", ["commit", "-m", `Release ${next}`])
  ensureReleaseTag(tagName, `Orbit ${next}`)

  const target = resolvePushTarget()
  if (target.useHead) {
    run("git", ["push", target.remote, "HEAD"])
  } else {
    run("git", ["push", target.remote, target.branch])
  }
  pushTag(target.remote, tagName)

  console.log(
    `\nDone: ${tagName} is on ${target.remote} and GitHub Release should list the mac artifacts.\n`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
