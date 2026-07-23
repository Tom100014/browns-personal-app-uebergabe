import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours } from "@/lib/hours"
import { isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff || !staff.isManager) {
    return jsonNoStore({ error: "Nur für Leitung/Admin zugänglich" }, { status: 403 })
  }

  const limited = await enforceRateLimit(request, "retroactive-time-entry", 20, 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null) as {
    employeeId?: string
    date?: string
    clockIn?: string
    clockOut?: string
    breakMinutes?: number
    note?: string
  } | null

  if (!body || !isUuid(body.employeeId) || !body.date || !body.clockIn) {
    return jsonNoStore({ error: "Mitarbeiter, Datum und Startzeit sind erforderlich." }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const clockInFormatted = body.clockIn.slice(0, 5)
  const clockOutFormatted = body.clockOut ? body.clockOut.slice(0, 5) : null
  const breakMins = Number.isInteger(body.breakMinutes) && body.breakMinutes! >= 0 ? body.breakMinutes! : 0

  let totalHours = 0
  if (clockOutFormatted) {
    totalHours = Math.round(entryHours({ clock_in: clockInFormatted, clock_out: clockOutFormatted, break_minutes: breakMins }) * 100) / 100
  }

  const { data, error } = await admin
    .from("time_entries")
    .insert({
      employee_id: body.employeeId,
      date: body.date,
      clock_in: clockInFormatted,
      clock_out: clockOutFormatted,
      break_minutes: breakMins,
      total_hours: totalHours > 0 ? totalHours : null,
      auto_closed: false,
      created_at: new Date().toISOString(),
    })
    .select("*, employee:employees(*)")
    .single()

  if (error) {
    return jsonNoStore({ error: "Nachträgliches Einstempeln fehlgeschlagen: " + error.message }, { status: 400 })
  }

  const empName = data.employee?.name || body.employeeId
  await writeSecurityAudit(staff, "Nachträgliche Zeiterfassung durch Admin", {
    employeeId: body.employeeId,
    employeeName: empName,
    date: body.date,
    clockIn: clockInFormatted,
    clockOut: clockOutFormatted,
    note: body.note || "Nachtrag durch Leitung",
  })

  return jsonNoStore({ ok: true, entry: data, message: `Zeiterfassung für ${empName} nachträglich eingetragen.` })
}
