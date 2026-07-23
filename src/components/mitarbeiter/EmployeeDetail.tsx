"use client"

import { useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, IdCard, FileText, Clock, CalendarOff, FileSignature, ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { entryHours, formatHours, formatEuro } from "@/lib/hours"
import DocumentManager from "./DocumentManager"
import ContractGenerator from "./ContractGenerator"
import EmployeeSecretFile from "./EmployeeSecretFile"
import type { Employee, EmployeeDocument } from "@/types"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import DateInput from "@/components/ui/DateInput"

const POSITIONS = ["Service", "Theke", "Küche", "Spüle", "Bar", "Kasse", "Reinigung", "Leitung"]
const ROLES = [
  { value: "employee", label: "Mitarbeiter" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
]
const EMPLOYMENT = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Aushilfe"]

const ABSENCE_LABELS: Record<string, string> = { urlaub: "Urlaub", krank: "Krank", frei: "Frei", sonderurlaub: "Sonderurlaub" }

type TimeEntry = { id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null; shift_revenue?: number | null }
type Absence = { id: string; type: string; start_date: string; end_date: string; status: string; note?: string }

interface Props {
  employee: Employee
  documents: EmployeeDocument[]
  timeEntries: TimeEntry[]
  absences: Absence[]
}

type Tab = "stammdaten" | "vertrag" | "dokumente" | "zeiten" | "abwesenheiten" | "akte"

export default function EmployeeDetail({ employee, documents, timeEntries, absences }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("stammdaten")
  const [form, setForm] = useState({
    name: employee.name,
    email: employee.email,
    phone: employee.phone ?? "",
    position: employee.position,
    role: employee.role,
    employment_type: employee.employment_type ?? "Teilzeit",
    personnel_number: employee.personnel_number ?? "",
    hourly_wage: employee.hourly_wage?.toString() ?? "",
    weekly_hours: employee.weekly_hours?.toString() ?? "",
    vacation_days_per_year: employee.vacation_days_per_year?.toString() ?? "28",
    start_date: employee.start_date ?? "",
    birth_date: employee.birth_date ?? "",
    address: employee.address ?? "",
    notes: employee.notes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // router.back() (not a push Link) so Next.js restores the list's scroll
  // position; a push to /mitarbeiter would always reset scroll to top.
  function goToEmployeeList() {
    if (window.history.length > 1) router.back()
    else router.push("/mitarbeiter")
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    // Basic (team-visible) fields on employees
    await supabase.from("employees").update({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      position: form.position,
      role: form.role,
      employment_type: form.employment_type || null,
      start_date: form.start_date || null,
      personnel_number: form.personnel_number || null,
    }).eq("id", employee.id)
    // Sensitive fields in the protected, management-only table
    await supabase.from("employee_private").upsert({
      employee_id: employee.id,
      hourly_wage: form.hourly_wage ? Number(form.hourly_wage.replace(",", ".")) : null,
      weekly_hours: form.weekly_hours ? Number(form.weekly_hours.replace(",", ".")) : null,
      vacation_days_per_year: form.vacation_days_per_year ? Math.round(Number(form.vacation_days_per_year)) : null,
      birth_date: form.birth_date || null,
      address: form.address || null,
      notes: form.notes || null,
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalHours = timeEntries.reduce((sum, e) => sum + entryHours(e), 0)

  // Urlaubskonto (laufendes Jahr)
  const currentYear = new Date().getFullYear()
  function vacationDaysInYear(a: Absence): number {
    const ys = new Date(currentYear, 0, 1), ye = new Date(currentYear, 11, 31)
    const s = new Date(a.start_date) > ys ? new Date(a.start_date) : ys
    const e = new Date(a.end_date) < ye ? new Date(a.end_date) : ye
    if (e < s) return 0
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  }
  const vacationEntitlement = employee.vacation_days_per_year ?? 28
  const vacationUsed = absences.filter(a => a.type === "urlaub" && a.status === "approved").reduce((n, a) => n + vacationDaysInYear(a), 0)
  const vacationRemaining = vacationEntitlement - vacationUsed
  const wage = employee.hourly_wage ?? (form.hourly_wage ? Number(form.hourly_wage.replace(",", ".")) : 0)

  const tabs: { id: Tab; label: string; icon: typeof IdCard; count?: number }[] = [
    { id: "stammdaten", label: "Stammdaten", icon: IdCard },
    { id: "vertrag", label: "Vertrag", icon: FileSignature },
    { id: "dokumente", label: "Dokumente", icon: FileText, count: documents.length },
    { id: "zeiten", label: "Arbeitszeiten", icon: Clock, count: timeEntries.length },
    { id: "abwesenheiten", label: "Abwesenheiten", icon: CalendarOff, count: absences.length },
    { id: "akte", label: "🔒 KI-Verhaltensakte", icon: ShieldCheck },
  ]

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = tabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    setTab(nextTab.id)
    document.getElementById(`employee-tab-${nextTab.id}`)?.focus()
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
  const labelCls = "text-xs text-gray-500 mb-1 block font-medium"

  return (
    <div>
      <button
        type="button"
        onClick={goToEmployeeList}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition"
      >
        <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Alle Mitarbeiter
      </button>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 flex items-center gap-4">
        <div aria-hidden="true" className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
          style={{ backgroundColor: employee.color }}>
          {employee.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{employee.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{employee.position}</span>
            {employee.employment_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">{employee.employment_type}</span>
            )}
            {employee.hourly_wage != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{formatEuro(employee.hourly_wage)}/h</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5 overflow-x-auto" role="tablist" aria-label="Mitarbeiterdetails">
        {tabs.map(({ id, label, icon: Icon, count }, index) => (
          <button key={id} id={`employee-tab-${id}`} type="button" role="tab" aria-selected={tab === id}
            aria-controls={`employee-panel-${id}`} tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)} onKeyDown={event => handleTabKeyDown(event, index)}
            className={cn("flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition",
              tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800")}>
            <Icon aria-hidden="true" className="w-4 h-4" />
            {label}
            {count != null && <span className="text-xs text-gray-400"><span className="sr-only">, </span>({count})</span>}
          </button>
        ))}
      </div>

      {/* Stammdaten */}
      {tab === "stammdaten" && (
        <form id="employee-panel-stammdaten" role="tabpanel" aria-labelledby="employee-tab-stammdaten" tabIndex={0}
          onSubmit={event => { event.preventDefault(); void save() }} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="employee-name" className={labelCls}>Name</label><input id="employee-name" name="name" autoComplete="name" className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} /></div>
            <div><label htmlFor="employee-email" className={labelCls}>E-Mail</label><input id="employee-email" name="email" type="email" autoComplete="email" className={inputCls} value={form.email} onChange={e => set("email", e.target.value)} /></div>
            <div><label htmlFor="employee-phone" className={labelCls}>Telefon</label><input id="employee-phone" name="phone" type="tel" autoComplete="tel" className={inputCls} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div><label htmlFor="employee-address" className={labelCls}>Adresse</label><input id="employee-address" name="address" autoComplete="street-address" className={inputCls} value={form.address} onChange={e => set("address", e.target.value)} /></div>
            <div><label htmlFor="employee-position" className={labelCls}>Position</label>
              <select id="employee-position" name="position" className={inputCls} value={form.position} onChange={e => set("position", e.target.value)}>
                {POSITIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div><label htmlFor="employee-role" className={labelCls}>Rolle</label>
              <select id="employee-role" name="role" className={inputCls} value={form.role} onChange={e => set("role", e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div><label htmlFor="employee-employment-type" className={labelCls}>Anstellungsart</label>
              <select id="employee-employment-type" name="employment_type" className={inputCls} value={form.employment_type} onChange={e => set("employment_type", e.target.value)}>
                {EMPLOYMENT.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="employee-hourly-wage" className={labelCls}>Stundenlohn €</label><input id="employee-hourly-wage" name="hourly_wage" type="text" inputMode="decimal" placeholder="14,50" className={inputCls} value={form.hourly_wage} onChange={e => set("hourly_wage", e.target.value)} /></div>
              <div><label htmlFor="employee-weekly-hours" className={labelCls}>Wochenstd.</label><input id="employee-weekly-hours" name="weekly_hours" type="text" inputMode="decimal" placeholder="20" className={inputCls} value={form.weekly_hours} onChange={e => set("weekly_hours", e.target.value)} /></div>
            </div>
            <div><label htmlFor="employee-vacation-days" className={labelCls}>Urlaubsanspruch (Tage/Jahr)</label><input id="employee-vacation-days" name="vacation_days_per_year" type="text" inputMode="numeric" placeholder="28" className={inputCls} value={form.vacation_days_per_year} onChange={e => set("vacation_days_per_year", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="employee-start-date" className={labelCls}>Eintrittsdatum</label><DateInput id="employee-start-date" className={inputCls} value={form.start_date} onChange={v => set("start_date", v)} /></div>
              <div><label htmlFor="employee-personnel-number" className={labelCls}>Personalnummer</label><input id="employee-personnel-number" name="personnel_number" type="text" inputMode="numeric" placeholder="z.B. 1001" className={inputCls} value={form.personnel_number} onChange={e => set("personnel_number", e.target.value)} /></div>
            </div>
            <div><label htmlFor="employee-birth-date" className={labelCls}>Geburtsdatum</label><DateInput id="employee-birth-date" className={inputCls} value={form.birth_date} onChange={v => set("birth_date", v)} /></div>
            <div className="sm:col-span-2"><label htmlFor="employee-notes" className={labelCls}>Notizen</label>
              <textarea id="employee-notes" name="notes" rows={3} className={inputCls} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Interne Notizen, z.B. Allergien, Verfügbarkeiten …" />
            </div>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{saved ? "Mitarbeiterdaten gespeichert." : ""}</p>
          <button type="submit" disabled={saving} aria-busy={saving}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
            {saved ? <><Check aria-hidden="true" className="w-4 h-4" /> Gespeichert</> : <><Save aria-hidden="true" className="w-4 h-4" /> Speichern</>}
          </button>
        </form>
      )}

      {/* Vertrag */}
      {tab === "vertrag" && <div id="employee-panel-vertrag" role="tabpanel" aria-labelledby="employee-tab-vertrag" tabIndex={0}><ContractGenerator employee={employee} /></div>}

      {/* Dokumente */}
      {tab === "dokumente" && (
        <div id="employee-panel-dokumente" role="tabpanel" aria-labelledby="employee-tab-dokumente" tabIndex={0} className="bg-white border border-gray-200 rounded-xl p-5">
          <DocumentManager employeeId={employee.id} documents={documents} />
        </div>
      )}

      {/* Arbeitszeiten */}
      {tab === "zeiten" && (
        <div id="employee-panel-zeiten" role="tabpanel" aria-labelledby="employee-tab-zeiten" tabIndex={0} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Erfasste Arbeitszeiten</h3>
            <span className="text-sm font-semibold text-gray-700">
              Gesamt: {formatHours(totalHours)}
              {wage ? <span className="text-gray-400 font-normal"> · {formatEuro(totalHours * wage)}</span> : null}
            </span>
          </div>
          {timeEntries.length === 0 ? (
            <p className="text-center py-10 text-sm text-gray-400">Noch keine Zeiten erfasst.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[460px]">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    <th scope="col" className="text-left px-5 py-2.5">Datum</th>
                    <th scope="col" className="text-left px-4 py-2.5">Von</th>
                    <th scope="col" className="text-left px-4 py-2.5">Bis</th>
                    <th scope="col" className="text-left px-4 py-2.5">Pause</th>
                    <th scope="col" className="text-right px-5 py-2.5">Stunden</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {timeEntries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-2.5 text-gray-700">{format(new Date(e.date), "EEE dd.MM.yyyy", { locale: de })}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.clock_in?.slice(0, 5)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.clock_out ? e.clock_out.slice(0, 5) : <span className="text-emerald-600">aktiv</span>}</td>
                      <td className="px-4 py-2.5 text-gray-400">{e.break_minutes ? `${e.break_minutes} min` : "—"}</td>
                      <td className="px-5 py-2.5 text-right font-medium text-gray-800">{e.clock_out ? formatHours(entryHours(e)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Abwesenheiten */}
      {tab === "abwesenheiten" && (
        <div id="employee-panel-abwesenheiten" role="tabpanel" aria-labelledby="employee-tab-abwesenheiten" tabIndex={0}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: `Urlaubsanspruch ${currentYear}`, value: `${vacationEntitlement} Tage`, cls: "text-gray-900" },
            { label: "Genommen (genehmigt)", value: `${vacationUsed} Tage`, cls: "text-gray-900" },
            { label: "Resturlaub", value: `${vacationRemaining} Tage`, cls: vacationRemaining < 0 ? "text-red-600" : "text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className={cn("text-xl font-bold", s.cls)}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {absences.length === 0 ? (
            <p className="text-center py-10 text-sm text-gray-400">Keine Abwesenheiten erfasst.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {absences.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                    a.type === "krank" ? "bg-red-50 text-red-700" :
                    a.type === "urlaub" ? "bg-brand-50 text-brand-700" :
                    a.type === "sonderurlaub" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-600")}>
                    {ABSENCE_LABELS[a.type] ?? a.type}
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
        </div>
      )}

      {/* KI-Verhaltensakte */}
      {tab === "akte" && (
        <div id="employee-panel-akte" role="tabpanel" aria-labelledby="employee-tab-akte" tabIndex={0}>
          <EmployeeSecretFile employee={employee} timeEntries={timeEntries} absences={absences} />
        </div>
      )}
    </div>
  )
}
