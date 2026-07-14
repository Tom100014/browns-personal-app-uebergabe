"use client"

import { useState, useEffect } from "react"
import { Plus, Check, X, LifeBuoy, CalendarDays, List, Paperclip } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import type { Employee } from "@/types"
import { cn } from "@/lib/utils"
import { triggerCoverageForAbsence } from "@/lib/coverage"
import { notifyPush } from "@/lib/push-client"
import { logAudit } from "@/lib/audit"
import AbsenceTimeline from "./AbsenceTimeline"

export type Absence = {
  id: string; employee_id: string; type: string; start_date: string; end_date: string
  note?: string; status: "pending" | "approved" | "rejected"; created_at: string
  attachment_path?: string | null
  employee?: Employee
}

async function viewAttachment(path: string) {
  const supabase = createClient()
  const { data } = await supabase.storage.from("sicknotes").createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, "_blank")
}

interface Props { absences: Absence[]; employees: Employee[] }

const TYPES = [
  { value: "urlaub", label: "Urlaub", color: "bg-brand-50 text-brand-700 border-brand-200" },
  { value: "krank", label: "Krank", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "frei", label: "Frei", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "sonderurlaub", label: "Sonderurlaub", color: "bg-purple-50 text-purple-700 border-purple-200" },
]

export default function AbsenceManager({ absences: initial, employees }: Props) {
  const [absences, setAbsences] = useState<Absence[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employee_id: employees[0]?.id ?? "", type: "urlaub", start_date: "", end_date: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all")
  const [view, setView] = useState<"kalender" | "liste">("kalender")
  const [notice, setNotice] = useState<string | null>(null)

  // Live-Sync: neue Anträge erscheinen ohne Neuladen.
  useRealtimeRefresh(["absences"])
  useEffect(() => { setAbsences(initial) }, [initial])

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from("absences")
      .insert({ ...form, status: "pending", created_at: new Date().toISOString() })
      .select("*, employee:employees(*)").single()
    if (data) {
      const absence = data as Absence
      setAbsences(prev => [absence, ...prev])
      // Vertretungs-Engine: prüft kollidierende Schichten und sucht im Chat nach Ersatz.
      try {
        const gaps = await triggerCoverageForAbsence(supabase, {
          id: absence.id,
          employee_id: absence.employee_id,
          type: absence.type,
          start_date: absence.start_date,
          end_date: absence.end_date,
        })
        if (gaps > 0) {
          const emp = employees.find(e => e.id === absence.employee_id)
          setNotice(
            `${gaps} Schicht${gaps > 1 ? "en" : ""} von ${emp?.name ?? "diesem Mitarbeiter"} betroffen — ` +
            `Ersatz-Anfrage wurde im Team-Chat gepostet. Die Leitung sieht Vorschläge unter „Vertretung".`
          )
          notifyPush({
            audience: "all",
            title: "🆘 Ersatz gesucht",
            body: `${emp?.name ?? "Ein Mitarbeiter"} fällt aus — bitte Vertretung prüfen.`,
            url: "/",
            tag: "coverage",
          })
        }
      } catch {
        setNotice("Eintrag gespeichert. Automatische Ersatzsuche konnte nicht ausgeführt werden.")
      }
    }
    setSaving(false); setShowForm(false)
    setForm({ employee_id: employees[0]?.id ?? "", type: "urlaub", start_date: "", end_date: "", note: "" })
  }

  async function updateStatus(id: string, status: "approved" | "rejected") {
    const supabase = createClient()
    await supabase.from("absences").update({ status }).eq("id", id)
    const absence = absences.find(a => a.id === id)
    setAbsences(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    if (absence) {
      const who = employees.find(e => e.id === absence.employee_id)?.name ?? "Mitarbeiter"
      logAudit(status === "approved" ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt", `${who}: ${absence.type} ${absence.start_date}–${absence.end_date}`)
      notifyPush({
        employeeIds: [absence.employee_id],
        title: status === "approved" ? "✅ Antrag genehmigt" : "❌ Antrag abgelehnt",
        body: `Deine Abwesenheit ${absence.start_date} – ${absence.end_date} wurde ${status === "approved" ? "genehmigt" : "abgelehnt"}.`,
        url: "/",
        tag: "absence-" + id,
      })
    }
  }

  const filtered = absences.filter(a => filter === "all" ? true : a.status === filter)

  // Übersicht: heute abwesend, diese Woche, ausstehende Anträge
  const todayStr = new Date().toLocaleDateString("en-CA")
  const _now = new Date(); const _d = (_now.getDay() + 6) % 7
  const _ws = new Date(_now); _ws.setDate(_now.getDate() - _d)
  const _we = new Date(_ws); _we.setDate(_ws.getDate() + 6)
  const weekStart = _ws.toLocaleDateString("en-CA"); const weekEnd = _we.toLocaleDateString("en-CA")
  const heuteAbwesend = new Set(absences.filter(a => a.status === "approved" && todayStr >= a.start_date && todayStr <= a.end_date).map(a => a.employee_id)).size
  const wocheAbwesend = new Set(absences.filter(a => a.status !== "rejected" && a.end_date >= weekStart && a.start_date <= weekEnd).map(a => a.employee_id)).size
  const ausstehend = absences.filter(a => a.status === "pending").length
  const summary = [
    { label: "Heute abwesend", value: heuteAbwesend, classes: "text-red-600 bg-red-50" },
    { label: "Diese Woche", value: wocheAbwesend, classes: "text-violet-600 bg-violet-50" },
    { label: "Offene Anträge", value: ausstehend, classes: "text-orange-600 bg-orange-50" },
  ]

  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1

  return (
    <>
      {notice && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <LifeBuoy className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-900 leading-relaxed flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-brand-400 hover:text-brand-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        {summary.map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3.5">
            <p className={cn("inline-flex items-center justify-center w-8 h-8 rounded-lg text-base font-bold tabular-nums mb-2", s.classes)}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 self-start">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView("kalender")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition",
                view === "kalender" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              <CalendarDays className="w-3.5 h-3.5" /> Kalender
            </button>
            <button onClick={() => setView("liste")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition",
                view === "liste" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
              <List className="w-3.5 h-3.5" /> Liste
            </button>
          </div>
          {view === "liste" && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["all","pending","approved"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition",
                    filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                  {f === "all" ? "Alle" : f === "pending" ? "Ausstehend" : "Genehmigt"}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
          <Plus className="w-4 h-4" /> Abwesenheit melden
        </button>
      </div>

      {view === "kalender" && <AbsenceTimeline absences={absences} employees={employees} />}

      {view === "liste" && (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Keine Einträge vorhanden.</div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-gray-100">
              <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="text-left px-5 py-3">Mitarbeiter</th>
                <th className="text-left px-4 py-3">Typ</th>
                <th className="text-left px-4 py-3">Zeitraum</th>
                <th className="text-left px-4 py-3">Tage</th>
                <th className="text-left px-4 py-3">Notiz</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(a => {
                const emp = employees.find(e => e.id === a.employee_id)
                const typeInfo = TYPES.find(t => t.value === a.type)
                return (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: emp?.color ?? "#6366f1" }}>
                          {emp?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                        </div>
                        <span className="font-medium text-gray-800">{emp?.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", typeInfo?.color)}>
                        {typeInfo?.label ?? a.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.start_date} – {a.end_date}</td>
                    <td className="px-4 py-3 text-gray-600">{daysBetween(a.start_date, a.end_date)} Tage</td>
                    <td className="px-4 py-3 text-gray-400">
                      {a.attachment_path ? (
                        <button onClick={() => viewAttachment(a.attachment_path!)}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                          <Paperclip className="w-3 h-3" /> Krankschein
                        </button>
                      ) : (a.note ?? "—")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                        a.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                        a.status === "rejected" ? "bg-red-50 text-red-700" :
                        "bg-orange-50 text-orange-700")}>
                        {a.status === "approved" ? "Genehmigt" : a.status === "rejected" ? "Abgelehnt" : "Ausstehend"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(a.id, "approved")}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition" title="Genehmigen">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => updateStatus(a.id, "rejected")}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Ablehnen">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Abwesenheit melden</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Mitarbeiter</label>
                <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Typ</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={cn("px-3 py-2 rounded-lg border text-xs font-medium transition",
                        form.type === t.value ? t.color : "border-gray-200 text-gray-500 hover:bg-gray-50")}>
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
                <label className="text-xs text-gray-500 mb-1 block font-medium">Notiz</label>
                <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Abbrechen</button>
              <button onClick={save} disabled={saving || !form.start_date || !form.end_date}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Speichern…" : "Einreichen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
