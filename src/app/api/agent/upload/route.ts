import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { encodeKnowledgeNote, parseKnowledgeNote } from "@/lib/knowledge"
import { isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"
import { validateUpload, type UploadScope } from "@/lib/security-upload"

export const runtime = "nodejs"

const DOCUMENT_CATEGORIES = new Set(["Arbeitsvertrag", "Lohnabrechnung", "Bescheinigung", "Ausweis", "Sonstiges"])
const SCOPES = new Set<UploadScope>(["knowledge", "document", "sicknote"])

function textField(form: FormData, name: string, maxLength: number): string {
  const value = form.get(name)
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })

  const limited = await enforceRateLimit(request, "validated-upload", 20, 10 * 60_000, staff.userId)
  if (limited) return limited

  const form = await request.formData().catch(() => null)
  const scope = form?.get("scope")
  const file = form?.get("file")
  if (!form || typeof scope !== "string" || !SCOPES.has(scope as UploadScope) || !(file instanceof File)) {
    return jsonNoStore({ error: "Datei und gültiger Upload-Bereich erforderlich" }, { status: 400 })
  }
  if (scope !== "sicknote" && !staff.isManager) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }
  if (scope === "sicknote" && !staff.employee?.id && !staff.isManager) {
    return jsonNoStore({ error: "Kein Mitarbeiterkonto verknüpft" }, { status: 409 })
  }

  let validated
  try {
    validated = await validateUpload(file, scope as UploadScope)
  } catch (cause) {
    return jsonNoStore({ error: cause instanceof Error ? cause.message : "Datei ist nicht erlaubt" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })
  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = Buffer.from(await file.arrayBuffer())
  const nonce = randomUUID().replace(/-/g, "").slice(0, 12)

  if (!await writeSecurityAudit(staff, "Dateiupload geprüft", { scope, bytes: file.size, contentType: validated.contentType })) {
    return jsonNoStore({ error: "Sicherheitsprotokoll nicht verfügbar" }, { status: 503 })
  }

  if (scope === "knowledge") {
    const title = textField(form, "title", 180)
    if (!title) return jsonNoStore({ error: "Titel erforderlich" }, { status: 400 })
    const rawNote = textField(form, "note", 10_000)
    const parsed = parseKnowledgeNote(rawNote)
    const note = encodeKnowledgeNote(parsed.body, { ...parsed.meta, trust: "manager_verified" })
    const filePath = `${Date.now()}-${nonce}-${validated.safeName}`
    const upload = await admin.storage.from("knowledge").upload(filePath, body, {
      contentType: validated.contentType,
      upsert: false,
    })
    if (upload.error) return jsonNoStore({ error: "Upload fehlgeschlagen" }, { status: 500 })

    const kind = validated.contentType.startsWith("image/") ? "bild" : "datei"
    const { data, error } = await admin.from("knowledge_docs")
      .insert({ title, note, file_path: filePath, kind })
      .select()
      .single()
    if (error || !data) {
      await admin.storage.from("knowledge").remove([filePath])
      return jsonNoStore({ error: "Wissensdokument konnte nicht gespeichert werden" }, { status: 500 })
    }
    return jsonNoStore({ ok: true, record: data })
  }

  if (scope === "document") {
    const employeeId = form.get("employeeId")
    const requestedCategory = textField(form, "category", 60)
    const category = DOCUMENT_CATEGORIES.has(requestedCategory) ? requestedCategory : "Sonstiges"
    if (!isUuid(employeeId)) return jsonNoStore({ error: "Gültiger Mitarbeiter erforderlich" }, { status: 400 })
    const { data: employee, error: employeeError } = await admin.from("employees").select("id").eq("id", employeeId).maybeSingle()
    if (employeeError || !employee) return jsonNoStore({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })

    const filePath = `${employeeId}/${Date.now()}-${nonce}-${validated.safeName}`
    const upload = await admin.storage.from("documents").upload(filePath, body, {
      contentType: validated.contentType,
      upsert: false,
    })
    if (upload.error) return jsonNoStore({ error: "Upload fehlgeschlagen" }, { status: 500 })
    const { data, error } = await admin.from("documents")
      .insert({ employee_id: employeeId, name: validated.safeName, category, file_path: filePath, size_bytes: file.size })
      .select()
      .single()
    if (error || !data) {
      await admin.storage.from("documents").remove([filePath])
      return jsonNoStore({ error: "Dokument konnte nicht gespeichert werden" }, { status: 500 })
    }
    return jsonNoStore({ ok: true, record: data })
  }

  const absenceId = form.get("absenceId")
  if (!isUuid(absenceId)) return jsonNoStore({ error: "Gültiger Abwesenheitsantrag erforderlich" }, { status: 400 })
  const { data: absence, error: absenceError } = await admin.from("absences")
    .select("id,employee_id,attachment_path")
    .eq("id", absenceId)
    .maybeSingle()
  if (absenceError || !absence) return jsonNoStore({ error: "Abwesenheitsantrag nicht gefunden" }, { status: 404 })
  if (!staff.isManager && absence.employee_id !== staff.employee?.id) {
    return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  }
  if (absence.attachment_path) return jsonNoStore({ error: "Für diesen Antrag ist bereits ein Nachweis gespeichert" }, { status: 409 })

  const filePath = `${absence.employee_id}/${absence.id}-${nonce}-${validated.safeName}`
  const upload = await admin.storage.from("sicknotes").upload(filePath, body, {
    contentType: validated.contentType,
    upsert: false,
  })
  if (upload.error) return jsonNoStore({ error: "Upload fehlgeschlagen" }, { status: 500 })
  const { data: updated, error: updateError } = await admin.from("absences")
    .update({ attachment_path: filePath })
    .eq("id", absence.id)
    .is("attachment_path", null)
    .select("attachment_path")
    .maybeSingle()
  if (updateError || !updated) {
    await admin.storage.from("sicknotes").remove([filePath])
    return jsonNoStore({ error: "Nachweis konnte nicht zugeordnet werden" }, { status: 409 })
  }
  return jsonNoStore({ ok: true, filePath })
}
