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

  // Vergessene Stempelungen: begonnene Schicht ohne Einstempelung. Pro
  // Mitarbeiter nur einmal (auch bei mehreren Schichten am selben Tag).
  const missedByEmployee = new Map<string, Shift>()
  for (const s of shifts) {
    if (s.employee_id && s.start_time.slice(0, 5) <= nowHHMM && !clockedInIds.has(s.employee_id)) {
      if (!missedByEmployee.has(s.employee_id)) missedByEmployee.set(s.employee_id, s)
    }
  }

  if (missedByEmployee.size === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: 0 })
  }

  // Deduplizierung pro Mitarbeiter pro Tag: bereits benachrichtigte überspringen,
  // damit ein stündlicher Cron nicht mehrfach für denselben Fall meldet.
  const dedupeKeys = [...missedByEmployee.keys()].map(id => `missed-punch:${today}:${id}`)
  const { data: alreadySent } = await admin
    .from("notification_dispatches")
    .select("dedupe_key")
    .in("dedupe_key", dedupeKeys)
  const sentKeys = new Set((alreadySent ?? []).map((r: { dedupe_key: string }) => r.dedupe_key))

  const newMissed = [...missedByEmployee.entries()].filter(([id]) => !sentKeys.has(`missed-punch:${today}:${id}`))
  if (newMissed.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedByEmployee.size, alreadyNotified: true })
  }

  // Erst den Dispatch beanspruchen (verhindert Doppel-Push bei parallelen Läufen),
  // dann versenden. Nur tatsächlich neu beanspruchte Mitarbeiter werden gemeldet.
  const claimed: { id: string; shift: Shift }[] = []
  for (const [id, shift] of newMissed) {
    const { error: claimError } = await admin
      .from("notification_dispatches")
      .insert({ dedupe_key: `missed-punch:${today}:${id}` })
    if (!claimError) claimed.push({ id, shift })
  }
  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedByEmployee.size, alreadyNotified: true })
  }

  // Admins/Manager als Empfänger
  const { data: admins } = await admin
    .from("employees")
    .select("id,role")
    .in("role", ["owner", "admin", "manager"])

  const adminIds = (admins ?? []).map(a => a.id)
  const { data: subs } = adminIds.length
    ? await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,employee_id").in("employee_id", adminIds)
    : { data: [] }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, missedCount: missedByEmployee.size, newlyClaimed: claimed.length })
  }

  const title = claimed.length === 1
    ? "⏰ Vergessen zu stempeln"
    : `⏰ ${claimed.length} Mitarbeiter vergessen zu stempeln`
  const body = claimed.length === 1
    ? `${claimed[0].shift.employee?.name ?? "Mitarbeiter"} – Schicht seit ${claimed[0].shift.start_time.slice(0, 5)} Uhr (${claimed[0].shift.position})`
    : `${claimed.map(c => c.shift.employee?.name ?? "Mitarbeiter").join(", ")} · Details im Dashboard`

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@browns.at", pub!, priv!)
  const payload = JSON.stringify({ title, body, url: "/dashboard", tag: "missed-punch" })

  let sent = 0
  const dead: string[] = []
  for (const subscription of subs as Sub[]) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
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

  return NextResponse.json({ ok: true, notified: sent, missedCount: missedByEmployee.size, newlyClaimed: claimed.length, removed: dead.length })
}
