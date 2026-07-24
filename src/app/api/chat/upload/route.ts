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
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "Keine Datei ausgewählt" }, { status: 400 })
    }

    // Maximale Dateigröße: 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Datei darf maximal 10 MB groß sein" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

    const admin = getAdminClient()

    // Versuche Upload in Bucket "attachments", andernfalls Fallback auf Data-URL für PDF/Bilder
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from("attachments")
      .upload(safeName, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      })

    if (!uploadErr && uploadData) {
      const { data: pubUrl } = admin.storage.from("attachments").getPublicUrl(safeName)
      return NextResponse.json({
        url: pubUrl.publicUrl,
        name: file.name,
        type: file.type.startsWith("image/") ? "image" : file.type.includes("pdf") ? "pdf" : "file",
        size: file.size,
      })
    }

    // Fallback: Wenn Storage-Bucket noch nicht erstellt ist, als Inline Data URL zurückgeben
    const base64 = buffer.toString("base64")
    const mime = file.type || "application/octet-stream"
    const dataUrl = `data:${mime};base64,${base64}`

    return NextResponse.json({
      url: dataUrl,
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : file.type.includes("pdf") ? "pdf" : "file",
      size: file.size,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload fehlgeschlagen" }, { status: 500 })
  }
}
