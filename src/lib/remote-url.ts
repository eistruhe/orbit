function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value
}

/**
 * Converts common git remote formats into a browser URL.
 */
export function toBrowserRemoteUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null
  const input = remoteUrl.trim()
  if (!input) return null

  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const parsed = new URL(input)
      parsed.pathname = stripGitSuffix(parsed.pathname)
      return parsed.toString()
    } catch {
      return null
    }
  }

  const sshLike = input.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/]([^#?]+)$/)
  if (sshLike) {
    const host = sshLike[1]
    const path = stripGitSuffix(sshLike[2].replace(/^\/+/, ""))
    return `https://${host}/${path}`
  }

  return null
}
