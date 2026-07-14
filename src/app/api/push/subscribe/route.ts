import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })

  const { endpoint, keys, userAgent } = await request.json().catch(() => ({}))
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Ungültiges Abo" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } })
  await admin.from("push_subscriptions").upsert({
    employee_id: staff.employee?.id ?? null,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent ?? null,
  }, { onConflict: "endpoint" })

  return NextResponse.json({ ok: true })
}
