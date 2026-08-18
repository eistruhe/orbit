import { fetchWithTimeout } from "./util.ts"

const DNS_TIMEOUT_MS = 6_000

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "CAA",
] as const

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number]

const TYPE_NUMBERS: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  257: "CAA",
}

export type DnsRecord = {
  name: string
  type: string
  ttl: number
  data: string
}

export type ResolverResult = {
  resolver: "cloudflare" | "google"
  records: DnsRecord[]
  error: string | null
}

export type DnsLookup = {
  domain: string
  type: string
  results: ResolverResult[]
}

export type DnsResult =
  | { ok: true; data: DnsLookup }
  | { ok: false; status: number; error: string }

type DohAnswer = { name: string; type: number; TTL: number; data: string }

type DohResponse = { Status: number; Answer?: DohAnswer[] }

/** Accepts bare domains and full URLs; returns the punycoded hostname. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    )
    const host = url.hostname
    if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(host)) return null
    return host
  } catch {
    return null
  }
}

async function queryDoh(
  resolver: "cloudflare" | "google",
  domain: string,
  type: string,
): Promise<DnsRecord[]> {
  const url =
    resolver === "cloudflare"
      ? `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`
      : `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`
  const res = await fetchWithTimeout(url, DNS_TIMEOUT_MS, {
    headers: { accept: "application/dns-json" },
  })
  if (!res.ok) throw new Error(`Resolver answered HTTP ${res.status}`)
  const body = (await res.json()) as DohResponse
  if (body.Status !== 0 && body.Status !== 3) {
    throw new Error(`DNS status ${body.Status}`)
  }
  return (body.Answer ?? []).map((answer) => ({
    name: answer.name.replace(/\.$/, ""),
    type: TYPE_NUMBERS[answer.type] ?? String(answer.type),
    ttl: answer.TTL,
    data: answer.data.replace(/^"|"$/g, ""),
  }))
}

async function queryResolver(
  resolver: "cloudflare" | "google",
  domain: string,
  type: string,
): Promise<ResolverResult> {
  const types: string[] =
    type === "ANY" ? [...DNS_RECORD_TYPES] : [type]
  try {
    const batches = await Promise.all(
      types.map((entry) => queryDoh(resolver, domain, entry)),
    )
    const records = batches.flat()
    // ANY queries return CNAMEs once per queried type — dedupe.
    const seen = new Set<string>()
    const unique = records.filter((record) => {
      const key = `${record.type}|${record.name}|${record.data}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return { resolver, records: unique, error: null }
  } catch (cause: unknown) {
    return {
      resolver,
      records: [],
      error: cause instanceof Error ? cause.message : "Lookup failed",
    }
  }
}

export async function lookupDns(
  domainInput: string | undefined,
  typeInput: string | undefined,
): Promise<DnsResult> {
  const domain = normalizeDomain(domainInput ?? "")
  if (!domain) {
    return { ok: false, status: 400, error: "Enter a valid domain name." }
  }
  const type =
    typeInput && [...DNS_RECORD_TYPES, "ANY"].includes(typeInput)
      ? typeInput
      : "A"
  const results = await Promise.all([
    queryResolver("cloudflare", domain, type),
    queryResolver("google", domain, type),
  ])
  return { ok: true, data: { domain, type, results } }
}
