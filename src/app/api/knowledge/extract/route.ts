import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { askLLMVision } from "@/lib/llm"
import readXlsxFile from "read-excel-file/node"

export const runtime = "nodejs"

const MAX_TEXT = 6000

const VISION_SYSTEM = `Du analysierst hochgeladene Bilder für ein Café (Browns Coffee Lounge, Nürnberg) zur Personalplanung.
Beschreibe knapp auf Deutsch nur das, was für Planung/Betrieb relevant ist: z.B. Inhalte von Speisekarten, Dienst-/Wochenplänen, Hygiene-/Reinigungsplänen, Stoßzeiten, Notizen, Tabellen.
Gib bei Plänen/Tabellen die konkreten Werte wieder (Namen, Zeiten, Tage). Keine Vermutungen, kein Vorwort.`

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })

  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin = createAdminClient(url!, sr!, { auth: { persistSession: false } })

  const { data: doc } = await admin.from("knowledge_docs").select("id,title,kind,file_path").eq("id", id).single()
  if (!doc) return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 })
  if (!doc.file_path) return NextResponse.json({ error: "Keine Datei" }, { status: 400 })

  const { data: signed } = await admin.storage.from("knowledge").createSignedUrl(doc.file_path, 600)
  if (!signed?.signedUrl) return NextResponse.json({ error: "Datei nicht lesbar" }, { status: 500 })

  let extracted = ""

  if (doc.kind === "bild") {
    const { text, error } = await askLLMVision(VISION_SYSTEM, `Analysiere dieses Bild ("${doc.title}").`, signed.signedUrl, 700)
    if (error) return NextResponse.json({ error }, { status: 200 })
    extracted = (text ?? "").trim()
  } else if (/\.(txt|csv|md)$/i.test(doc.file_path)) {
    try {
      const res = await fetch(signed.signedUrl)
      const raw = await res.text()
      extracted = raw.slice(0, MAX_TEXT)
    } catch {
      return NextResponse.json({ error: "Textdatei nicht lesbar" }, { status: 200 })
    }
  } else if (/\.xlsx$/i.test(doc.file_path)) {
    try {
      const res = await fetch(signed.signedUrl)
      const workbook = await readXlsxFile(Buffer.from(await res.arrayBuffer()))
      const lines: string[] = []
      for (const sheet of workbook.slice(0, 5)) {
        lines.push(`[Tabelle: ${sheet.sheet}]`)
        for (const row of sheet.data) {
          if (lines.join("\n").length >= MAX_TEXT) break
          const values = row.slice(0, 30).map(value => String(value ?? "").trim())
          if (values.some(Boolean)) lines.push(values.join(" | "))
        }
        if (lines.join("\n").length >= MAX_TEXT) break
      }
      extracted = lines.join("\n").slice(0, MAX_TEXT)
    } catch {
      return NextResponse.json({ error: "Excel-Datei nicht lesbar" }, { status: 200 })
    }
  } else {
    // Andere Formate bleiben sicher archiviert und können jederzeit geöffnet werden.
    return NextResponse.json({ skipped: true, reason: "format" }, { status: 200 })
  }

  if (!extracted) return NextResponse.json({ error: "Kein Inhalt erkannt" }, { status: 200 })
  await admin.from("knowledge_docs").update({ extracted }).eq("id", id)
  return NextResponse.json({ ok: true, extracted })
}
