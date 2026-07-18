import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import webpush from "web-push"
import { getCurrentStaff } from "@/lib/staff"
import { sendEmail } from "@/lib/email"
import { sendWhatsApp, normalizePhone, isWhatsAppConfigured } from "@/lib/whatsapp"
import {
  isAdminActor,
  isUuid,
  isPrivilegedEmployeeRole,
  isProtectedOwnerTarget,
  normalizeEmail,
  normalizeEmployeeIds,
  normalizeNotificationText,
  toSameOriginPath,
} from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"

export const runtime = "nodejs"

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; employee_id: string | null }
type Recipient = {
  id: string
  email: string | null
  phone: string | null
  role: string
  notifications_enabled: boolean | null
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })

  const limited = await enforceRateLimit(request, "push-notify", 12, 60_000, staff.userId)
  if (limited) return limited

  const input = await request.json().catch(() => null)
  const title = normalizeNotificationText(input?.title, 100)
  const body = normalizeNotificationText(input?.body, 500)
  const tag = normalizeNotificationText(input?.tag, 64) || undefined
  const employeeIds = normalizeEmployeeIds(input?.employeeIds)
  const audience = input?.audience
  const important = input?.important === true
  const targetUrl = toSameOriginPath(input?.url, request.nextUrl.origin)
  const chatMessageId = isUuid(input?.chatMessageId) ? input.chatMessageId : null
  if (!title || !body || employeeIds === null || ![undefined, "self", "all"].includes(audience)) {
    return jsonNoStore({ error: "Ungültige Benachrichtigung" }, { status: 400 })
  }

  const selfOnly = audience === "self"
  const allEmployees = audience === "all"
  if (!selfOnly && !allEmployees && employeeIds.length === 0) {
    return jsonNoStore({ error: "Empfänger erforderlich" }, { status: 400 })
  }

  const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@browns.at"
  if (!sUrl || !serviceKey || !pub || !priv) {
    return jsonNoStore({ error: "Push nicht konfiguriert" }, { status: 500 })
  }
  const admin = createAdminClient(sUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // Employees may only notify selected colleagues about the exact chat message
  // they just stored. This keeps general broadcasts manager-only.
  let verifiedEmployeeChat = false
  if (!selfOnly && !allEmployees && !staff.isManager) {
    const employee = staff.employee
    const candidate = employee?.id
      && tag === "chat"
      && !important
      && targetUrl === "/portal/chat"
      && chatMessageId
      && title === normalizeNotificationText(`Team-Chat: ${employee.name}`, 100)
    if (candidate) {
      const { data: latest, error: latestError } = await admin.from("messages")
        .select("content,created_at")
        .eq("id", chatMessageId)
        .eq("employee_id", employee.id)
        .eq("type", "chat")
        .maybeSingle()
      const createdAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0
      const raw = typeof latest?.content === "string" ? latest.content.trim() : ""
      const expectedBody = normalizeNotificationText(raw.length > 120 ? `${raw.slice(0, 117)}...` : raw, 500)
      const now = Date.now()
      verifiedEmployeeChat = !latestError
        && createdAt > now - 120_000
        && createdAt < now + 5_000
        && body === expectedBody
    }
    if (!verifiedEmployeeChat) {
      return jsonNoStore({ error: "Nur die Leitung darf Benachrichtigungen versenden." }, { status: 403 })
    }
  }

  const adminActor = isAdminActor(staff)
  if (allEmployees && !adminActor) {
    return jsonNoStore({ error: "Nur ein Admin darf Rundmeldungen an alle versenden." }, { status: 403 })
  }
  if (!selfOnly && important && !adminActor) {
    return jsonNoStore({ error: "Nur ein Admin darf wichtige Rundmeldungen versenden." }, { status: 403 })
  }

  webpush.setVapidDetails(subject, pub, priv)
  let recipients: Recipient[] = []
  let subs: Sub[] = []

  if (selfOnly) {
    if (!staff.employee?.id) return jsonNoStore({ error: "Kein Mitarbeiterkonto verknüpft" }, { status: 409 })
    const query = admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,employee_id")
    const { data, error } = await query.eq("employee_id", staff.employee.id)
    if (error) return jsonNoStore({ error: "Empfänger konnten nicht geladen werden" }, { status: 500 })
    subs = (data ?? []) as Sub[]
  } else {
    let employeeQuery = admin.from("employees")
      .select("id,email,phone,role,notifications_enabled")
    if (!allEmployees) employeeQuery = employeeQuery.in("id", employeeIds)
    const { data, error } = await employeeQuery
    if (error) return jsonNoStore({ error: "Empfänger konnten nicht geladen werden" }, { status: 500 })

    const found = (data ?? []) as Recipient[]
    if (!allEmployees && found.length !== employeeIds.length) {
      return jsonNoStore({ error: "Mindestens ein Empfänger wurde nicht gefunden." }, { status: 400 })
    }

    let primaryAdminId: string | null = null
    if (!adminActor) {
      const { data: primaryAdmin, error: primaryAdminError } = await admin.from("settings")
        .select("value")
        .eq("key", "primary_admin_employee_id")
        .maybeSingle()
      if (primaryAdminError) return jsonNoStore({ error: "Empfänger konnten nicht geprüft werden" }, { status: 500 })
      primaryAdminId = primaryAdmin?.value ?? null
    }

    recipients = adminActor || verifiedEmployeeChat
      ? found
      : found.filter(employee => !isPrivilegedEmployeeRole(employee.role)
        && !isProtectedOwnerTarget(employee, primaryAdminId))
    if (!adminActor && !verifiedEmployeeChat && !allEmployees && recipients.length !== found.length) {
      return jsonNoStore({ error: "Manager dürfen keine Admin- oder Inhaberzugänge benachrichtigen." }, { status: 403 })
    }

    if (adminActor && allEmployees) {
      const { data: allSubs, error: subscriptionsError } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth,employee_id")
      if (subscriptionsError) return jsonNoStore({ error: "Empfänger konnten nicht geladen werden" }, { status: 500 })
      subs = (allSubs ?? []) as Sub[]
    } else if (recipients.length > 0) {
      const { data: selectedSubs, error: subscriptionsError } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth,employee_id")
        .in("employee_id", recipients.map(employee => employee.id))
      if (subscriptionsError) return jsonNoStore({ error: "Empfänger konnten nicht geladen werden" }, { status: 500 })
      subs = (selectedSubs ?? []) as Sub[]
    }
  }

  const muted = new Set(
    recipients.filter(employee => employee.notifications_enabled === false).map(employee => employee.id),
  )
  if (selfOnly && staff.employee?.notifications_enabled === false) muted.add(staff.employee.id)
  const list = important ? subs : subs.filter(subscription => !subscription.employee_id || !muted.has(subscription.employee_id))

  if (!selfOnly && !await writeSecurityAudit(staff, "Benachrichtigung freigegeben", {
    audience: allEmployees ? "all" : "selected",
    recipientCount: recipients.length,
    important,
  })) {
    return jsonNoStore({ error: "Sicherheitsprotokoll nicht verfügbar" }, { status: 503 })
  }
  if (verifiedEmployeeChat && chatMessageId) {
    const { error: claimError } = await admin.from("notification_dispatches").insert({
      dedupe_key: `chat:${chatMessageId}`,
    })
    if (claimError) {
      return jsonNoStore({ error: "Diese Chat-Benachrichtigung wurde bereits verarbeitet." }, { status: 409 })
    }
  }
  const payload = JSON.stringify({ title, body, url: targetUrl, tag })
  const dead: string[] = []
  let sent = 0

  for (let offset = 0; offset < list.length; offset += 25) {
    await Promise.all(list.slice(offset, offset + 25).map(async subscription => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        )
        sent += 1
      } catch (cause: unknown) {
        const statusCode = (cause as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) dead.push(subscription.endpoint)
      }
    }))
  }

  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead)

  let channelRecipients = selfOnly || verifiedEmployeeChat ? [] : recipients
  if (!important) channelRecipients = channelRecipients.filter(recipient => recipient.notifications_enabled !== false)
  const emails = [...new Set(channelRecipients.map(recipient => normalizeEmail(recipient.email)).filter(Boolean))]

  let waSent = 0
  if (!selfOnly && isWhatsAppConfigured()) {
    const { data: waRow } = await admin.from("settings").select("value").eq("key", "whatsapp_enabled").maybeSingle()
    if (waRow?.value === "true") {
      const phones = [...new Set(channelRecipients.map(recipient => normalizePhone(recipient.phone ?? "")).filter(Boolean) as string[])]
      await sendWhatsApp(phones, title, body)
      waSent = phones.length
    }
  }

  await sendEmail(emails, title, body, targetUrl)
  return jsonNoStore({ ok: true, sent, removed: dead.length, whatsapp: waSent })
}
