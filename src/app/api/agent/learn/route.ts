import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { askLLM } from "@/lib/llm"
import { buildEmployeeIntelligence, formatEmployeeIntelligenceForAgent, type EmployeeIntelligence } from "@/lib/employee-intelligence"
import { encodeKnowledgeNote } from "@/lib/knowledge"

export const runtime = "nodejs"

function fallbackInsight(rows: EmployeeIntelligence[]) {
  const needsReview = rows
    .filter(r => r.pendingAbsences > 0 || r.shiftsWithoutEntry > 0 || r.riskSignals > 0)
    .sort((a, b) => (b.riskSignals + b.pendingAbsences + b.shiftsWithoutEntry) - (a.riskSignals + a.pendingAbsences + a.shiftsWithoutEntry))
    .slice(0, 3)
  const positives = rows
    .filter(r => r.positiveSignals > 0 || r.pairHints.some(p => p.label === "eingespielt"))
    .sort((a, b) => (b.positiveSignals + b.pairHints.length) - (a.positiveSignals + a.pairHints.length))
    .slice(0, 2)

  const parts = [
    `Teamdaten aktualisiert: ${rows.length} Mitarbeiter ausgewertet.`,
    needsReview.length
      ? `Prüfen: ${needsReview.map(r => `${r.name} (${r.recommendation})`).join("; ")}.`
      : "Keine akuten Prüf-Signale aus Abwesenheit, Zeitprüfung oder Wissensnotizen.",
    positives.length
      ? `Stabile Signale: ${positives.map(r => `${r.name}${r.pairHints[0] ? ` mit ${r.pairHints[0].name}` : ""}`).join("; ")}.`
      : "Für Teamfit werden weiter gemeinsame Schichten und Wissensnotizen gesammelt.",
    "Krankheit/Probleme werden als Planungsrisiko behandelt, nicht als automatische negative Bewertung.",
  ]
  return parts.join("\n")
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const staff = await getCurrentStaff()
    if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sr) return NextResponse.json({ ok: false, error: "Server nicht konfiguriert" }, { status: 500 })
  const admin = createAdminClient(url, sr, { auth: { persistSession: false } })

  const TZ = "Europe/Berlin"
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: TZ })
  const todayDe = new Date().toLocaleDateString("de-DE", { timeZone: TZ })
  const intelligence = await buildEmployeeIntelligence(admin, { days: 56, tz: TZ, maxDocs: 220 })
  const intelligenceText = formatEmployeeIntelligenceForAgent(intelligence, 60)

  const prompt = `Analysiere Browns Coffee Lounge als lernende Personal-App.
Datenbasis der letzten 56 Tage plus Wissensdatenbank:
${intelligenceText}

Gib 4-7 konkrete Lernpunkte für die Café-Leitung:
- Wer braucht Planungspuffer, Prüfung oder Gespräch?
- Welche Team-Kombinationen wirken eingespielt?
- Welche Daten fehlen noch?
- Welche Regel soll der Agent künftig beachten?

Wichtig: Krankheit und persönliche Probleme nie als moralische Bewertung formulieren, sondern nur als Planungs- oder Nachweisrisiko. Keine arbeitsrechtlichen Zusagen. Deutsch, professionell, knapp.`

  let insight = ""
  if (process.env.LLM_API_KEY) {
    const { text } = await askLLM("Du bist ein professioneller Gastronomie-Personalcontroller und RAG-Systemdesigner.", prompt, 850)
    insight = (text ?? "").trim()
  }
  if (!insight) insight = fallbackInsight(intelligence)

  const extracted = [
    "PERSONAL-INTELLIGENCE / RAG-SNAPSHOT",
    `Datum: ${todayIso}`,
    "",
    insight,
    "",
    "Ausgewertete Mitarbeiterdaten:",
    intelligenceText,
  ].join("\n").slice(0, 9500)

  const note = encodeKnowledgeNote("Automatische Tagesanalyse aus Schichten, Zeitstempeln, Abwesenheiten, Vertretungen und Wissensnotizen.", {
    category: "tageslernen",
    signal: "lernen",
    tags: ["auto-lernen", "rag", "team-chart", "personalplanung", "browns-agent"],
    sourceDate: todayIso,
    scope: "team",
  })

  await admin.from("knowledge_docs").insert({
    title: `Auto-Lernen Personal ${todayIso}`,
    note,
    kind: "notiz",
    extracted,
  })

  const { data: kn } = await admin.from("settings").select("value").eq("key", "knowledge").maybeSingle()
  const block = `\n\n— Auto-Analyse (${todayDe}) —\n${insight}`
  await admin.from("settings").upsert({ key: "knowledge", value: ((kn?.value || "") + block).slice(-7000) })
  await admin.from("settings").upsert({ key: "latest_insight", value: JSON.stringify({ date: todayIso, text: insight }) })

  return NextResponse.json({ ok: true, insight, employees: intelligence.length })
}
