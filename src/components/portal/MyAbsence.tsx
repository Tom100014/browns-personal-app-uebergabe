"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, X, Paperclip } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import { triggerCoverageForAbsence } from "@/lib/coverage"
import { notifyPush } from "@/lib/push-client"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { de } from "date-fns/locale"

type Absence = { id: string; type: string; start_date: string; end_date: string; note?: string; status: string; created_at: string; attachment_path?: string | null }

const TYPES = [
  { value: "urlaub", label: "Urlaub" },
  { value: "krank", label: "Krank" },
  { value: "frei", label: "Frei-Wunsch" },
  { value: "sonderurlaub", label: "Sonderurlaub" },
]

export default function MyAbsence({ absences: initial, employeeId }: { absences: Absence[]; employeeId: string }) {
  const [absences, setAbsences] = useState<Absence[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: "urlaub", start_date: "", end_date: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Live-Sync: Genehmigung/Ablehnung der Leitung erscheint sofort.
  useRealtimeRefresh(["absences"])
  useEffect(() => { setAbsences(initial) }, [initial])

  async function submit() {
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from("absences")
      .insert({ employee_id: employeeId, ...form, status: "pending", created_at: new Date().toISOString() })
      .select().single()
    if (data) {
      // Optional: Krankschein/Foto hochladen
      const file = fileRef.current?.files?.[0]
      if (file) {
        const path = `${employeeId}/${data.id}-${file.name.replace(/[^\w.\-]+/g, "_")}`
        const { error: upErr } = await supabase.storage.from("sicknotes").upload(path, file)
        if (!upErr) { await supabase.from("absences").update({ attachment_path: path }).eq("id", data.id); data.attachment_path = path }
      }
      setAbsences(prev => [data as Absence, ...prev])
      try {
        const gaps = await triggerCoverageForAbsence(supabase, {
          id: data.id, employee_id: employeeId, type: data.type, start_date: data.start_date, end_date: data.end_date,
        })
        setNotice(gaps > 0
          ? `Antrag eingereicht. ${gaps} betroffene Schicht${gaps > 1 ? "en" : ""} — das Team wurde um Ersatz gebeten.`
          : "Antrag eingereicht. Die Leitung prüft ihn.")
        if (gaps > 0) {
          notifyPush({ audience: "all", title: "🆘 Ersatz gesucht", body: "Eine Schicht braucht Vertretung — bitte prüfen.", url: "/", tag: "coverage" })
        }
      } catch {
        setNotice("Antrag eingereicht. Die Leitung prüft ihn.")
      }
    }
    setSaving(false); setShowForm(false)
    setForm({ type: "urlaub", start_date: "", end_date: "", note: "" })
  }

  return (
    <div>
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm text-brand-900 flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-brand-400 hover:text-brand-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
          <Plus className="w-4 h-4" /> Abwesenheit beantragen
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {absences.length === 0 ? (
          <p className="text-center py-10 text-sm text-gray-400">Noch keine Anträge.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {absences.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                  a.type === "krank" ? "bg-red-50 text-red-700" :
                  a.type === "urlaub" ? "bg-brand-50 text-brand-700" :
                  a.type === "sonderurlaub" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-600")}>
                  {TYPES.find(t => t.value === a.type)?.label ?? a.type}
                </span>
                <span className="text-sm text-gray-700 flex-1">
                  {format(new Date(a.start_date), "dd.MM.yyyy", { locale: de })} – {format(new Date(a.end_date), "dd.MM.yyyy", { locale: de })}
                  {a.note ? <span className="text-gray-400"> · {a.note}</span> : null}
                </span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                  a.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                  a.status === "rejected" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700")}>
                  {a.status === "approved" ? "Genehmigt" : a.status === "rejected" ? "Abgelehnt" : "Ausstehend"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Abwesenheit beantragen</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Art</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={cn("px-3 py-2 rounded-lg border text-xs font-medium transition",
                        form.type === t.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50")}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Von</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Bis</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Notiz (optional)</label>
                <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z.B. Arzttermin" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Krankschein / Foto (optional)</label>
                <input ref={fileRef} type="file" accept="image/*,.pdf,.heic"
                  className="w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-medium" />
                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Paperclip className="w-3 h-3" />Foto vom Krankschein direkt vom Handy hochladen.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Abbrechen</button>
              <button onClick={submit} disabled={saving || !form.start_date || !form.end_date}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Senden…" : "Einreichen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
