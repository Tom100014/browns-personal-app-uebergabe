import type { SupabaseClient } from "@supabase/supabase-js"
import { entryHours, shiftHours } from "@/lib/hours"
import { buildEmployeeIntelligence, formatEmployeeIntelligenceForAgent } from "@/lib/employee-intelligence"

const NBG = { lat: 49.4521, lon: 11.0767 }
const STATIONS = ["Service", "Theke", "Küche", "Spüle", "Bar", "Kasse", "Reinigung", "Leitung"]

type Shift = { employee_id: string | null; date: string; position: string; start_time: string; end_time: string; status?: string }
type Entry = { employee_id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null }

async function weatherText(today: string): Promise<string> {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${NBG.lat}&longitude=${NBG.lon}&daily=temperature_2m_max,precipitation_sum&timezone=Europe%2FBerlin&forecast_days=4`
    const res = await fetch(u, { next: { revalidate: 3600 } })
    if (!res.ok) return "(Wetter nicht verfügbar)"
    const d = await res.json()
    const days: string[] = d?.daily?.time ?? []
    const tmax: number[] = d?.daily?.temperature_2m_max ?? []
    const rain: number[] = d?.daily?.precipitation_sum ?? []
    return days.map((dy, i) => `${dy === today ? "heute" : dy}: ${Math.round(tmax[i])}°C, ${rain[i] > 0.2 ? `${rain[i].toFixed(1)} mm Regen` : "trocken"}`).join(" · ")
  } catch {
    return "(Wetter nicht verfügbar)"
  }
}

/**
 * Baut den operativen Echtzeit-Kontext für den Browns Agent: Mindestbesetzung,
 * heutige Stationsbesetzung & Lücken, No-Shows, 4-Wochen-Auslastung je Mitarbeiter,
 * Stationsverteilung, Wetter, anstehende Events und die jüngste Lern-Erkenntnis.
 * Dadurch hat der Agent immer echte Café-Daten — auch ohne manuell gepflegte Regeln.
 */
export async function buildOpsContext(admin: SupabaseClient, tz = "Europe/Berlin"): Promise<string> {
  const now = new Date()
  const today = now.toLocaleDateString("en-CA", { timeZone: tz })
  const nowHHMM = now.toLocaleTimeString("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  const since = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)

  const [minRow, insightRow, { data: employees }, { data: todayShifts }, { data: todayEntries }, { data: entries4w }, { data: shifts4w }, { data: events }, weather, intelligence] = await Promise.all([
    admin.from("settings").select("value").eq("key", "min_staffing").maybeSingle(),
    admin.from("settings").select("value").eq("key", "latest_insight").maybeSingle(),
    admin.from("employees").select("id,name,position,employment_type"),
    admin.from("shifts").select("employee_id,date,position,start_time,end_time,status").eq("date", today),
    admin.from("time_entries").select("employee_id").eq("date", today),
    admin.from("time_entries").select("employee_id,date,clock_in,clock_out,break_minutes").gte("date", since),
    admin.from("shifts").select("employee_id,date,position,start_time,end_time").gte("date", since),
    admin.from("events").select("date,end_date,title,type,impact").gte("date", today).order("date").limit(15),
    weatherText(today),
    buildEmployeeIntelligence(admin, { days: 56, tz, maxDocs: 160 }),
  ])

  let minStaffing: Record<string, number> = {}
  try { if (minRow.data?.value) minStaffing = JSON.parse(minRow.data.value) } catch { /* ignore */ }

  const team = (employees ?? []) as { id: string; name: string; position: string; employment_type: string | null }[]
  const empName = (id: string | null) => team.find(t => t.id === id)?.name ?? "—"

  // Heutige Besetzung pro Station + Lücken gegen Mindestbesetzung
  const todayByStation: Record<string, number> = {}
  for (const s of (todayShifts ?? []) as Shift[]) {
    if (s.status === "absent") continue
    todayByStation[s.position] = (todayByStation[s.position] ?? 0) + 1
  }
  const gaps = STATIONS
    .filter(st => (minStaffing[st] ?? 0) > 0)
    .map(st => ({ st, have: todayByStation[st] ?? 0, min: minStaffing[st] }))
  const gapText = gaps.length
    ? gaps.map(g => `${g.st} ${g.have}/${g.min}${g.have < g.min ? " ⚠ UNTERBESETZT" : ""}`).join(", ")
    : "(keine Mindestbesetzung hinterlegt)"

  // No-Shows: Schicht hat begonnen, aber nicht eingestempelt
  const clockedIn = new Set((todayEntries ?? []).map((e: { employee_id: string }) => e.employee_id))
  const noShows = ((todayShifts ?? []) as Shift[])
    .filter(s => s.employee_id && s.status !== "absent" && s.start_time.slice(0, 5) <= nowHHMM && !clockedIn.has(s.employee_id))
    .map(s => `${empName(s.employee_id)} (${s.position}, seit ${s.start_time.slice(0, 5)})`)

  // 4-Wochen-Auslastung je Mitarbeiter
  const hoursBy: Record<string, number> = {}
  for (const e of (entries4w ?? []) as Entry[]) hoursBy[e.employee_id] = (hoursBy[e.employee_id] ?? 0) + entryHours(e)
  const utilization = team
    .map(t => ({ t, h: Math.round(hoursBy[t.id] ?? 0) }))
    .sort((a, b) => b.h - a.h)
    .map(({ t, h }) => `${t.name} (${t.position}): ${h} h`)
    .join("; ")

  // Stationsverteilung (geplante Stunden, 4 Wochen)
  const stationHours: Record<string, number> = {}
  for (const s of (shifts4w ?? []) as Shift[]) stationHours[s.position] = (stationHours[s.position] ?? 0) + shiftHours(s)
  const stationText = Object.entries(stationHours).sort((a, b) => b[1] - a[1]).map(([st, h]) => `${st}: ${Math.round(h)} h`).join(", ") || "(keine Daten)"

  const evText = (events ?? []).map((e: { date: string; end_date?: string | null; title: string; type: string; impact: number }) =>
    `${e.date}${e.end_date && e.end_date !== e.date ? "–" + e.end_date : ""}: ${e.title} (${e.type}, Wirkung ${e.impact})`).join("\n") || "(keine)"

  let latestInsight = ""
  try { if (insightRow.data?.value) latestInsight = JSON.parse(insightRow.data.value)?.text ?? "" } catch { /* ignore */ }

  return `OPERATIVE ECHTZEIT-DATEN (Café-Zeit ${tz}):
- Wetter Nürnberg (4 Tage): ${weather}
- Mindestbesetzung & heutige Besetzung pro Station: ${gapText}
- No-Shows JETZT (Schicht läuft, nicht eingestempelt): ${noShows.length ? noShows.join("; ") : "keine"}
- Auslastung je Mitarbeiter (Ist-Stunden, letzte 4 Wochen): ${utilization || "(keine erfassten Stunden)"}
- Geplante Stunden je Station (4 Wochen): ${stationText}
- Anstehende Veranstaltungen/Einflüsse:
${evText}
- Letzte automatische Erkenntnis: ${latestInsight || "(noch keine)"}
- Mitarbeiter-Intelligence aus RAG, Abwesenheiten, Zeitdaten und Teamfit:
${formatEmployeeIntelligenceForAgent(intelligence)}`
}
