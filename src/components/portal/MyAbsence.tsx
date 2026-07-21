"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, X, Paperclip } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import DateInput from "@/components/ui/DateInput"

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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const startDateRef = useRef<HTMLInputElement>(null)

  // Live-Sync: Genehmigung/Ablehnung der Leitung erscheint sofort.
  useRealtimeRefresh(["absences"])
  useEffect(() => { setAbsences(initial) }, [initial])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (showForm && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => startDateRef.current?.focus())
    } else if (!showForm && dialog.open) {
      dialog.close()
    }
  }, [showForm])

  async function submit() {
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from("absences")
      .insert({ employee_id: employeeId, ...form, status: "pending", created_at: new Date().toISOString() })
      .select().single()
    if (error || !data) {
      setNotice(error?.message ? `Antrag konnte nicht gespeichert werden: ${error.message}` : "Antrag konnte nicht gespeichert werden.")
      setSaving(false)
      return
    }
    let uploadWarning = false
    const file = fileRef.current?.files?.[0]
    if (file) {
      const payload = new FormData()
      payload.append("scope", "sicknote")
      payload.append("absenceId", data.id)
      payload.append("file", file)
      const response = await fetch("/api/agent/upload", { method: "POST", body: payload })
      const result = await response.json().catch(() => null) as { filePath?: string } | null
      if (response.ok && result?.filePath) data.attachment_path = result.filePath
      else uploadWarning = true
    }
    setAbsences(prev => [data as Absence, ...prev])
    try {
      const response = await fetch("/api/coverage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absenceId: data.id }),
      })
      const result = await response.json().catch(() => null) as { opened?: number; error?: string } | null
      const gaps = Number(result?.opened ?? 0)
      const baseNotice = !response.ok
        ? `Antrag eingereicht. Die automatische Ersatzsuche ist fehlgeschlagen: ${result?.error ?? "Bitte die Leitung informieren."}`
        : gaps > 0
          ? `Antrag eingereicht. ${gaps} betroffene Schicht${gaps > 1 ? "en" : ""} — das Team wurde um Ersatz gebeten.`
          : "Antrag eingereicht. Die Leitung prüft ihn."
      setNotice(uploadWarning ? `${baseNotice} Der Nachweis konnte nicht hochgeladen werden; bitte erneut versuchen.` : baseNotice)
    } catch {
      setNotice(uploadWarning
        ? "Antrag eingereicht. Ersatzsuche und Nachweis-Upload sind fehlgeschlagen; bitte die Leitung informieren."
        : "Antrag eingereicht. Die automatische Ersatzsuche ist fehlgeschlagen; bitte die Leitung informieren.")
      }
    setSaving(false)
    setShowForm(false)
    setForm({ type: "urlaub", start_date: "", end_date: "", note: "" })
  }

  return (
    <div>
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p role="status" aria-live="polite" className="text-sm text-brand-900 flex-1">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Hinweis schließen" className="inline-flex size-11 -m-2 items-center justify-center rounded-lg text-brand-400 hover:text-brand-600"><X aria-hidden="true" className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button ref={openButtonRef} type="button" onClick={() => setShowForm(true)} aria-haspopup="dialog" aria-controls="my-absence-form-dialog"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
          <Plus aria-hidden="true" className="w-4 h-4" /> Abwesenheit beantragen
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {absences.length === 0 ? (
          <p className="text-center py-10 text-sm text-gray-400">Noch keine Anträge.</p>
        ) : (
          <div className="divide-y divide-gray-50" role="list" aria-label="Meine Abwesenheitsanträge">
            {absences.map(a => (
              <div key={a.id} role="listitem" className="flex items-center gap-3 px-4 py-3">
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

      <dialog ref={dialogRef} id="my-absence-form-dialog" aria-labelledby="my-absence-form-title"
        onCancel={event => { event.preventDefault(); setShowForm(false) }}
        onClose={() => { setShowForm(false); openButtonRef.current?.focus() }}
        onClick={event => { if (event.target === event.currentTarget) setShowForm(false) }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm">
          <form onSubmit={event => { event.preventDefault(); void submit() }} aria-busy={saving} className="bg-white border border-gray-200 rounded-2xl p-6 w-full shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 id="my-absence-form-title" className="font-semibold text-gray-900">Abwesenheit beantragen</h2>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Dialog schließen" className="inline-flex size-11 -m-2 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700"><X aria-hidden="true" className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <fieldset>
                <legend className="text-xs text-gray-500 mb-1 block font-medium">Art</legend>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button type="button" key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))} aria-pressed={form.type === t.value}
                      className={cn("px-3 py-2 rounded-lg border text-xs font-medium transition",
                        form.type === t.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50")}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="my-absence-start-date" className="text-xs text-gray-500 mb-1 block font-medium">Von</label>
                  <DateInput id="my-absence-start-date" required value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} />
                </div>
                <div>
                  <label htmlFor="my-absence-end-date" className="text-xs text-gray-500 mb-1 block font-medium">Bis</label>
                  <DateInput id="my-absence-end-date" required min={form.start_date || undefined} value={form.end_date} onChange={v => setForm(f => ({ ...f, end_date: v }))} />
                </div>
              </div>
              <div>
                <label htmlFor="my-absence-note" className="text-xs text-gray-500 mb-1 block font-medium">Notiz (optional)</label>
                <input id="my-absence-note" name="note" type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z.B. Arzttermin" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="my-absence-attachment" className="text-xs text-gray-500 mb-1 block font-medium">Krankschein / Foto (optional)</label>
                <input ref={fileRef} id="my-absence-attachment" name="attachment" type="file" accept="image/*,.pdf,.heic" aria-describedby="my-absence-attachment-help"
                  className="w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-medium" />
                <p id="my-absence-attachment-help" className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Paperclip aria-hidden="true" className="w-3 h-3" />Foto oder PDF vom Krankschein, maximal 4 MB.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Abbrechen</button>
              <button type="submit" disabled={saving || !form.start_date || !form.end_date} aria-busy={saving}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Senden…" : "Einreichen"}
              </button>
            </div>
          </form>
      </dialog>
    </div>
  )
}
