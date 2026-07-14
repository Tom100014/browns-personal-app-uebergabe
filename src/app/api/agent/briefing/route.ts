import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { askLLM } from "@/lib/llm"
import { buildOpsContext } from "@/lib/agent-context"

export const runtime = "nodejs"

// Proaktives Tagesbriefing: ohne Frage des Nutzers — Warnungen & Empfehlungen für heute.
export async function GET() {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  if (!process.env.LLM_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 200 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })

  const TZ = "Europe/Berlin"
  const now = new Date()
  const nowFull = now.toLocaleString("de-DE", { timeZone: TZ, dateStyle: "full", timeStyle: "short" })

  const [{ data: knowRow }, ops] = await Promise.all([
    admin.from("settings").select("value").eq("key", "knowledge").maybeSingle(),
    buildOpsContext(admin, TZ),
  ])
  const knowledge = knowRow?.value || "(keine Regeln hinterlegt)"

  const system = `Du bist der proaktive Personal-Planungs-Agent für das Café "Browns Coffee Lounge" in Nürnberg (Innenstadt/Fußgängerzone).
Erstelle ein KURZES Tagesbriefing für die Café-Leitung — von dir aus, ohne dass jemand fragt.
Nenne nur, was HEUTE/diese Tage wirklich Aufmerksamkeit braucht: Unterbesetzung, No-Shows, Wetter (Außenbereich im Sommer!), Veranstaltungen/Messe, offene Vertretungen, Auslastungs-Risiken.
Format: 2–4 kurze Stichpunkte mit konkreter Handlung. Wenn alles in Ordnung ist, sag das knapp. Deutsch, max 110 Wörter, keine Floskeln.`

  const userMsg = `Jetzt: ${nowFull}.
${ops}

Betriebsregeln:
${knowledge}`

  const { text, error } = await askLLM(system, userMsg, 450)
  if (error) return NextResponse.json({ error }, { status: 200 })
  return NextResponse.json({ briefing: (text ?? "").trim() })
}
