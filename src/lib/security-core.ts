import { isIP } from "node:net"
import { timingSafeEqual } from "node:crypto"

export const OWNER_EMAIL = "admin@browns.at"

type HeaderReader = Pick<Headers, "get">

export type StaffIdentity = {
  userId: string
  email: string | null
  employee: { id?: string; role?: string; email?: string | null } | null
  isManager: boolean
}

export type AccessTarget = {
  id: string
  role?: string | null
  email?: string | null
}

type RateLimitBucket = { count: number; resetAt: number }

const globalRateLimits = globalThis as typeof globalThis & {
  __brownsSecurityRateLimits?: Map<string, RateLimitBucket>
}

const rateLimits = globalRateLimits.__brownsSecurityRateLimits ?? new Map<string, RateLimitBucket>()
globalRateLimits.__brownsSecurityRateLimits = rateLimits

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeIpCandidate(value: string): string | null {
  let candidate = value.trim()
  if (!candidate) return null
  if (candidate.startsWith("for=")) candidate = candidate.slice(4).replace(/^"|"$/g, "")
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]")
    if (end > 0) candidate = candidate.slice(1, end)
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.replace(/:\d+$/, "")
  }
  return isIP(candidate) ? candidate : null
}

/** Only trust proxy headers supplied by the configured deployment boundary. */
export function getTrustedClientIp(headers: HeaderReader): string | null {
  const vercelIp = headers.get("x-vercel-forwarded-for")
  if (vercelIp) {
    return normalizeIpCandidate(vercelIp.split(",", 1)[0])
  }

  const trustedHeaders = process.env.TRUSTED_PROXY_IP_HEADERS
    ?.split(",")
    .map(name => name.trim().toLowerCase())
    .filter(Boolean)
  const fallbackHeaders = process.env.NODE_ENV === "production"
    ? (trustedHeaders ?? [])
    : ["x-forwarded-for", "x-real-ip"]

  for (const name of fallbackHeaders) {
    const value = headers.get(name)
    if (!value) continue
    for (const part of value.split(",")) {
      const ip = normalizeIpCandidate(part)
      if (ip) return ip
    }
  }
  return null
}

export function isSameOriginMutation(request: { headers: HeaderReader; url: string }): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  const source = origin || referer
  if (!source) return process.env.NODE_ENV !== "production"
  try {
    return new URL(source).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function toSameOriginPath(value: unknown, requestOrigin: string): string {
  if (typeof value !== "string" || value.length > 2048) return "/"
  try {
    const url = new URL(value, requestOrigin)
    if (url.origin !== requestOrigin || !["http:", "https:"].includes(url.protocol)) return "/"
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/"
  }
}

export function getTrustedAppOrigin(requestOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  const requestFallback = process.env.NODE_ENV === "production" ? undefined : requestOrigin
  for (const value of [configured, vercelHost ? `https://${vercelHost}` : undefined, requestFallback]) {
    if (!value) continue
    try {
      const origin = new URL(value).origin
      if (origin.startsWith("https://") || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
        return origin
      }
    } catch {
      // Try the next trusted deployment source.
    }
  }
  throw new Error("No trusted application origin is configured")
}

export function constantTimeSecretEqual(actual: string | null, expected?: string): boolean {
  if (!actual || !expected) return false
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function isAdminActor(staff: StaffIdentity): boolean {
  const role = staff.employee?.role?.toLowerCase()
  return normalizeEmail(staff.email) === OWNER_EMAIL || role === "admin" || role === "owner"
}

export function isPrivilegedTarget(target: AccessTarget, primaryAdminId?: string | null): boolean {
  const role = target.role?.toLowerCase()
  return target.id === primaryAdminId
    || normalizeEmail(target.email) === OWNER_EMAIL
    || role === "admin"
    || role === "owner"
}

export function isProtectedOwnerTarget(target: AccessTarget, primaryAdminId?: string | null): boolean {
  return target.id === primaryAdminId
    || normalizeEmail(target.email) === OWNER_EMAIL
    || target.role?.toLowerCase() === "owner"
}

export function canManageAccessTarget(
  staff: StaffIdentity,
  target: AccessTarget,
  primaryAdminId?: string | null,
): boolean {
  if (!staff.isManager) return false
  return !isPrivilegedTarget(target, primaryAdminId) || isAdminActor(staff)
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; retryAfter: number } {
  const existing = rateLimits.get(key)
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing

  bucket.count += 1
  rateLimits.set(key, bucket)

  if (rateLimits.size > 2_000) {
    for (const [bucketKey, value] of rateLimits) {
      if (value.resetAt <= now) rateLimits.delete(bucketKey)
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  }
}

export function normalizeNotificationText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>&]/g, "")
    .trim()
    .slice(0, maxLength)
}

export function normalizeEmployeeIds(value: unknown, maxItems = 200): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) return null
  const ids = [...new Set(value)]
  return ids.every(isUuid) ? ids : null
}

const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
]

export function isAllowedPushEndpoint(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
}

export function isPrivilegedEmployeeRole(role: unknown): boolean {
  return typeof role === "string" && ["admin", "owner"].includes(role.toLowerCase())
}

export function findDifferentEmployeeIdentity<T extends { id: string }>(
  rows: T[],
  targetEmployeeId: string,
): T | null {
  return rows.find(row => row.id !== targetEmployeeId) ?? null
}

export function resetSecurityRateLimitsForTests(): void {
  rateLimits.clear()
}
