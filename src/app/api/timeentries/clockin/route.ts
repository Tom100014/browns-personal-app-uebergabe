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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })
  const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: setting, error: settingError } = await admin.from("settings")
    .select("value")
    .eq("key", "wifi_ip")
    .maybeSingle()
  if (settingError) return jsonNoStore({ error: "Standortprüfung nicht verfügbar" }, { status: 500 })

  const wifiIp = (setting?.value ?? "").trim()
  const clientIp = getTrustedClientIp(request.headers)
  if (wifiIp && (!clientIp || !ipAllowed(clientIp, wifiIp))) {
    return jsonNoStore({ error: "location" }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: openEntry, error: openEntryError } = await supabase.from("time_entries")
    .select("id")
    .eq("employee_id", employeeId)
    .is("clock_out", null)
    .limit(1)
    .maybeSingle()
  if (openEntryError) return jsonNoStore({ error: "Stempelstatus konnte nicht geprüft werden" }, { status: 500 })
  if (openEntry) return jsonNoStore({ error: "Bereits eingestempelt" }, { status: 409 })

  const { data, error } = await supabase.from("time_entries")
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
  if (error) return jsonNoStore({ error: "Einstempeln fehlgeschlagen" }, { status: 400 })
  return jsonNoStore({ ok: true, entry: data })
}

/** Secure server-side clock-out endpoint for callers migrating off direct table updates. */
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
  const shiftRevenue = typeof shiftRevenueRaw === "number" ? shiftRevenueRaw : parseFloat(String(shiftRevenueRaw ?? ""))

  if (!isUuid(entryId) || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
    return jsonNoStore({ error: "Gültige entryId und Pausenzeit erforderlich" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: revSetting } = await supabase.from("settings").select("value").eq("key", "require_shift_revenue").maybeSingle()
  const requireRevenueSetting = (revSetting?.value ?? "true") !== "false"

  if (requireRevenueSetting && (isNaN(shiftRevenue) || shiftRevenue < 0 || shiftRevenueRaw === undefined || shiftRevenueRaw === null || shiftRevenueRaw === "")) {
    return jsonNoStore({ error: "Bitte gib deinen erbrachten Schichtumsatz in € an (Pflichtangabe beim Ausstempeln)." }, { status: 400 })
  }
  const { data: entry, error: lookupError } = await supabase.from("time_entries")
    .select("id,employee_id,clock_in,clock_out,break_minutes")
    .eq("id", entryId)
    .maybeSingle()
  if (lookupError) return jsonNoStore({ error: "Stempelung konnte nicht geprüft werden" }, { status: 500 })
  if (!entry) return jsonNoStore({ error: "Stempelung nicht gefunden" }, { status: 404 })
  if (entry.employee_id !== staff.employee?.id && !staff.isManager) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }
  if (entry.clock_out) return jsonNoStore({ error: "Bereits ausgestempelt" }, { status: 409 })

  const clockOut = localTime()
  const total = entryHours({ clock_in: entry.clock_in, clock_out: clockOut, break_minutes: breakMinutes })
  const { data, error } = await supabase.from("time_entries")
    .update({
      clock_out: clockOut,
      break_minutes: breakMinutes,
      total_hours: Math.round(total * 100) / 100,
      shift_revenue: Math.round(shiftRevenue * 100) / 100,
    })
    .eq("id", entry.id)
    .is("clock_out", null)
    .select("*, employee:employees(*)")
    .maybeSingle()
  if (error) return jsonNoStore({ error: "Ausstempeln fehlgeschlagen" }, { status: 400 })
  if (!data) return jsonNoStore({ error: "Bereits ausgestempelt" }, { status: 409 })
  return jsonNoStore({ ok: true, entry: data })
}
