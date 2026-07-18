import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { askLLM } from "@/lib/llm"
import { buildEmployeeIntelligence, formatEmployeeIntelligenceForAgent, type EmployeeIntelligence } from "@/lib/employee-intelligence"
import { encodeKnowledgeNote } from "@/lib/knowledge"
import {
  AI_PRIVACY_SETTINGS_KEY,
  AUTO_LEARNING_TITLE_PREFIX,
  EXTERNAL_LLM_PRIVACY_RULES,
  parseAiPrivacySettings,
  sanitizeGeneratedAiText,
  snapshotCutoffIso,
  stripLegacyAutoLearningBlocks,
  type SnapshotRetentionDays,
} from "@/lib/privacy"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

export const runtime = "nodejs"

type LooseTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}
type LooseDatabase = {
  public: {
    Tables: Record<string, LooseTable>
    Views: Record<string, LooseTable>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
type AdminClient = SupabaseClient<LooseDatabase>

function fallbackInsight(rows: EmployeeIntelligence[]) {
  const needsReview = rows
    .filter(row => row.shiftsWithoutEntry > 0 || row.workedHours > row.plannedHours + 5)
    .sort((a, b) => (b.shiftsWithoutEntry + b.workedHours - b.plannedHours) - (a.shiftsWithoutEntry + a.workedHours - a.plannedHours))
    .slice(0, 3)
  const stablePairs = rows
    .filter(row => row.pairHints.some(pair => pair.label === "eingespielt"))
    .sort((a, b) => (b.pairHints[0]?.score ?? 0) - (a.pairHints[0]?.score ?? 0))
    .slice(0, 2)

  return [
    `Operative Teamdaten aktualisiert: ${rows.length} Mitarbeiter ausgewertet.`,
    needsReview.length
      ? `Prüfen: ${needsReview.map(row => `${row.name} (${row.shiftsWithoutEntry} offene Zeitnachweise, Ist ${row.workedHours} h / Plan ${row.plannedHours} h)`).join("; ")}.`
      : "Keine auffälligen Abweichungen zwischen Planung und erfasster Arbeitszeit.",
    stablePairs.length
      ? `Eingespielte Überschneidungen: ${stablePairs.map(row => `${row.name} mit ${row.pairHints[0]?.name}`).join("; ")}.`
      : "Für Teamfit liegen noch keine ausreichend stabilen Überschneidungen vor.",
    "Diese Analyse enthält keine Gesundheitsdaten oder persönlichen Wissensnotizen.",
  ].join("\n")
}

async function purgeExpiredSnapshots(admin: AdminClient, retentionDays: SnapshotRetentionDays) {
  const cutoff = snapshotCutoffIso(retentionDays)
  await admin
    .from("knowledge_docs")
    .delete()
    .ilike("title", `${AUTO_LEARNING_TITLE_PREFIX}%`)
    .lt("created_at", cutoff)

  const { data: latestRow } = await admin.from("settings").select("value").eq("key", "latest_insight").maybeSingle()
  try {
    const latest = JSON.parse(String(latestRow?.value ?? "{}")) as { date?: string }
    if (latest.date && `${latest.date}T23:59:59.999Z` < cutoff) {
      await admin.from("settings").delete().eq("key", "latest_insight")
    }
  } catch {
    await admin.from("settings").delete().eq("key", "latest_insight")
  }
}

async function removeLegacyAutoAnalysisFromRules(admin: AdminClient) {
  const { data } = await admin.from("settings").select("value").eq("key", "knowledge").maybeSingle()
  const current = String(data?.value ?? "")
  const cleaned = stripLegacyAutoLearningBlocks(current)
  if (cleaned !== current) await admin.from("settings").upsert({ key: "knowledge", value: cleaned })
}

async function runLearning() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sr) return NextResponse.json({ ok: false, error: "Server nicht konfiguriert" }, { status: 500 })
  const admin = createAdminClient<LooseDatabase>(url, sr, { auth: { persistSession: false } })

  const { data: privacyRow } = await admin.from("settings").select("value").eq("key", AI_PRIVACY_SETTINGS_KEY).maybeSingle()
  const privacy = parseAiPrivacySettings(privacyRow?.value as string | null | undefined)
  await purgeExpiredSnapshots(admin, privacy.snapshotRetentionDays)
  await removeLegacyAutoAnalysisFromRules(admin)

  if (!privacy.dailyProfilingEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "daily_profiling_disabled",
      message: "Tägliche Mitarbeiteranalyse ist in den Datenschutz-Einstellungen deaktiviert.",
    })
  }

  const tz = "Europe/Berlin"
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: tz })
  const intelligence = await buildEmployeeIntelligence(admin, { days: 56, tz, maxDocs: 220 })
  const intelligenceText = formatEmployeeIntelligenceForAgent(intelligence, 60)

  const prompt = `${EXTERNAL_LLM_PRIVACY_RULES}

Analysiere ausschließlich die folgenden operativen Planungsdaten der letzten 56 Tage:
${intelligenceText}

Gib 4-7 konkrete Lernpunkte für die Café-Leitung:
- Wo weichen geplante und erfasste Stunden auffällig voneinander ab?
- Welche Team-Kombinationen haben häufig gemeinsam gearbeitet?
- Welche operativen Daten fehlen noch?
- Welche Planungsregel sollte die Leitung prüfen?

Keine Gesundheitsdaten, Abwesenheitsgründe oder persönlichen Eigenschaften ableiten. Keine arbeitsrechtlichen Zusagen. Deutsch, professionell, knapp.`

  let insight = ""
  if (privacy.externalLlmEnabled && process.env.LLM_API_KEY) {
    const { text } = await askLLM(
      `Du analysierst operative Personaleinsatzdaten. ${EXTERNAL_LLM_PRIVACY_RULES}`,
      prompt,
      850,
    )
    insight = sanitizeGeneratedAiText(text)
  }
  if (!insight) insight = fallbackInsight(intelligence)

  const extracted = [
    "OPERATIVER PERSONALPLANUNGS-SNAPSHOT",
    `Datum: ${todayIso}`,
    "Datenschutz: Gesundheitsdaten und persönliche Notizen ausgeschlossen.",
    "",
    insight,
    "",
    "Verwendete operative Kennzahlen:",
    intelligenceText,
  ].join("\n").slice(0, 9500)

  const note = encodeKnowledgeNote("Manuell oder geplant erzeugte Analyse aus Schichten und Zeitstempeln. Keine Gesundheitsdaten oder persönlichen Notizen.", {
    category: "tageslernen",
    signal: "lernen",
    tags: ["auto-lernen", "operativ", "personalplanung", "datenschutz-gefiltert"],
    sourceDate: todayIso,
    scope: "team",
    trust: "system_generated",
  })

  await admin.from("knowledge_docs").insert({
    title: `${AUTO_LEARNING_TITLE_PREFIX}${todayIso}`,
    note,
    kind: "notiz",
    extracted,
  })
  await admin.from("settings").upsert({ key: "latest_insight", value: JSON.stringify({ date: todayIso, text: insight }) })

  return NextResponse.json({
    ok: true,
    insight,
    employees: intelligence.length,
    source: privacy.externalLlmEnabled && process.env.LLM_API_KEY ? "external_llm_filtered" : "local_fallback",
    retentionDays: privacy.snapshotRetentionDays,
  })
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }
  return runLearning()
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin
  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })
  if (!staff.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  const limited = await enforceRateLimit(request, "agent-learn", 4, 30 * 60_000, staff.userId)
  if (limited) return limited
  return runLearning()
}
