import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours } from "@/lib/hours"

export const runtime = "nodejs"

type Entry = { id: string; employee_id: string; date: string; clock_in: string; break_minutes: number | null }

// Schließt vergessene (offene) Stempelungen vergangener Tage automatisch ab —
// auf das Schichtende, sonst auf Stempelbeginn + 8 h (max. 23:59). Damit
// verfälschen vergessene Ausstempelungen nicht die Stundenauswertung.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const staff = await getCurrentStaff()
    if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })
  const { data: open } = await admin.from("time_entries").select("id,employee_id,date,clock_in,break_minutes").is("clock_out", null).lt("date", today)
  const entries = (open ?? []) as Entry[]

  let closed = 0
  for (const e of entries) {
    const { data: sh } = await admin.from("shifts")
      .select("end_time").eq("employee_id", e.employee_id).eq("date", e.date)
      .order("end_time", { ascending: false }).limit(1).maybeSingle()

    let clockOut = sh?.end_time as string | undefined
    if (!clockOut) {
      const [h, m] = e.clock_in.split(":").map(Number)
      const endMin = Math.min(h * 60 + m + 8 * 60, 23 * 60 + 59)
      clockOut = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`
    }
    const total = entryHours({ clock_in: e.clock_in, clock_out: clockOut, break_minutes: e.break_minutes })
    await admin.from("time_entries").update({ clock_out: clockOut, total_hours: Math.round(total * 100) / 100, auto_closed: true }).eq("id", e.id)
    closed++
  }

  return NextResponse.json({ ok: true, closed })
}
