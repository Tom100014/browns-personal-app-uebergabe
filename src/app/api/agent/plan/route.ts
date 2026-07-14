import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { askLLM } from "@/lib/llm"

export const runtime = "nodejs"

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ")

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })

  const { planText, date } = await request.json().catch(() => ({}))
  if (!planText || !date) return NextResponse.json({ error: "planText und date erforderlich" }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })
  const { data: employees } = await admin.from("employees").select("id,name,position")
  const team = (employees ?? []) as { id: string; name: string; position: string }[]
  const nameList = team.map(e => `${e.name} (${e.position})`).join("; ")

  const prompt = `Wandle den folgenden Dienstplan in striktes JSON für das Datum ${date} um.
Nutze AUSSCHLIESSLICH diese Mitarbeiter mit exakt diesen Namen: ${nameList}.
Gib NUR ein JSON-Array zurück, keinen weiteren Text:
[{"employee":"Vorname Nachname","start":"HH:MM","end":"HH:MM","position":"Service|Theke|Küche|Spüle"}]

Dienstplan:
${String(planText).slice(0, 4000)}`

  const { text, error } = await askLLM("Du antwortest ausschließlich mit gültigem JSON-Array.", prompt, 1500)
  if (error) return NextResponse.json({ error }, { status: 200 })

  let parsed: { employee?: string; start?: string; end?: string; position?: string }[] = []
  try {
    const raw = (text ?? "[]").replace(/```json|```/g, "")
    parsed = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1) || "[]")
  } catch {
    return NextResponse.json({ error: "Plan konnte nicht gelesen werden." }, { status: 200 })
  }

  const byName = new Map(team.map(e => [norm(e.name), e]))
  const rows: Record<string, unknown>[] = []
  const unmatched: string[] = []
  for (const s of parsed) {
    if (!s.employee || !s.start || !s.end) continue
    const emp = byName.get(norm(s.employee))
    if (!emp) { unmatched.push(s.employee); continue }
    rows.push({
      employee_id: emp.id, date,
      start_time: s.start, end_time: s.end,
      position: s.position || emp.position, status: "scheduled", note: "KI-Agent",
    })
  }
  if (rows.length) await admin.from("shifts").insert(rows)

  return NextResponse.json({ ok: true, added: rows.length, unmatched })
}
