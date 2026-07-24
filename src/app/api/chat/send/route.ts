import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { employee_id, content, recipient_id, attachment_url, attachment_name, attachment_type } = body

    if (!employee_id) {
      return NextResponse.json({ error: "Absender fehlt" }, { status: 400 })
    }

    if (!content && !attachment_url) {
      return NextResponse.json({ error: "Inhalt oder Anhang erforderlich" }, { status: 400 })
    }

    const admin = getAdminClient()

    // Speichere Zusatz-Metadaten (Anhang & Empfänger) abhörsicher im JSONB Meta-Feld & dedizierten Feldern
    const payload: Record<string, unknown> = {
      employee_id,
      content: content || (attachment_name ? `[Datei: ${attachment_name}]` : "[Anhang]"),
      type: "chat",
      created_at: new Date().toISOString(),
      meta: {
        recipient_id: recipient_id || null,
        attachment_url: attachment_url || null,
        attachment_name: attachment_name || null,
        attachment_type: attachment_type || null,
      },
    }

    // Versuche zunächst Insert mit erweitertem Payload
    let { data, error } = await admin
      .from("messages")
      .insert({
        ...payload,
        ...(recipient_id ? { recipient_id } : {}),
        ...(attachment_url ? { attachment_url, attachment_name, attachment_type } : {}),
      })
      .select("*, employee:employees(id,name,color,position,role)")
      .single()

    // Fallback: Falls Supabase-Tabellenschema noch keine eigenen Spalten hat, nur Grundfelder + JSONB meta einfügen
    if (error) {
      const fallbackResult = await admin
        .from("messages")
        .insert(payload)
        .select("*, employee:employees(id,name,color,position,role)")
        .single()

      if (fallbackResult.error || !fallbackResult.data) {
        throw new Error(fallbackResult.error?.message || "Fehler beim Einfügen der Nachricht")
      }
      data = fallbackResult.data
    }

    return NextResponse.json({ success: true, message: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Senden fehlgeschlagen"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
