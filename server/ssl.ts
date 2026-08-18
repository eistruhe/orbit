import { connect, type DetailedPeerCertificate, type TLSSocket } from "node:tls"

import { mapLimit } from "./util.ts"
import { normalizeDomain } from "./dns.ts"

const SSL_TIMEOUT_MS = 6_000
const MAX_DOMAINS = 20
const CONCURRENCY = 4

export type SslCertificate = {
  domain: string
  ok: boolean
  error: string | null
  subject: string | null
  issuer: string | null
  validFrom: string | null
  validTo: string | null
  daysLeft: number | null
  altNames: string[]
  chain: string[]
  protocol: string | null
  selfSigned: boolean
}

export type SslResult =
  | { ok: true; data: { results: SslCertificate[] } }
  | { ok: false; status: number; error: string }

function certificateName(cert: DetailedPeerCertificate): string {
  return (
    cert.subject?.CN ??
    cert.subject?.O ??
    Object.values(cert.subject ?? {})[0] ??
    "unknown"
  )
}

function inspectSocket(domain: string, socket: TLSSocket): SslCertificate {
  const cert = socket.getPeerCertificate(true)
  if (!cert || Object.keys(cert).length === 0) {
    return emptyResult(domain, "No certificate presented")
  }
  const validTo = new Date(cert.valid_to)
  const daysLeft = Math.floor(
    (validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  )
  const altNames = (cert.subjectaltname ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/^DNS:/, ""))
    .filter(Boolean)

  const chain: string[] = []
  let current: DetailedPeerCertificate | undefined = cert
  while (current && chain.length < 6) {
    chain.push(certificateName(current))
    const issuer: DetailedPeerCertificate | undefined =
      current.issuerCertificate
    if (!issuer || issuer === current) break
    current = issuer
  }

  const selfSigned =
    chain.length === 1 &&
    JSON.stringify(cert.subject) === JSON.stringify(cert.issuer)

  return {
    domain,
    ok: socket.authorized && daysLeft > 0,
    error: socket.authorized
      ? daysLeft <= 0
        ? "Certificate expired"
        : null
      : (socket.authorizationError?.toString() ?? "Not authorized"),
    subject: cert.subject?.CN ?? null,
    issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
    validFrom: new Date(cert.valid_from).toISOString(),
    validTo: validTo.toISOString(),
    daysLeft,
    altNames,
    chain,
    protocol: socket.getProtocol(),
    selfSigned,
  }
}

function emptyResult(domain: string, error: string): SslCertificate {
  return {
    domain,
    ok: false,
    error,
    subject: null,
    issuer: null,
    validFrom: null,
    validTo: null,
    daysLeft: null,
    altNames: [],
    chain: [],
    protocol: null,
    selfSigned: false,
  }
}

function checkDomain(domain: string): Promise<SslCertificate> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: SslCertificate) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    const timer = setTimeout(
      () => finish(emptyResult(domain, "Connection timed out")),
      SSL_TIMEOUT_MS,
    )
    const socket = connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        // Inspect certificates even when the chain does not validate.
        rejectUnauthorized: false,
        timeout: SSL_TIMEOUT_MS,
      },
      () => finish(inspectSocket(domain, socket)),
    )
    socket.on("error", (cause: Error) =>
      finish(emptyResult(domain, cause.message)),
    )
    socket.on("timeout", () =>
      finish(emptyResult(domain, "Connection timed out")),
    )
  })
}

export async function checkSslDomains(input: unknown): Promise<SslResult> {
  if (!Array.isArray(input)) {
    return { ok: false, status: 400, error: "Expected a list of domains." }
  }
  const domains = [
    ...new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => normalizeDomain(entry))
        .filter((entry): entry is string => entry !== null),
    ),
  ]
  if (domains.length === 0) {
    return { ok: false, status: 400, error: "Enter at least one valid domain." }
  }
  if (domains.length > MAX_DOMAINS) {
    return {
      ok: false,
      status: 400,
      error: `Too many domains — limit is ${MAX_DOMAINS} per check.`,
    }
  }
  const results = await mapLimit(domains, CONCURRENCY, checkDomain)
  return { ok: true, data: { results } }
}
