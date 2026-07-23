"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Download, TrendingUp, Clock, Euro, Percent, Save, Check, Plus, Trash2, FileSpreadsheet, ChevronDown, Printer } from "lucide-react"
import { entryHours, shiftHours, formatHours, formatEuro } from "@/lib/hours"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Employee } from "@/types"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import DailyRevenueManager from "./DailyRevenueManager"

type Entry = { employee_id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null }
type ShiftRow = { employee_id: string | null; date: string; start_time: string; end_time: string }
type AbsenceRow = { employee_id: string; type: string; start_date: string; end_date: string; status: string }
type Extra = { id: string; employee_id: string; type: string; label: string | null; amount: number }
type DatevConfig = { berater: string; mandant: string; la_stunden: string; la_zulage: string; la_spesen: string }

const DATEV_DEFAULT: DatevConfig = { berater: "", mandant: "", la_stunden: "200", la_zulage: "210", la_spesen: "220" }

interface Props {
  employees: Employee[]
  entries: Entry[]
  shifts: ShiftRow[]
  absences: AbsenceRow[]
}

function lastMonths(count: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: de }) })
  }
  return out
}

function absenceDaysInMonth(a: AbsenceRow, month: string): number {
  const [y, m] = month.split("-").map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd = new Date(y, m, 0)
  const start = new Date(a.start_date) > monthStart ? new Date(a.start_date) : monthStart
  const end = new Date(a.end_date) < monthEnd ? new Date(a.end_date) : monthEnd
  if (end < start) return 0
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

const num = (n: number) => n.toFixed(1).replace(".", ",")

export default function PayrollReport({ employees, entries, shifts, absences }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const months = useMemo(() => lastMonths(12), [])
  const [month, setMonth] = useState(months[0].value)
  const [revenue, setRevenue] = useState<number>(0)
  const [revInput, setRevInput] = useState("")
  const [savingRev, setSavingRev] = useState(false)
  const [savedRev, setSavedRev] = useState(false)

  // Load the stored revenue for the selected month.
  useEffect(() => {
    let active = true
    supabase.from("revenue").select("amount").eq("month", month).maybeSingle().then(({ data }) => {
      if (!active) return
      const amt = data?.amount ? Number(data.amount) : 0
      setRevenue(amt)
      setRevInput(amt ? String(amt).replace(".", ",") : "")
    })
    return () => { active = false }
  }, [month, supabase])

  async function saveRevenue() {
    setSavingRev(true)
    const amount = revInput ? Number(revInput.replace(",", ".")) : 0
    await supabase.from("revenue").upsert({ month, amount, updated_at: new Date().toISOString() })
    setRevenue(amount)
    setSavingRev(false); setSavedRev(true); setTimeout(() => setSavedRev(false), 2000)
  }

  // Zulagen & Spesen (extras) für den Monat
  const [extras, setExtras] = useState<Extra[]>([])
  const [exForm, setExForm] = useState({ employee_id: "", type: "zulage", label: "", amount: "" })
  const loadExtras = useCallback(async (selectedMonth: string) => {
    const { data } = await supabase.from("extras").select("id,employee_id,type,label,amount").eq("month", selectedMonth)
    return (data ?? []) as Extra[]
  }, [supabase])
  useEffect(() => {
    let active = true
    void loadExtras(month).then(data => { if (active) setExtras(data) })
    return () => { active = false }
  }, [loadExtras, month])

  async function addExtra() {
    if (!exForm.employee_id || !exForm.amount) return
    await supabase.from("extras").insert({
      employee_id: exForm.employee_id, month, type: exForm.type,
      label: exForm.label || null, amount: Number(exForm.amount.replace(",", ".")),
    })
    setExForm({ employee_id: "", type: "zulage", label: "", amount: "" })
    setExtras(await loadExtras(month))
  }
  async function deleteExtra(id: string) {
    await supabase.from("extras").delete().eq("id", id)
    setExtras(prev => prev.filter(e => e.id !== id))
  }
  const extraIndexes = useMemo(() => {
    const byEmployee = new Map<string, number>()
    const byEmployeeAndType = new Map<string, number>()
    for (const extra of extras) {
      const amount = Number(extra.amount)
      byEmployee.set(extra.employee_id, (byEmployee.get(extra.employee_id) ?? 0) + amount)
      const key = `${extra.employee_id}:${extra.type}`
      byEmployeeAndType.set(key, (byEmployeeAndType.get(key) ?? 0) + amount)
    }
    return { byEmployee, byEmployeeAndType }
  }, [extras])
  const extrasFor = (empId: string) => extraIndexes.byEmployee.get(empId) ?? 0
  const extrasForType = (empId: string, type: string) => extraIndexes.byEmployeeAndType.get(`${empId}:${type}`) ?? 0
  const extrasTotal = extras.reduce((s, e) => s + Number(e.amount), 0)

  // DATEV-Lohnimport (Bewegungsdaten) — Konfiguration in settings 'datev_config'
  const [datev, setDatev] = useState<DatevConfig>(DATEV_DEFAULT)
  const [datevOpen, setDatevOpen] = useState(false)
  const [savingDatev, setSavingDatev] = useState(false)
  const [savedDatev, setSavedDatev] = useState(false)
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "datev_config").maybeSingle().then(({ data }) => {
      if (!data?.value) return
      try { setDatev({ ...DATEV_DEFAULT, ...JSON.parse(data.value) }) } catch { /* ignore */ }
    })
  }, [supabase])
  async function saveDatevConfig() {
    setSavingDatev(true)
    await supabase.from("settings").upsert({ key: "datev_config", value: JSON.stringify(datev) })
    setSavingDatev(false); setSavedDatev(true); setTimeout(() => setSavedDatev(false), 2000)
  }

  const hoursIndexes = useMemo(() => {
    const actual = new Map<string, number>()
    const planned = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.clock_out) continue
      const key = `${entry.employee_id}:${entry.date.slice(0, 7)}`
      actual.set(key, (actual.get(key) ?? 0) + entryHours(entry))
    }
    for (const shift of shifts) {
      if (!shift.employee_id) continue
      const key = `${shift.employee_id}:${shift.date.slice(0, 7)}`
      planned.set(key, (planned.get(key) ?? 0) + shiftHours(shift))
    }
    return { actual, planned }
  }, [entries, shifts])
  const absencesByEmployee = useMemo(() => {
    const index = new Map<string, AbsenceRow[]>()
    for (const absence of absences) {
      const rows = index.get(absence.employee_id) ?? []
      rows.push(absence)
      index.set(absence.employee_id, rows)
    }
    return index
  }, [absences])

  const rows = useMemo(() => employees.map(emp => {
    const key = `${emp.id}:${month}`
    const istHours = hoursIndexes.actual.get(key) ?? 0
    const planHours = hoursIndexes.planned.get(key) ?? 0
    const absDays = (absencesByEmployee.get(emp.id) ?? []).filter(a => a.status !== "rejected").reduce((sum, absence) => sum + absenceDaysInMonth(absence, month), 0)
    const wage = emp.hourly_wage ?? 0
    return { emp, istHours, planHours, diff: istHours - planHours, absDays, cost: istHours * wage, wage }
  }), [absencesByEmployee, employees, hoursIndexes, month])

  const totals = useMemo(() => rows.reduce((t, r) => ({
    ist: t.ist + r.istHours, plan: t.plan + r.planHours, abs: t.abs + r.absDays, cost: t.cost + r.cost,
  }), { ist: 0, plan: 0, abs: 0, cost: 0 }), [rows])

  const quote = revenue > 0 ? (totals.cost / revenue) * 100 : null

  // 6-Monats-Trend (Lohnkosten je Monat)
  const trend = useMemo(() => months.slice(0, 6).reverse().map(m => {
    let cost = 0
    for (const emp of employees) {
      const wage = emp.hourly_wage ?? 0
      const h = hoursIndexes.actual.get(`${emp.id}:${m.value}`) ?? 0
      cost += h * wage
    }
    return { label: m.label.split(" ")[0].slice(0, 3), cost }
  }), [employees, hoursIndexes, months])
  const trendMax = Math.max(...trend.map(t => t.cost), 1)

  function exportCsv() {
    const head = ["Mitarbeiter", "Position", "Anstellung", "Stundenlohn", "Ist-Stunden", "Geplant", "Über-/Unterstunden", "Abwesenheitstage", "Lohnkosten", "Zulagen/Spesen", "Gesamt"]
    const lines = rows.map(r => {
      const ex = extrasFor(r.emp.id)
      return [
        r.emp.name, r.emp.position, r.emp.employment_type ?? "", r.wage ? r.wage.toFixed(2).replace(".", ",") : "",
        num(r.istHours), num(r.planHours), (r.diff >= 0 ? "+" : "") + num(r.diff), String(r.absDays),
        r.cost.toFixed(2).replace(".", ","), ex.toFixed(2).replace(".", ","), (r.cost + ex).toFixed(2).replace(".", ","),
      ]
    })
    lines.push(["GESAMT", "", "", "", num(totals.ist), num(totals.plan), (totals.ist - totals.plan >= 0 ? "+" : "") + num(totals.ist - totals.plan), String(totals.abs), totals.cost.toFixed(2).replace(".", ","), extrasTotal.toFixed(2).replace(".", ","), (totals.cost + extrasTotal).toFixed(2).replace(".", ",")])
    lines.push([])
    if (extras.length) {
      lines.push(["Zulagen/Spesen — Details"])
      lines.push(["Mitarbeiter", "Art", "Bezeichnung", "Betrag"])
      for (const e of extras) {
        const emp = employees.find(x => x.id === e.employee_id)
        lines.push([emp?.name ?? "", e.type, e.label ?? "", Number(e.amount).toFixed(2).replace(".", ",")])
      }
      lines.push([])
    }
    lines.push(["Umsatz", revenue.toFixed(2).replace(".", ",")])
    lines.push(["Personalkosten-Quote", quote != null ? quote.toFixed(1).replace(".", ",") + " %" : "—"])
    const csv = [head, ...lines].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `Lohnauswertung_${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // DATEV Lohn & Gehalt — Bewegungsdaten-Import (Stunden + Zulagen/Spesen je Personalnummer).
  // Die Lohnarten/Berater-/Mandantennummer müssen mit dem DATEV-Setup des Steuerberaters übereinstimmen.
  function exportDatev() {
    const dec = (n: number) => n.toFixed(2).replace(".", ",")
    const head = ["Beraternummer", "Mandantennummer", "Personalnummer", "Name", "Lohnart", "Bezeichnung", "Wert", "Einheit", "Abrechnungsmonat"]
    const out: string[][] = []
    let missingPnr = 0
    for (const r of rows) {
      const pnr = r.emp.personnel_number ?? ""
      if (!pnr) missingPnr++
      const base = [datev.berater, datev.mandant, pnr, r.emp.name]
      if (r.istHours > 0.01) out.push([...base, datev.la_stunden, "Arbeitsstunden", dec(r.istHours), "Std", month])
      const zul = extrasForType(r.emp.id, "zulage")
      if (zul > 0.01) out.push([...base, datev.la_zulage, "Zulage", dec(zul), "EUR", month])
      const spe = extrasForType(r.emp.id, "spesen") + extrasForType(r.emp.id, "sonstige")
      if (spe > 0.01) out.push([...base, datev.la_spesen, "Spesen/Sonstige", dec(spe), "EUR", month])
    }
    if (out.length === 0) { alert("Keine Stunden oder Zulagen/Spesen in diesem Monat für den DATEV-Export."); return }
    if (missingPnr > 0 && !confirm(`${missingPnr} Mitarbeiter haben keine Personalnummer (für DATEV erforderlich). Trotzdem exportieren? Du kannst Personalnummern unter „Mitarbeiter“ ergänzen.`)) return
    const csv = [head, ...out].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `DATEV_Lohnimport_${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const stats = [
    { label: "Ist-Stunden", value: formatHours(totals.ist), icon: Clock, color: "text-brand-600", bg: "bg-brand-50" },
    { label: "Geplant", value: formatHours(totals.plan), icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Lohnkosten", value: formatEuro(totals.cost), icon: Euro, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Personalkosten-Quote", value: quote != null ? `${quote.toFixed(1).replace(".", ",")} %` : "—", icon: Percent, color: "text-rose-600", bg: "bg-rose-50" },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3.5 py-2 rounded-lg border border-gray-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 self-start capitalize">
          {months.map(m => <option key={m.value} value={m.value} className="capitalize">{m.label}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            <Printer className="w-4 h-4" /> PDF / Drucken
          </button>
          <button onClick={exportCsv}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={exportDatev}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition">
            <FileSpreadsheet className="w-4 h-4" /> DATEV-Export
          </button>
        </div>
      </div>

      {/* DATEV-Konfiguration */}
      <div className="bg-white border border-gray-200 rounded-xl mb-4">
        <button onClick={() => setDatevOpen(o => !o)} className="w-full flex items-center gap-2 px-5 py-3.5 text-left">
          <FileSpreadsheet className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">DATEV-Lohnimport — Einstellungen</span>
          <span className="text-xs text-gray-400 ml-1 hidden sm:inline">Berater-/Mandantennummer &amp; Lohnarten</span>
          <ChevronDown className={cn("w-4 h-4 text-gray-400 ml-auto transition", datevOpen && "rotate-180")} />
        </button>
        {datevOpen && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Diese Werte müssen mit dem DATEV-Setup deines Steuerberaters übereinstimmen. Der Export erzeugt eine Bewegungsdaten-Datei
              (Arbeitsstunden + Zulagen/Spesen je Personalnummer) für &quot;Lohn und Gehalt&quot;. Personalnummern pflegst du unter <strong>Mitarbeiter</strong>.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {([
                { k: "berater", label: "Beraternummer", ph: "z.B. 1234567" },
                { k: "mandant", label: "Mandantennummer", ph: "z.B. 54321" },
                { k: "la_stunden", label: "Lohnart Stunden", ph: "200" },
                { k: "la_zulage", label: "Lohnart Zulage", ph: "210" },
                { k: "la_spesen", label: "Lohnart Spesen", ph: "220" },
              ] as { k: keyof DatevConfig; label: string; ph: string }[]).map(f => (
                <div key={f.k}>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">{f.label}</label>
                  <input value={datev[f.k]} onChange={e => setDatev(d => ({ ...d, [f.k]: e.target.value }))} placeholder={f.ph}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              ))}
            </div>
            <button onClick={saveDatevConfig} disabled={savingDatev}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
              {savedDatev ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Speichern</>}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-gray-500 text-sm mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tages-Umsatzerfassung & Diagramme */}
      <DailyRevenueManager
        month={month}
        employees={employees}
        entries={entries}
        onMonthlyRevenueChange={newRev => {
          setRevenue(newRev)
          setRevInput(newRev ? String(newRev).replace(".", ",") : "")
        }}
      />

      {/* Umsatz-Eingabe (Basis für Personalkosten-Quote; später aus Kassensystem) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block font-medium">Umsatz im Monat (€)</label>
            <input value={revInput} onChange={e => setRevInput(e.target.value)} inputMode="decimal" placeholder="z.B. 18500"
              className="w-full sm:w-60 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <button onClick={saveRevenue} disabled={savingRev}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
            {savedRev ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Umsatz speichern</>}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Grundlage für die Personalkosten-Quote (Lohnkosten ÷ Umsatz). Später automatisch aus dem Kassensystem.
          {quote != null && <span className="text-gray-600"> Aktuell: <strong>{quote.toFixed(1).replace(".", ",")} %</strong> {quote > 35 ? "— über dem üblichen Gastro-Richtwert (~30–35 %)." : "— im üblichen Rahmen."}</span>}
        </p>
      </div>

      {/* Zulagen & Spesen */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Zulagen &amp; Spesen ({months.find(m => m.value === month)?.label})</h2>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <select value={exForm.employee_id} onChange={e => setExForm(f => ({ ...f, employee_id: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-44">
            <option value="">Mitarbeiter…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={exForm.type} onChange={e => setExForm(f => ({ ...f, type: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="zulage">Zulage</option><option value="spesen">Spesen</option><option value="sonstige">Sonstige</option>
          </select>
          <input value={exForm.label} onChange={e => setExForm(f => ({ ...f, label: e.target.value }))} placeholder="Bezeichnung (z.B. Nachtzuschlag)"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          <input value={exForm.amount} onChange={e => setExForm(f => ({ ...f, amount: e.target.value }))} placeholder="€" inputMode="decimal"
            className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          <button onClick={addExtra} disabled={!exForm.employee_id || !exForm.amount}
            className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {extras.length === 0 ? (
          <p className="text-xs text-gray-400">Keine Zulagen/Spesen in diesem Monat.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {extras.map(e => {
              const emp = employees.find(x => x.id === e.employee_id)
              return (
                <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="font-medium text-gray-800 w-40 truncate">{emp?.name ?? "—"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{e.type}</span>
                  <span className="text-gray-500 flex-1 truncate">{e.label ?? ""}</span>
                  <span className="font-semibold text-gray-900">{formatEuro(Number(e.amount))}</span>
                  <button onClick={() => deleteExtra(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )
            })}
            <div className="flex justify-between pt-2 text-sm font-semibold text-gray-900">
              <span>Summe Zulagen/Spesen</span><span>{formatEuro(extrasTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 6-Monats-Trend Lohnkosten */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Lohnkosten — letzte 6 Monate</h2>
        <div className="flex gap-2 sm:gap-3 h-32">
          {trend.map((t, i) => (
            <div key={i} className="flex-1 h-full flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-medium h-3">{t.cost > 0 ? Math.round(t.cost) : ""}</span>
              <div className="w-full flex-1 bg-gray-100 rounded-md flex items-end overflow-hidden">
                <div className="w-full rounded-md bg-emerald-500 transition-all" style={{ height: `${Math.round((t.cost / trendMax) * 100)}%`, minHeight: t.cost > 0 ? 6 : 0 }} />
              </div>
              <span className="text-xs text-gray-500 font-medium capitalize">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stunden pro Mitarbeiter */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Stunden pro Mitarbeiter</h2>
        {rows.every(r => r.istHours === 0) ? (
          <p className="text-sm text-gray-400">Keine erfassten Stunden in diesem Monat.</p>
        ) : (
          <div className="space-y-3">
            {[...rows].sort((a, b) => b.istHours - a.istHours).map(r => {
              const max = Math.max(...rows.map(x => x.istHours), 1)
              const pct = Math.round((r.istHours / max) * 100)
              return (
                <div key={r.emp.id} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-gray-700 truncate flex-shrink-0">{r.emp.name}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                    <div className="h-full rounded-md flex items-center justify-end px-2 transition-all"
                      style={{ width: `${Math.max(pct, r.istHours > 0 ? 8 : 0)}%`, backgroundColor: r.emp.color }}>
                      {r.istHours > 0 && <span className="text-[11px] font-semibold text-white whitespace-nowrap">{num(r.istHours)} h</span>}
                    </div>
                  </div>
                  <span className="w-20 text-right text-xs text-gray-500 flex-shrink-0">{r.wage ? formatEuro(r.cost) : "—"}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="border-b border-gray-100">
            <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
              <th className="text-left px-5 py-3">Mitarbeiter</th>
              <th className="text-left px-4 py-3">Anstellung</th>
              <th className="text-right px-4 py-3">Lohn</th>
              <th className="text-right px-4 py-3">Ist</th>
              <th className="text-right px-4 py-3">Geplant</th>
              <th className="text-right px-4 py-3">+/− Std.</th>
              <th className="text-right px-4 py-3">Abw.</th>
              <th className="text-right px-5 py-3">Lohnkosten</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={r.emp.id} className={cn("hover:bg-brand-50/40 transition-colors", i % 2 === 1 && "bg-gray-50/50")}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: r.emp.color }}>
                      {r.emp.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                    <div><p className="font-medium text-gray-800">{r.emp.name}</p><p className="text-xs text-gray-400">{r.emp.position}</p></div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{r.emp.employment_type ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-600">{r.wage ? formatEuro(r.wage) : "—"}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{num(r.istHours)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{num(r.planHours)}</td>
                <td className={cn("px-4 py-3 text-right font-medium", r.diff > 0.05 ? "text-emerald-600" : r.diff < -0.05 ? "text-rose-600" : "text-gray-400")}>
                  {r.diff >= 0 ? "+" : ""}{num(r.diff)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{r.absDays || "—"}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">{r.wage ? formatEuro(r.cost) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50/60">
            <tr className="font-semibold text-gray-900">
              <td className="px-5 py-3" colSpan={3}>Gesamt</td>
              <td className="px-4 py-3 text-right">{num(totals.ist)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{num(totals.plan)}</td>
              <td className="px-4 py-3 text-right">{totals.ist - totals.plan >= 0 ? "+" : ""}{num(totals.ist - totals.plan)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{totals.abs || "—"}</td>
              <td className="px-5 py-3 text-right">{formatEuro(totals.cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
        <p className="text-xs text-gray-400">
          Ist-Stunden aus der Stempeluhr (abzgl. Pausen). +/− Std. = Ist gegenüber geplant. Lohnkosten = Ist-Stunden × Stundenlohn.
          Für die Lohnabrechnung den CSV-Export an den Steuerberater geben.
        </p>
        <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
          Gesamt inkl. Zulagen/Spesen: {formatEuro(totals.cost + extrasTotal)}
        </p>
      </div>
    </div>
  )
}
