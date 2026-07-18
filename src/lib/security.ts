import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { consumeRateLimit, getTrustedClientIp, isSameOriginMutation } from "@/lib/security-core"

export function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  return response
}

export function rejectCrossOriginMutation(request: NextRequest): NextResponse | null {
  return isSameOriginMutation(request)
    ? null
    : jsonNoStore({ error: "Ungültige Anfragequelle" }, { status: 403 })
}

export async function enforceRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  principal?: string,
): Promise<NextResponse | null> {
  const ip = getTrustedClientIp(request.headers) ?? "unknown"
  const rawKey = `${ip}:${principal ?? "anonymous"}`
  const key = createHash("sha256").update(rawKey).digest("hex")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let result: { allowed: boolean; remaining: number; retryAfter: number }
  if (url && serviceKey) {
    const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.rpc("consume_security_rate_limit", {
      p_scope: scope,
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1_000),
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) {
      if (process.env.NODE_ENV === "production") {
        return jsonNoStore({ error: "Sicherheitsprüfung vorübergehend nicht verfügbar" }, { status: 503 })
      }
      result = consumeRateLimit(`${scope}:${key}`, limit, windowMs)
    } else {
      result = {
        allowed: row.allowed === true,
        remaining: Number(row.remaining ?? 0),
        retryAfter: Math.max(1, Number(row.retry_after ?? 1)),
      }
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      return jsonNoStore({ error: "Sicherheitsprüfung nicht konfiguriert" }, { status: 503 })
    }
    result = consumeRateLimit(`${scope}:${key}`, limit, windowMs)
  }

  if (result.allowed) return null
  const response = jsonNoStore({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429 })
  response.headers.set("Retry-After", String(result.retryAfter))
  return response
}

export async function writeSecurityAudit(
  actor: { userId: string; email?: string | null },
  action: string,
  detail: Record<string, unknown> = {},
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return false
  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.from("audit_log").insert({
    actor: actor.email || actor.userId,
    action: action.slice(0, 160),
    detail: JSON.stringify({ actorUserId: actor.userId, ...detail }).slice(0, 4_000),
  })
  return !error
}
