import { chmod, copyFile, mkdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, "..")
const runtimeRoot = join(projectRoot, "electron", "runtime")
const runtimeServerDir = join(runtimeRoot, "server")
const runtimeBunPath = join(runtimeRoot, "bun")

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`)
  }
}

function resolveBunBinary() {
  if (process.env.ORBIT_BUN_PATH) {
    return process.env.ORBIT_BUN_PATH
  }
  const whichResult = spawnSync("which", ["bun"], {
    encoding: "utf8",
    cwd: projectRoot,
  })
  if (whichResult.status === 0 && whichResult.stdout.trim()) {
    return whichResult.stdout.trim()
  }
  throw new Error(
    "Could not resolve Bun binary. Set ORBIT_BUN_PATH before running build:runtime.",
  )
}

async function main() {
  await rm(runtimeRoot, { recursive: true, force: true })
  await mkdir(runtimeServerDir, { recursive: true })

  const bunBinary = resolveBunBinary()
  run(bunBinary, [
    "build",
    join(projectRoot, "server", "index.ts"),
    "--target",
    "bun",
    "--outfile",
    join(runtimeServerDir, "index.js"),
  ])
  await copyFile(bunBinary, runtimeBunPath)
  await chmod(runtimeBunPath, 0o755)
  console.log("Prepared Electron runtime in electron/runtime")
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
