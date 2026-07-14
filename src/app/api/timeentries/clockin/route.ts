import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { ipAllowed } from "@/lib/wifi"

export const runtime = "nodejs"

// Serverseitiges Einstempeln inkl. WLAN-/Standortprüfung. Die Café-IP bleibt auf
// dem Server — der Client sendet nur seine eigene öffentliche IP.
export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })

  const { employeeId, clientIp } = await request.json().catch(() => ({}))
  if (!employeeId) return NextResponse.json({ error: "employeeId fehlt" }, { status: 400 })
  // Mitarbeiter dürfen nur sich selbst stempeln; Leitung darf für alle stempeln.
  if (employeeId !== staff.employee?.id && !staff.isManager) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: setting } = await supabase.from("settings").select("value").eq("key", "wifi_ip").maybeSingle()
  const wifiIp = (setting?.value ?? "").trim()
  if (wifiIp && (!clientIp || !ipAllowed(String(clientIp), wifiIp))) {
    return NextResponse.json({ error: "location" }, { status: 200 })
  }

  const TZ = "Europe/Berlin"
  const date = new Date().toLocaleDateString("en-CA", { timeZone: TZ })
  const clock_in = new Date().toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })

  const { data, error } = await supabase.from("time_entries")
    .insert({ employee_id: employeeId, date, clock_in, break_minutes: 0, created_at: new Date().toISOString() })
    .select("*, employee:employees(*)").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, entry: data })
}
