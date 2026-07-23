import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"
import { formatDayLabel } from "@/lib/coverage"

export const runtime = "nodejs"

const hhmm = (value?: string | null) => String(value ?? "").slice(0, 5)

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff || !staff.isManager) {
    return jsonNoStore({ error: "Nur für Leitung/Admin zugänglich" }, { status: 403 })
  }

  const limited = await enforceRateLimit(request, "coverage-manage", 15, 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null) as {
    action?: string
    requestId?: string
    date?: string
    startTime?: string
    endTime?: string
    position?: string
    reason?: string
  } | null

  if (!body || !body.action || !isUuid(body.requestId)) {
    return jsonNoStore({ error: "Ungültige Parameter" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: reqData, error: reqErr } = await admin
    .from("coverage_requests")
    .select("*, original_employee:employees!original_employee_id(name)")
    .eq("id", body.requestId)
    .maybeSingle()

  if (reqErr || !reqData) {
    return jsonNoStore({ error: "Vertretungsanfrage nicht gefunden" }, { status: 404 })
  }

  if (body.action === "cancel") {
    // Stornieren
    const { error } = await admin
      .from("coverage_requests")
      .update({ status: "cancelled" })
      .eq("id", body.requestId)

    if (error) return jsonNoStore({ error: "Stornieren fehlgeschlagen: " + error.message }, { status: 500 })

    // Optional: Update associated message in chat
    const { data: msgList } = await admin
      .from("messages")
      .select("id, meta")
      .eq("type", "coverage_request")

    const matchingMsg = (msgList ?? []).find(m => m.meta?.request_id === body.requestId)
    if (matchingMsg) {
      await admin
        .from("messages")
        .update({
          content: `🚫 Storniert durch Leitung: Vertretungsanfrage für ${reqData.position} am ${formatDayLabel(reqData.date)} wurde aufgehoben.`,
        })
        .eq("id", matchingMsg.id)
    }

    await writeSecurityAudit(staff, "Vertretungsanfrage storniert", { requestId: body.requestId })
    return jsonNoStore({ ok: true, message: "Vertretungsanfrage erfolgreich storniert." })
  }

  if (body.action === "delete") {
    // Löschen
    // 1. Delete associated messages
    const { data: msgList } = await admin.from("messages").select("id, meta").eq("type", "coverage_request")
    const matchingMsgs = (msgList ?? []).filter(m => m.meta?.request_id === body.requestId)
    for (const m of matchingMsgs) {
      await admin.from("messages").delete().eq("id", m.id)
    }

    // 2. Delete coverage offers
    await admin.from("coverage_offers").delete().eq("request_id", body.requestId)

    // 3. Delete coverage request
    const { error } = await admin.from("coverage_requests").delete().eq("id", body.requestId)
    if (error) return jsonNoStore({ error: "Löschen fehlgeschlagen: " + error.message }, { status: 500 })

    await writeSecurityAudit(staff, "Vertretungsanfrage gelöscht", { requestId: body.requestId })
    return jsonNoStore({ ok: true, message: "Vertretungsanfrage gelöscht." })
  }

  if (body.action === "edit") {
    // Bearbeiten
    const newDate = body.date || reqData.date
    const newStart = body.startTime || reqData.start_time
    const newEnd = body.endTime || reqData.end_time
    const newPos = body.position || reqData.position
    const newReason = body.reason || reqData.reason

    const { error } = await admin
      .from("coverage_requests")
      .update({
        date: newDate,
        start_time: newStart,
        end_time: newEnd,
        position: newPos,
        reason: newReason,
      })
      .eq("id", body.requestId)

    if (error) return jsonNoStore({ error: "Bearbeiten fehlgeschlagen: " + error.message }, { status: 500 })

    // Also update associated message in chat
    const { data: msgList } = await admin.from("messages").select("id, meta").eq("type", "coverage_request")
    const matchingMsg = (msgList ?? []).find(m => m.meta?.request_id === body.requestId)
    if (matchingMsg) {
      const origName = reqData.original_employee?.name || "Ein Mitarbeiter"
      const content = `🆘 Ersatz gesucht: ${origName} ist für ${newPos} am ${formatDayLabel(newDate)} ${hhmm(newStart)}–${hhmm(newEnd)} Uhr nicht verfügbar. Wer kann übernehmen?`
      await admin.from("messages").update({ content }).eq("id", matchingMsg.id)
    }

    await writeSecurityAudit(staff, "Vertretungsanfrage bearbeitet", { requestId: body.requestId, newDate, newPos })
    return jsonNoStore({ ok: true, message: "Vertretungsanfrage angepasst." })
  }

  return jsonNoStore({ error: "Unbekannte Aktion" }, { status: 400 })
}
