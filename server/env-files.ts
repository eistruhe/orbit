import { readFile, readdir, stat } from "node:fs/promises"
import { join } from "node:path"

const MAX_ENV_BYTES = 1024 * 1024

/** Only bare .env-style file names — never paths — are accepted. */
const ENV_NAME_PATTERN = /^\.env(?:\.[\w.-]+)?$/

export type EnvKeyInfo = {
  key: string
  /** Whether the entry has a non-empty value (the value itself stays private). */
  hasValue: boolean
  line: number
}

export type EnvFileInfo = {
  name: string
  keys: EnvKeyInfo[]
  parseErrors: number
}

export type EnvListResult =
  | { ok: true; data: { files: EnvFileInfo[] } }
  | { ok: false; status: number; error: string }

export type EnvValuesResult =
  | { ok: true; data: { values: Record<string, string> } }
  | { ok: false; status: number; error: string }

function parseEnvContent(content: string): {
  entries: { key: string; value: string; line: number }[]
  parseErrors: number
} {
  const entries: { key: string; value: string; line: number }[] = []
  let parseErrors = 0
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/,
    )
    if (!match) {
      parseErrors += 1
      continue
    }
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else {
      // Unquoted values may carry trailing comments.
      const hash = value.indexOf(" #")
      if (hash >= 0) value = value.slice(0, hash).trim()
    }
    entries.push({ key: match[1], value, line: index + 1 })
  }
  return { entries, parseErrors }
}

async function readEnvFile(repoPath: string, name: string): Promise<string> {
  const filePath = join(repoPath, name)
  const info = await stat(filePath)
  if (!info.isFile()) throw new Error(`${name} is not a file`)
  if (info.size > MAX_ENV_BYTES) throw new Error(`${name} is too large`)
  return readFile(filePath, "utf8")
}

/**
 * Lists .env* files in the project root with key names only — values are
 * intentionally NOT part of this response.
 */
export async function listEnvFiles(repoPath: string): Promise<EnvListResult> {
  let names: string[]
  try {
    const entries = await readdir(repoPath, { withFileTypes: true })
    names = entries
      .filter((entry) => entry.isFile() && ENV_NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch (cause: unknown) {
    return {
      ok: false,
      status: 500,
      error:
        cause instanceof Error ? cause.message : "Could not read directory",
    }
  }

  const files: EnvFileInfo[] = []
  for (const name of names) {
    try {
      const content = await readEnvFile(repoPath, name)
      const { entries, parseErrors } = parseEnvContent(content)
      files.push({
        name,
        parseErrors,
        keys: entries.map((entry) => ({
          key: entry.key,
          hasValue: entry.value.length > 0,
          line: entry.line,
        })),
      })
    } catch {
      files.push({ name, keys: [], parseErrors: 1 })
    }
  }
  return { ok: true, data: { files } }
}

/**
 * Returns the values of ONE env file — only ever on an explicit request for
 * that file, never as part of the listing.
 */
export async function readEnvValues(
  repoPath: string,
  fileName: unknown,
): Promise<EnvValuesResult> {
  if (typeof fileName !== "string" || !ENV_NAME_PATTERN.test(fileName)) {
    return { ok: false, status: 400, error: "Invalid env file name" }
  }
  try {
    const content = await readEnvFile(repoPath, fileName)
    const { entries } = parseEnvContent(content)
    const values: Record<string, string> = {}
    for (const entry of entries) values[entry.key] = entry.value
    return { ok: true, data: { values } }
  } catch (cause: unknown) {
    return {
      ok: false,
      status: 400,
      error: cause instanceof Error ? cause.message : "Could not read file",
    }
  }
}
