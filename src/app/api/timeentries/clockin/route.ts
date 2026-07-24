import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours } from "@/lib/hours"
import { ipAllowed } from "@/lib/wifi"
import { getTrustedClientIp, isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

export const runtime = "nodejs"

const TIME_ZONE = "Europe/Berlin"

function localDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE })
}

function localTime(): string {
  return new Date().toLocaleTimeString("de-DE", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) return null
  return createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })

  const limited = await enforceRateLimit(request, "clock-in", 12, 5 * 60_000, staff.userId)
  if (limited) return limited

  const input = await request.json().catch(() => null)
  const employeeId = input?.employeeId
  if (!isUuid(employeeId)) return jsonNoStore({ error: "Gültige employeeId erforderlich" }, { status: 400 })
  if (employeeId !== staff.employee?.id && !staff.isManager) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const admin = getAdminClient()
  if (!admin) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const { data: setting } = await admin.from("settings")
    .select("value")
    .eq("key", "wifi_ip")
    .maybeSingle()

  const wifiIp = (setting?.value ?? "").trim()
  const clientIp = getTrustedClientIp(request.headers)
  if (wifiIp && (!clientIp || !ipAllowed(clientIp, wifiIp))) {
    return jsonNoStore({ error: "location" }, { status: 403 })
  }

  const { data: openEntry } = await admin.from("time_entries")
    .select("id")
    .eq("employee_id", employeeId)
    .is("clock_out", null)
    .limit(1)
    .maybeSingle()
  if (openEntry) return jsonNoStore({ error: "Bereits eingestempelt" }, { status: 409 })

  const { data, error } = await admin.from("time_entries")
    .insert({
      employee_id: employeeId,
      date: localDate(),
      clock_in: localTime(),
      break_minutes: 0,
      created_at: new Date().toISOString(),
    })
    .select("*, employee:employees(*)")
    .single()

  if (error?.code === "23505") return jsonNoStore({ error: "Bereits eingestempelt" }, { status: 409 })
  if (error) return jsonNoStore({ error: "Einstempeln fehlgeschlagen: " + error.message }, { status: 400 })
  return jsonNoStore({ ok: true, entry: data })
}

/** Fail-Safe Admin Ausstempeln (PATCH): Bypasst RLS komplett für 100% Ausstempel-Garantie. */
export async function PATCH(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })

  const limited = await enforceRateLimit(request, "clock-out", 12, 5 * 60_000, staff.userId)
  if (limited) return limited

  const input = await request.json().catch(() => null)
  const entryId = input?.entryId
  const breakMinutes = input?.breakMinutes ?? 0
  const shiftRevenueRaw = input?.shiftRevenue ?? input?.revenue
  
  const parsedRev = typeof shiftRevenueRaw === "number" ? shiftRevenueRaw : parseFloat(String(shiftRevenueRaw ?? "0"))
  const finalRevenue = isNaN(parsedRev) || parsedRev < 0 ? 0 : parsedRev

  if (!isUuid(entryId)) {
    return jsonNoStore({ error: "Gültige entryId erforderlich" }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const { data: entry, error: lookupError } = await admin.from("time_entries")
    .select("id,employee_id,clock_in,clock_out,break_minutes")
    .eq("id", entryId)
    .maybeSingle()

  if (lookupError || !entry) return jsonNoStore({ error: "Stempelung nicht gefunden" }, { status: 404 })
  if (entry.employee_id !== staff.employee?.id && !staff.isManager) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const clockOut = localTime()
  const total = entryHours({ clock_in: entry.clock_in, clock_out: clockOut, break_minutes: breakMinutes })
  const { data, error } = await admin.from("time_entries")
    .update({
      clock_out: clockOut,
      break_minutes: breakMinutes,
      total_hours: Math.round(total * 100) / 100,
      shift_revenue: Math.round(finalRevenue * 100) / 100,
    })
    .eq("id", entry.id)
    .select("*, employee:employees(*)")
    .maybeSingle()

  if (error) return jsonNoStore({ error: "Ausstempeln fehlgeschlagen: " + error.message }, { status: 400 })
  return jsonNoStore({ ok: true, entry: data })
}
