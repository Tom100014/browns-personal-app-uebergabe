import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { jsonNoStore } from "@/lib/security"
import { parseKnowledgeNote } from "@/lib/knowledge"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sr) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, sr, { auth: { persistSession: false } })

  const [{ data: docs }, { data: settings }, { data: employees }] = await Promise.all([
    admin.from("knowledge_docs").select("*").order("created_at", { ascending: false }),
    admin.from("settings").select("*"),
    admin.from("employees").select("id, name, position, role"),
  ])

  const formattedDocs = (docs ?? []).map(doc => {
    const parsed = parseKnowledgeNote(doc.note)
    return {
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      category: parsed.meta.category || "Allgemein",
      tags: parsed.meta.tags || [],
      content: parsed.body || doc.extracted || "",
      created_at: doc.created_at,
    }
  })

  const exportData = {
    appName: "Browns Lounge Personalapp",
    exportedAt: new Date().toISOString(),
    exportedBy: staff.email,
    summary: {
      totalDocs: formattedDocs.length,
      totalEmployees: employees?.length ?? 0,
    },
    settings: (settings ?? []).reduce((acc: Record<string, string>, s) => {
      acc[s.key] = s.value
      return acc
    }, {}),
    knowledgeDocs: formattedDocs,
  }

  const filename = `browns-wissensdatenbank-${new Date().toISOString().slice(0, 10)}.json`

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
