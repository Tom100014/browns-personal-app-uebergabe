import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import webpush from "web-push"
import { jsonNoStore } from "@/lib/security"

export const runtime = "nodejs"

type Shift = { id: string; employee_id: string | null; date: string; start_time: string; position: string; employee?: { name?: string } }
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; employee_id: string | null }

// Checks for missed punches (started shifts without clock-in) and sends admin notifications
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!url || !sr || !pub || !priv) {
    return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })
  }
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })
  const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }))
  const nowHHMM = nowBerlin.getHours().toString().padStart(2, "0") + ":" + nowBerlin.getMinutes().toString().padStart(2, "0")

  // Fetch today's shifts that have started
  const { data: todayShifts } = await admin
    .from("shifts")
    .select("id,employee_id,date,start_time,position,employee:employees(name)")
    .eq("date", today)
    .neq("status", "absent")

  // Fetch today's time entries (who has clocked in)
  const { data: todayEntries } = await admin
    .from("time_entries")
    .select("employee_id")
    .eq("date", today)

  const shifts = (todayShifts ?? []) as Shift[]
  const clockedInIds = new Set((todayEntries ?? []).map((e: { employee_id: string }) => e.employee_id))

  // Find missed punches: shifts that have started but no clock-in
  const missedPunches = shifts.filter(s =>
    s.employee_id
    && s.start_time.slice(0, 5) <= nowHHMM
    && !clockedInIds.has(s.employee_id)
  )

  if (missedPunches.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: 0 })
  }

  // Check if we already sent a notification for these shifts today
  const { data: sentNotifications } = await admin
    .from("notification_dispatches")
    .select("dedupe_key")
    .eq("dedupe_key", `missed-punch:${today}`)
    .maybeSingle()

  // If already notified, don't spam
  if (sentNotifications) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedPunches.length, alreadyNotified: true })
  }

  // Get all admin users to notify
  const { data: admins } = await admin
    .from("employees")
    .select("id,email,phone,role,notifications_enabled")
    .in("role", ["owner", "admin", "manager"])

  if (!admins || admins.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedPunches.length })
  }

  // Get admin subscriptions
  const adminIds = admins.map(a => a.id)
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,employee_id")
    .in("employee_id", adminIds)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedPunches.length })
  }

  // Prepare notification payload
  const title = `⏰ ${missedPunches.length} Mitarbeiter vergessen zu stempeln`
  const body = missedPunches.length === 1
    ? `${missedPunches[0].employee?.name} – Schicht: ${missedPunches[0].position}`
    : `${missedPunches.length} Mitarbeiter · Details im Dashboard`

  // Send push notifications using webpush
  webpush.setVapidDetails("mailto:admin@browns.at", pub!, priv!)
  const payload = JSON.stringify({
    title,
    body,
    url: "/dashboard",
    tag: "missed-punch",
  })

  let sent = 0
  const dead: string[] = []
  for (const subscription of subs as Sub[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      )
      sent++
    } catch (cause: unknown) {
      const statusCode = (cause as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) dead.push(subscription.endpoint)
    }
  }

  if (dead.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", dead)
  }

  // Record that we sent this notification (deduplication key)
  const { error: dispatchError } = await admin.from("notification_dispatches").insert({
    dedupe_key: `missed-punch:${today}`,
  })
  if (dispatchError) {
    // Ignore errors - deduplication might already be set from the push/notify endpoint
  }

  return NextResponse.json({ ok: true, notified: sent, missedCount: missedPunches.length, removed: dead.length })
}
