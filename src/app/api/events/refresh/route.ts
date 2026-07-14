import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { EVENT_TYPES } from "@/lib/forecast"
import { askLLM } from "@/lib/llm"
import { bavarianHolidays } from "@/lib/holidays"
import type { SupabaseClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const impactFor = (type: string) => EVENT_TYPES.find(t => t.value === type)?.impact ?? 0

// Gesetzliche Feiertage (Nürnberg) für dieses + nächstes Jahr eintragen (dedupliziert).
async function seedHolidays(admin: SupabaseClient, today: string): Promise<number> {
  const year = new Date().getFullYear()
  const list = [...bavarianHolidays(year), ...bavarianHolidays(year + 1)].filter(h => h.date >= today)
  if (list.length === 0) return 0
  const { data: existing } = await admin.from("events").select("date,title").eq("type", "feiertag")
  const seen = new Set((existing ?? []).map((e: { date: string; title: string }) => e.date + "|" + e.title.toLowerCase()))
  let n = 0
  for (const h of list) {
    if (seen.has(h.date + "|" + h.title.toLowerCase())) continue
    await admin.from("events").insert({ date: h.date, end_date: null, title: h.title, type: "feiertag", impact: impactFor("feiertag"), source: "auto", note: "Gesetzlicher Feiertag (Nürnberg)" })
    n++
  }
  return n
}

export async function GET(request: NextRequest) {
  // Erlaubt: eingeloggte Leitung ODER Vercel-Cron (Authorization: Bearer CRON_SECRET)
  const auth = request.headers.get("authorization")
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const staff = await getCurrentStaff()
    if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const llm = process.env.LLM_API_KEY
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })
  const holidays = await seedHolidays(admin, today)

  if (!llm) {
    return NextResponse.json({ ok: true, added: holidays, note: "Feiertage eingetragen. Automatische Event-Suche inaktiv (LLM-Key fehlt) — weitere Events bitte manuell pflegen." })
  }

  const until = new Date(Date.now() + 42 * 864e5).toLocaleDateString("en-CA")

  let added = 0
  try {
    const prompt = `Suche aktuelle und kommende öffentliche Veranstaltungen, Messen (NürnbergMesse), Stadtfeste, Konzerte, Märkte und Feiertage in Nürnberg im Zeitraum ${today} bis ${until}, die ein Café in der Innenstadt/Fußgängerzone beeinflussen. Gib das Ergebnis NUR als JSON-Array zurück (keine Erklärung, keine Quellen-Marker): [{"date":"YYYY-MM-DD","end_date":"YYYY-MM-DD oder null","title":"Kurzname","type":"messe|event|feiertag|ferien","source":"URL"}]`
    const eventModel = process.env.EVENT_MODEL || "perplexity/sonar"
    const { text, error } = await askLLM("Du recherchierst Live im Web und antwortest ausschließlich mit gültigem JSON-Array.", prompt, 1500, eventModel)
    if (error) return NextResponse.json({ ok: false, error }, { status: 200 })
    const raw = (text ?? "[]").replace(/```json|```/g, "")
    const arr = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1) // robust gegen Zusatztext
    const json = JSON.parse(arr || "[]")
    const { data: existing } = await admin.from("events").select("date,title").gte("date", today)
    const seen = new Set((existing ?? []).map((e: { date: string; title: string }) => e.date + "|" + e.title.toLowerCase()))
    for (const e of Array.isArray(json) ? json : []) {
      if (!e?.date || !e?.title) continue
      if (seen.has(e.date + "|" + String(e.title).toLowerCase())) continue
      await admin.from("events").insert({
        date: e.date, end_date: e.end_date || null, title: String(e.title).slice(0, 120),
        type: e.type || "event", impact: impactFor(e.type || "event"),
        source: "auto", note: e.source ? `Quelle: ${String(e.source).slice(0, 200)}` : "Auto (Perplexity Live-Suche)",
      })
      added++
    }
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || "Fehler bei der Eventsuche" }, { status: 200 })
  }

  return NextResponse.json({ ok: true, added, holidays })
}
