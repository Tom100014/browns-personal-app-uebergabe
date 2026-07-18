import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { isAllowedPushEndpoint } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

const PUSH_KEY = /^[A-Za-z0-9_-]{16,512}={0,2}$/

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })
  if (!staff.employee?.id) return jsonNoStore({ error: "Kein Mitarbeiterkonto verknüpft" }, { status: 409 })

  const limited = await enforceRateLimit(request, "push-subscribe", 12, 10 * 60_000, staff.userId)
  if (limited) return limited

  const input = await request.json().catch(() => null)
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint.trim() : ""
  const p256dh = typeof input?.keys?.p256dh === "string" ? input.keys.p256dh : ""
  const auth = typeof input?.keys?.auth === "string" ? input.keys.auth : ""
  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch {
    return jsonNoStore({ error: "Ungültiges Abo" }, { status: 400 })
  }
  if (endpoint.length > 2048 || !isAllowedPushEndpoint(endpointUrl) || !PUSH_KEY.test(p256dh) || !PUSH_KEY.test(auth)) {
    return jsonNoStore({ error: "Ungültiges Abo" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null
  const { error } = await admin.from("push_subscriptions").upsert({
    employee_id: staff.employee.id,
    endpoint: endpointUrl.toString(),
    p256dh,
    auth,
    user_agent: userAgent,
  }, { onConflict: "endpoint" })
  if (error) return jsonNoStore({ error: "Abo konnte nicht gespeichert werden" }, { status: 500 })

  return jsonNoStore({ ok: true })
}
