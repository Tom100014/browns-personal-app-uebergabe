import { NextRequest } from "next/server"
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js"
import webpush from "web-push"
import { getCurrentStaff } from "@/lib/staff"
import { formatDayLabel, rankCandidates } from "@/lib/coverage"
import { isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"
import { sendEmail } from "@/lib/email"
import { sendWhatsApp, normalizePhone } from "@/lib/whatsapp"
import type { Employee, Shift } from "@/types"

export const runtime = "nodejs"

type AbsenceRow = {
  id: string
  employee_id: string
  type: string
  start_date: string
  end_date: string
  status: string
}

type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
  employee_id: string | null
}

const hhmm = (value?: string | null) => String(value ?? "").slice(0, 5)

async function samePositionOnly(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from("settings").select("value").eq("key", "automation").maybeSingle()
  try {
    return data?.value ? Boolean(JSON.parse(data.value).samePositionOnly) : false
  } catch {
    return false
  }
}

async function openCoverageRequest(
  admin: SupabaseClient,
  shift: Shift,
  reason: string,
  absenceId: string | null,
  employees: Employee[],
  allShifts: Shift[],
  absences: AbsenceRow[],
  positionOnly: boolean,
): Promise<"opened" | "duplicate"> {
  const { data: existing, error: existingError } = await admin.from("coverage_requests")
    .select("id")
    .eq("shift_id", shift.id)
    .neq("status", "cancelled")
    .limit(1)
  if (existingError) throw new Error("coverage_lookup_failed")
  if ((existing ?? []).length > 0) return "duplicate"

  const candidates = rankCandidates(
    { date: shift.date, start_time: shift.start_time, end_time: shift.end_time, position: shift.position },
    employees,
    allShifts,
    absences,
    shift.employee_id ?? "",
    positionOnly,
  )
  const original = employees.find(employee => employee.id === shift.employee_id)
  const suggested = candidates[0] ?? null
  const { data: request, error } = await admin.from("coverage_requests").insert({
    shift_id: shift.id,
    absence_id: absenceId,
    original_employee_id: shift.employee_id,
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    position: shift.position,
    reason,
    status: "open",
    suggested_employee_id: suggested?.id ?? null,
  }).select("id").single()
  if (error || !request) throw new Error("coverage_insert_failed")

  const { error: shiftError } = await admin.from("shifts").update({ status: "absent" }).eq("id", shift.id)
  if (shiftError) {
    await admin.from("coverage_requests").delete().eq("id", request.id)
    throw new Error("shift_update_failed")
  }

  const content = `Ersatz gesucht: ${original?.name ?? "Ein Mitarbeiter"} ist für ${shift.position} am ${formatDayLabel(shift.date)} ${hhmm(shift.start_time)}-${hhmm(shift.end_time)} Uhr nicht verfügbar. ${suggested ? `Vorschlag: ${suggested.name}. ` : ""}Wer kann übernehmen?`
  const { error: messageError } = await admin.from("messages").insert({
    employee_id: null,
    content,
    type: "coverage_request",
    meta: {
      request_id: request.id,
      candidate_ids: candidates.map(candidate => candidate.id),
      suggested_id: suggested?.id ?? null,
    },
    created_at: new Date().toISOString(),
  })
  if (messageError) {
    await Promise.all([
      admin.from("shifts").update({ status: shift.status }).eq("id", shift.id),
      admin.from("coverage_requests").delete().eq("id", request.id),
    ])
    throw new Error("coverage_message_failed")
  }
  return "opened"
}

async function sendCoveragePush(admin: SupabaseClient, opened: number) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey || opened < 1) return

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@browns.at", publicKey, privateKey)
  const [{ data: subscriptions }, { data: mutedEmployees }] = await Promise.all([
    admin.from("push_subscriptions").select("endpoint,p256dh,auth,employee_id"),
    admin.from("employees").select("id").eq("notifications_enabled", false),
  ])
  const muted = new Set((mutedEmployees ?? []).map(row => row.id))
  const list = ((subscriptions ?? []) as PushSubscriptionRow[]).filter(row => !row.employee_id || !muted.has(row.employee_id))
  const payload = JSON.stringify({
    title: "Ersatz gesucht",
    body: opened === 1 ? "Eine Schicht braucht Vertretung." : `${opened} Schichten brauchen Vertretung.`,
    url: "/portal/vertretung",
    tag: "coverage",
  })
  const dead: string[] = []
  await Promise.all(list.map(async subscription => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      )
    } catch (cause) {
      const status = (cause as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) dead.push(subscription.endpoint)
    }
  }))
  if (dead.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", dead)
}

async function dispatchMultiChannelNotifications(
  admin: SupabaseClient,
  targetShifts: Shift[],
  employees: Employee[],
): Promise<{ recipientCount: number; emailSent: boolean; whatsappSent: boolean }> {
  if (targetShifts.length === 0 || employees.length === 0) {
    return { recipientCount: 0, emailSent: false, whatsappSent: false }
  }

  const candidateMap = new Map<string, Employee>()
  for (const shift of targetShifts) {
    const origId = shift.employee_id
    for (const emp of employees) {
      if (emp.id !== origId && emp.notifications_enabled !== false) {
        candidateMap.set(emp.id, emp)
      }
    }
  }

  const candidateList = Array.from(candidateMap.values())
  if (candidateList.length === 0) return { recipientCount: 0, emailSent: false, whatsappSent: false }

  const shiftInfo = targetShifts
    .map(s => `• ${s.position}: ${formatDayLabel(s.date)} von ${hhmm(s.start_time)} bis ${hhmm(s.end_time)} Uhr`)
    .join("\n")

  const origEmp = employees.find(e => e.id === targetShifts[0]?.employee_id)
  const subject = `🆘 ERSATZ GESUCHT: ${targetShifts[0]?.position || "Schicht"} am ${formatDayLabel(targetShifts[0]?.date || "")}`

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://browns-perso.vercel.app"
  const textBody =
    `Hallo,\n\n` +
    `${origEmp?.name ?? "Ein Mitarbeiter"} fällt aus. Folgende Schicht(en) benötigen dringend eine Vertretung:\n\n` +
    `${shiftInfo}\n\n` +
    `Wer kann einspringen? Klicke hier, um die Schicht im Browns Perso Portal zu übernehmen:\n` +
    `${baseUrl}/portal/vertretung\n\n` +
    `Vielen Dank für deine Unterstützung!\n` +
    `Dein Browns Lounge Team`

  // 1. Send Emails
  const emailTargets = candidateList.map(e => e.email).filter(Boolean)
  let emailSent = false
  if (emailTargets.length > 0) {
    const res = await sendEmail(emailTargets, subject, textBody, "/portal/vertretung")
    emailSent = res.success
  }

  // 2. Send WhatsApp
  const phoneTargets = candidateList
    .map(e => e.phone ? normalizePhone(e.phone) : null)
    .filter((p): p is string => Boolean(p))

  let whatsappSent = false
  if (phoneTargets.length > 0) {
    await sendWhatsApp(phoneTargets, subject, textBody)
    whatsappSent = true
  }

  return { recipientCount: candidateList.length, emailSent, whatsappSent }
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })
  const limited = await enforceRateLimit(request, "coverage-request", 8, 10 * 60_000, staff.userId)
  if (limited) return limited

  const input = await request.json().catch(() => null) as { absenceId?: unknown; shiftId?: unknown } | null
  const absenceId = isUuid(input?.absenceId) ? input.absenceId : null
  const shiftId = isUuid(input?.shiftId) ? input.shiftId : null
  if ((!absenceId && !shiftId) || (absenceId && shiftId)) {
    return jsonNoStore({ error: "Genau eine Abwesenheit oder Schicht ist erforderlich" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })
  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let targetShifts: Shift[] = []
  let reason = "abgegeben"
  if (absenceId) {
    const { data: absence } = await admin.from("absences").select("id,employee_id,type,start_date,end_date,status").eq("id", absenceId).maybeSingle()
    if (!absence) return jsonNoStore({ error: "Abwesenheit nicht gefunden" }, { status: 404 })
    if (!staff.isManager && absence.employee_id !== staff.employee?.id) {
      return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
    }
    reason = absence.type
    const { data } = await admin.from("shifts").select("*")
      .eq("employee_id", absence.employee_id)
      .gte("date", absence.start_date)
      .lte("date", absence.end_date)
      .neq("status", "absent")
    targetShifts = (data ?? []) as Shift[]
  } else {
    const { data: shift } = await admin.from("shifts").select("*").eq("id", shiftId).maybeSingle()
    if (!shift) return jsonNoStore({ error: "Schicht nicht gefunden" }, { status: 404 })
    if (!staff.isManager && shift.employee_id !== staff.employee?.id) {
      return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
    }
    targetShifts = [shift as Shift]
  }

  if (targetShifts.length === 0) return jsonNoStore({ ok: true, opened: 0 })
  const dates = [...new Set(targetShifts.map(shift => shift.date))].sort()
  const [{ data: employees }, { data: shifts }, { data: absences }, positionOnly] = await Promise.all([
    admin.from("employees").select("*"),
    admin.from("shifts").select("*").in("date", dates),
    admin.from("absences").select("id,employee_id,type,start_date,end_date,status")
      .lte("start_date", dates[dates.length - 1])
      .gte("end_date", dates[0]),
    samePositionOnly(admin),
  ])

  if (!await writeSecurityAudit(staff, "Vertretung angefragt", { absenceId, shiftId, targetCount: targetShifts.length })) {
    return jsonNoStore({ error: "Sicherheitsprotokoll nicht verfügbar" }, { status: 503 })
  }

  let opened = 0
  let duplicates = 0
  try {
    for (const shift of targetShifts) {
      const result = await openCoverageRequest(
        admin,
        shift,
        reason,
        absenceId,
        (employees ?? []) as Employee[],
        (shifts ?? []) as Shift[],
        (absences ?? []) as AbsenceRow[],
        positionOnly,
      )
      if (result === "opened") opened += 1
      else duplicates += 1
    }
  } catch {
    return jsonNoStore({ error: "Die Vertretungsanfrage konnte nicht vollständig gespeichert werden. Bitte erneut versuchen oder die Leitung informieren." }, { status: 500 })
  }

  let multiChannelResult = { recipientCount: 0, emailSent: false, whatsappSent: false }
  if (opened > 0) {
    await sendCoveragePush(admin, opened)
    multiChannelResult = await dispatchMultiChannelNotifications(admin, targetShifts, (employees ?? []) as Employee[])
  }

  return jsonNoStore({
    ok: true,
    opened,
    duplicates,
    channels: {
      push: true,
      email: multiChannelResult.emailSent,
      whatsapp: multiChannelResult.whatsappSent,
    },
    recipientCount: multiChannelResult.recipientCount,
  })
}
