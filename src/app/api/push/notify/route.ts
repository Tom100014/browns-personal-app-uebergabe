import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import webpush from "web-push"
import { getCurrentStaff } from "@/lib/staff"
import { sendEmail } from "@/lib/email"
import { sendWhatsApp, normalizePhone, isWhatsAppConfigured } from "@/lib/whatsapp"

export const runtime = "nodejs"

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; employee_id: string | null }

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })

  const { title, body, url, tag, employeeIds, audience, important } = await request.json().catch(() => ({}))
  if (!title || !body) return NextResponse.json({ error: "title und body erforderlich" }, { status: 400 })

  const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@browns.at"
  if (!sUrl || !serviceKey || !pub || !priv) {
    return NextResponse.json({ error: "Push nicht konfiguriert" }, { status: 500 })
  }

  webpush.setVapidDetails(subject, pub, priv)
  const admin = createAdminClient(sUrl, serviceKey, { auth: { persistSession: false } })

  // Resolve target subscriptions.
  let query = admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,employee_id")
  if (audience === "self") {
    query = staff.employee?.id
      ? query.eq("employee_id", staff.employee.id)
      : query.is("employee_id", null)
  } else if (Array.isArray(employeeIds) && employeeIds.length > 0 && audience !== "all") {
    query = query.in("employee_id", employeeIds)
  }
  const { data: subs } = await query

  // Stummgeschaltete Mitarbeiter ausschließen (außer bei wichtigen Meldungen).
  const muted = new Set<string>()
  if (!important) {
    const { data: mutedRows } = await admin.from("employees").select("id").eq("notifications_enabled", false)
    for (const m of mutedRows ?? []) muted.add((m as { id: string }).id)
  }
  const list = ((subs ?? []) as Sub[]).filter(s => !s.employee_id || !muted.has(s.employee_id))

  const payload = JSON.stringify({ title, body, url: url || "/", tag })
  const dead: string[] = []

  await Promise.all(list.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) dead.push(s.endpoint)
    }
  }))

  // Drop expired/invalid subscriptions.
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead)

  // E-Mail- & WhatsApp-Kanäle (best effort; No-Op bis konfiguriert).
  let recipients: { email?: string | null; phone?: string | null; notifications_enabled?: boolean | null }[] = []
  if (Array.isArray(employeeIds) && employeeIds.length > 0 && audience !== "all") {
    const { data } = await admin.from("employees").select("email,phone,notifications_enabled").in("id", employeeIds)
    recipients = data ?? []
  } else if (audience === "all") {
    const { data } = await admin.from("employees").select("email,phone,notifications_enabled")
    recipients = data ?? []
  }
  if (!important) recipients = recipients.filter(r => r.notifications_enabled !== false)
  const emails = recipients.map(r => r.email).filter(Boolean) as string[]

  // WhatsApp nur, wenn konfiguriert UND in den Einstellungen aktiviert.
  let waSent = 0
  if (isWhatsAppConfigured()) {
    const { data: waRow } = await admin.from("settings").select("value").eq("key", "whatsapp_enabled").maybeSingle()
    if (waRow?.value === "true") {
      const phones = [...new Set(recipients.map(r => normalizePhone(r.phone ?? "")).filter(Boolean) as string[])]
      await sendWhatsApp(phones, title, body)
      waSent = phones.length
    }
  }

  await sendEmail(emails, title, body, url)

  return NextResponse.json({ ok: true, sent: list.length, removed: dead.length, whatsapp: waSent })
}
