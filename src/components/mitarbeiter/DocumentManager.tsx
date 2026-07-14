"use client"

import { useState, useRef } from "react"
import { Upload, FileText, Download, Trash2, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { formatBytes } from "@/lib/hours"
import { cn } from "@/lib/utils"
import type { EmployeeDocument } from "@/types"
import { format } from "date-fns"
import { de } from "date-fns/locale"

const CATEGORIES = ["Arbeitsvertrag", "Lohnabrechnung", "Bescheinigung", "Ausweis", "Sonstiges"]
const CAT_COLORS: Record<string, string> = {
  Arbeitsvertrag: "bg-brand-50 text-brand-700",
  Lohnabrechnung: "bg-emerald-50 text-emerald-700",
  Bescheinigung: "bg-violet-50 text-violet-700",
  Ausweis: "bg-amber-50 text-amber-700",
  Sonstiges: "bg-gray-100 text-gray-600",
}

interface Props {
  employeeId: string
  documents: EmployeeDocument[]
}

export default function DocumentManager({ employeeId, documents: initial }: Props) {
  const [docs, setDocs] = useState<EmployeeDocument[]>(initial)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true); setError(null)
    const supabase = createClient()
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_")
      const path = `${employeeId}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file)
      if (upErr) { setError(`Upload fehlgeschlagen: ${upErr.message}`); continue }
      const { data } = await supabase.from("documents")
        .insert({ employee_id: employeeId, name: file.name, category, file_path: path, size_bytes: file.size })
        .select().single()
      if (data) setDocs(prev => [data as EmployeeDocument, ...prev])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function download(doc: EmployeeDocument) {
    setBusy(doc.id)
    const supabase = createClient()
    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
    setBusy(null)
  }

  async function remove(doc: EmployeeDocument) {
    if (!confirm(`Dokument „${doc.name}" wirklich löschen?`)) return
    setBusy(doc.id)
    const supabase = createClient()
    await supabase.storage.from("documents").remove([doc.file_path])
    await supabase.from("documents").delete().eq("id", doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setBusy(null)
  }

  return (
    <div>
      {/* Upload zone */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1.5 block font-medium">Kategorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full sm:w-56 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Lädt hoch…" : "Datei hochladen"}
        </button>
        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.heic"
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          Noch keine Dokumente. Lade Arbeitsvertrag, Bescheinigungen o.&nbsp;Ä. hoch.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-3 hover:bg-gray-50/50 transition">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4.5 h-4.5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                <p className="text-xs text-gray-400">
                  {format(new Date(doc.uploaded_at), "dd.MM.yyyy", { locale: de })}
                  {doc.size_bytes ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                </p>
              </div>
              <span className={cn("hidden sm:inline text-xs px-2.5 py-1 rounded-full font-medium", CAT_COLORS[doc.category] ?? CAT_COLORS.Sonstiges)}>
                {doc.category}
              </span>
              <button onClick={() => download(doc)} disabled={busy === doc.id}
                className="p-2 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition" title="Herunterladen">
                {busy === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <button onClick={() => remove(doc)} disabled={busy === doc.id}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Löschen">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
