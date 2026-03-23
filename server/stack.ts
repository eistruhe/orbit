import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Heuristic stack labels from common manifest files (v1).
 */
export async function detectStack(repoPath: string): Promise<string[]> {
  const tags = new Set<string>()

  const tryRead = async (name: string) => {
    try {
      return await readFile(join(repoPath, name), "utf8")
    } catch {
      return null
    }
  }

  const pkg = await tryRead("package.json")
  if (pkg) {
    tags.add("Node")
    if (/next/i.test(pkg)) tags.add("Next")
    if (/react/i.test(pkg)) tags.add("React")
    if (/vue/i.test(pkg)) tags.add("Vue")
    if (/nuxt/i.test(pkg)) tags.add("Nuxt")
    if (/svelte/i.test(pkg)) tags.add("Svelte")
  }

  const gem = await tryRead("Gemfile")
  if (gem) {
    tags.add("Ruby")
    if (/rails/i.test(gem)) tags.add("Rails")
  }

  const comp = await tryRead("composer.json")
  if (comp) {
    tags.add("PHP")
  }

  const cargo = await tryRead("Cargo.toml")
  if (cargo) {
    tags.add("Rust")
  }

  const go = await tryRead("go.mod")
  if (go) {
    tags.add("Go")
  }

  const py = await tryRead("pyproject.toml")
  const req = await tryRead("requirements.txt")
  if (py || req) {
    tags.add("Python")
  }

  return [...tags]
}
