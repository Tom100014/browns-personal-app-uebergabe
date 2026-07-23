"use client"

import { useState, useEffect, useMemo } from "react"
import { Play, Square, Wifi, WifiOff, AlertTriangle, Clock, ShieldAlert, Plus, Euro, Check, X } from "lucide-react"
import { useRealtimeRefresh } from "@/lib/realtime"
import type { TimeEntry, Employee, Shift } from "@/types"
import { cn, calcHours } from "@/lib/utils"
import { format } from "date-fns"
import { de } from "date-fns/locale"

interface Props {
  entries: TimeEntry[]
  employees: Employee[]
  shifts?: Shift[]
  locationConfigured: boolean
  lockedEmployeeId?: string
  hero?: boolean
  isAdmin?: boolean
}

export default function TimeTracker({
  entries: initialEntries,
  employees,
  shifts = [],
  locationConfigured,
  lockedEmployeeId,
  hero = false,
  isAdmin = false,
}: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries)
  const [selectedEmployee, setSelectedEmployee] = useState(lockedEmployeeId ?? employees[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [actionError, setActionError] = useState("")
  const [breakMinutes, setBreakMinutes] = useState(0)

  // Mandatory Shift Revenue Clock-Out Modal State
  const [showClockOutModal, setShowClockOutModal] = useState(false)
  const [clockOutTarget, setClockOutTarget] = useState<TimeEntry | null>(null)
  const [shiftRevenueInput, setShiftRevenueInput] = useState("")
  const [revenueValidationError, setRevenueValidationError] = useState("")

  // Retroactive Admin Form State
  const [showRetroModal, setShowRetroModal] = useState(false)
  const [retroForm, setRetroForm] = useState({
    employeeId: employees[0]?.id ?? "",
    date: format(new Date(), "yyyy-MM-dd"),
    clockIn: "09:00",
    clockOut: "17:00",
    breakMinutes: 30,
    note: "Nachtrag durch Leitung",
  })
  const [retroSaving, setRetroSaving] = useState(false)

  // Live-Timer für Hero
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hero) return
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [hero])

  const todayStr = format(new Date(), "yyyy-MM-dd")

  // Live-Sync
  useRealtimeRefresh(["time_entries"])
  useEffect(() => { setEntries(initialEntries) }, [initialEntries])

  const activeEntry = entries.find(e => e.employee_id === selectedEmployee && !e.clock_out)

  // Missing Clock-in Detection (Idee 1)
  const missingClockIns = useMemo(() => {
    if (!shifts || shifts.length === 0) return []
    const nowTime = format(new Date(), "HH:mm")

    return shifts.filter(shift => {
      if (shift.status === "absent" || !shift.employee_id) return false
      const hasEntry = entries.some(
        e => e.employee_id === shift.employee_id && e.date === shift.date
      )
      if (hasEntry) return false

      if (shift.date < todayStr) return true
      if (shift.date === todayStr) {
        return shift.start_time.slice(0, 5) <= nowTime
      }
      return false
    })
  }, [shifts, entries, todayStr])

  async function clockIn() {
    if (!selectedEmployee) return
    setLoading(true); setRejected(false); setActionError("")
    try {
      const res = await fetch("/api/timeentries/clockin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmployee }),
      })
      const data = await res.json()
      if (data.error === "location") { setRejected(true) }
      else if (data.entry) { setEntries(prev => [data.entry as TimeEntry, ...prev]) }
      else setActionError(data.error || "Einstempeln fehlgeschlagen.")
    } catch { setActionError("Keine Verbindung zum Server.") }
    setLoading(false)
  }

  function initiateClockOut(entry: TimeEntry) {
    setClockOutTarget(entry)
    setShiftRevenueInput("")
    setRevenueValidationError("")
    setShowClockOutModal(true)
  }

  async function executeClockOut() {
    if (!clockOutTarget) return
    const revenueVal = parseFloat(shiftRevenueInput.replace(",", "."))
    if (isNaN(revenueVal) || revenueVal < 0) {
      setRevenueValidationError("⚠️ Der Schichtumsatz ist eine Pflichtangabe beim Ausstempeln. Bitte gib deinen Betrag in € an.")
      return
    }

    setLoading(true)
    setActionError("")
    setRevenueValidationError("")

    try {
      const res = await fetch("/api/timeentries/clockin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: clockOutTarget.id, breakMinutes, shiftRevenue: revenueVal }),
      })
      const data = await res.json()
      if (data.entry) {
        setEntries(prev => prev.map(e => e.id === clockOutTarget.id ? data.entry as TimeEntry : e))
        setShowClockOutModal(false)
        setClockOutTarget(null)
      } else {
        setRevenueValidationError(data.error || "Ausstempeln fehlgeschlagen.")
      }
    } catch {
      setRevenueValidationError("Keine Verbindung zum Server.")
    } finally {
      setLoading(false)
    }
  }

  function openRetroForm(empId?: string, shiftDate?: string, startTime?: string, endTime?: string) {
    setRetroForm({
      employeeId: empId || selectedEmployee || employees[0]?.id || "",
      date: shiftDate || todayStr,
      clockIn: startTime ? startTime.slice(0, 5) : "09:00",
      clockOut: endTime ? endTime.slice(0, 5) : "17:00",
      breakMinutes: 30,
      note: "Nachtrag durch Leitung (Stempelung gefehlt)",
    })
    setShowRetroModal(true)
  }

  async function submitRetroactiveEntry() {
    setRetroSaving(true)
    setActionError("")
    try {
      const res = await fetch("/api/timeentries/retroactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retroForm),
      })
      const data = await res.json()
      if (data.ok && data.entry) {
        setEntries(prev => [data.entry as TimeEntry, ...prev])
        setShowRetroModal(false)
      } else {
        setActionError(data.error || "Nachträgliches Einstempeln fehlgeschlagen.")
      }
    } catch {
      setActionError("Verbindungsfehler beim Server.")
    } finally {
      setRetroSaving(false)
    }
  }

  const todayEntries = entries.filter(e => e.date === todayStr)
  const totalToday = todayEntries.reduce((s, e) => s + (e.total_hours ?? 0), 0)

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Automatischer Hinweis: Fehlendes Einstempeln erkannt (Idee 1) */}
      {isAdmin && missingClockIns.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <h3 className="text-sm font-bold text-amber-900">
              Automatischer Hinweis: {missingClockIns.length} Mitarbeiter {missingClockIns.length === 1 ? "ist" : "sind"} nicht eingestempelt!
            </h3>
          </div>
          <p className="text-xs text-amber-800 mb-3">
            Das System hat erkannt, dass für folgende geplante Schicht(en) bisher keine Einstempelung vorliegt:
          </p>

          <div className="space-y-2">
            {missingClockIns.map(shift => {
              const emp = employees.find(e => e.id === shift.employee_id)
              return (
                <div key={shift.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/90 border border-amber-200 p-2.5">
                  <div>
                    <span className="text-xs font-bold text-gray-900">{emp?.name ?? "Mitarbeiter"}</span>
                    <span className="text-xs text-gray-500 ml-2 font-medium">
                      ({shift.position}) · {shift.date} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} Uhr
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openRetroForm(shift.employee_id ?? undefined, shift.date, shift.start_time, shift.end_time)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" /> Nachträglich eintragen
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Standort-/WLAN-Status */}
      <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
        rejected ? "bg-red-50 border-red-200 text-red-700" :
        locationConfigured ? "bg-blue-50 border-blue-200 text-blue-700" :
        "bg-gray-50 border-gray-200 text-gray-500")}>
        {rejected ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
        <span>
          {rejected
            ? "Kein Browns-WLAN erkannt — Einstempeln nur im Café möglich."
            : locationConfigured
              ? "Standortprüfung aktiv — Einstempeln nur im Café-WLAN."
              : "Standortprüfung nicht aktiv — Einstempeln überall möglich."}
        </span>
      </div>

      {/* Hero-Stempeluhr */}
      {hero && (
        <div className="glass-card rounded-3xl p-8 flex flex-col items-center text-center relative overflow-hidden transition-all duration-300">
          <div className="absolute -right-12 -top-12 w-40 h-40 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-citrus/10 rounded-full blur-2xl pointer-events-none" />

          {activeEntry ? (
            <>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-4">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-600" />
                </span>
                Eingestempelt seit {activeEntry.clock_in.slice(0, 5)} Uhr
              </div>

              <div className="relative my-2">
                <p className="stat-number text-6xl font-extrabold text-charcoal tracking-tight tabular-nums">
                  {(() => {
                    const h = calcHours(activeEntry.clock_in, format(new Date(), "HH:mm"))
                    const hh = Math.floor(h); const mm = Math.round((h - hh) * 60)
                    return `${hh}:${String(mm).padStart(2, "0")}`
                  })()}
                </p>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-6">Aktuelle Schichtdauer</p>

              <div className="flex items-center gap-3 flex-wrap justify-center">
                <select value={breakMinutes} onChange={e => setBreakMinutes(Number(e.target.value))}
                  aria-label="Pause"
                  className="px-4 py-2.5 rounded-xl bg-white/80 border border-gray-300/80 text-sm font-medium text-charcoal focus:outline-none focus:ring-2 focus:ring-brand-500/30 shadow-sm">
                  <option value={0}>Keine Pause</option>
                  <option value={15}>15 Min Pause</option>
                  <option value={30}>30 Min Pause</option>
                  <option value={45}>45 Min Pause</option>
                  <option value={60}>1h Pause</option>
                </select>
                <button onClick={() => initiateClockOut(activeEntry)} disabled={loading}
                  className="spring-press inline-flex items-center gap-2 px-7 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm shadow-md transition-all disabled:opacity-50">
                  <Square className="w-4 h-4 fill-current" /> Ausstempeln
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative my-3">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse pointer-events-none" />
                <button onClick={clockIn} disabled={loading || !selectedEmployee}
                  aria-label="Einstempeln"
                  className="spring-press relative w-40 h-40 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-2xl
                    flex flex-col items-center justify-center gap-2 border-4 border-white/40
                    hover:shadow-emerald-500/30 disabled:opacity-50">
                  <Play className="w-10 h-10 ml-1" fill="currentColor" />
                  <span className="text-sm font-bold tracking-wide uppercase">Einstempeln</span>
                </button>
              </div>
              <p className="text-xs font-medium text-gray-500 mt-4">
                {totalToday > 0 ? `Heute bereits ${totalToday.toLocaleString("de-DE")} h erfasst` : "Tippe zum Schichtbeginn im Café"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Clock In/Out & Admin Manual Button */}
      {!hero && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Stempeln</h2>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openRetroForm()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-100 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Nachträglich eintragen (Admin)
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!lockedEmployeeId && (
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                aria-label="Mitarbeiter auswählen"
                className="flex-1 min-w-48 px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            )}

            {activeEntry ? (
              <>
                <select value={breakMinutes} onChange={e => setBreakMinutes(Number(e.target.value))}
                  aria-label="Pausenzeit auswählen"
                  className="px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  <option value={0}>Keine Pause</option>
                  <option value={15}>15 Min Pause</option>
                  <option value={30}>30 Min Pause</option>
                  <option value={45}>45 Min Pause</option>
                  <option value={60}>1h Pause</option>
                </select>
                <button onClick={() => initiateClockOut(activeEntry)} disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-medium text-sm transition disabled:opacity-50">
                  <Square className="w-4 h-4" /> Ausstempeln
                </button>
              </>
            ) : (
              <button onClick={clockIn} disabled={loading || !selectedEmployee}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-medium text-sm transition disabled:opacity-50">
                <Play className="w-4 h-4" /> Einstempeln
              </button>
            )}
          </div>

          {activeEntry && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Eingestempelt seit {activeEntry.clock_in.slice(0,5)} Uhr ·&nbsp;
              {calcHours(activeEntry.clock_in, format(new Date(), "HH:mm"))}h gearbeitet
            </div>
          )}

          {rejected && (
            <div className="mt-3 flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Einstempeln nur im Browns Café WLAN möglich. Bist du mit dem Café-Netz verbunden?
            </div>
          )}
          {actionError && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {actionError}
            </div>
          )}
        </div>
      )}

      {/* Heute */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Heute · {format(new Date(), "dd. MMMM", { locale: de })}</h2>
          {totalToday > 0 && <span className="text-sm text-gray-500 font-medium">{totalToday.toFixed(1)}h total</span>}
        </div>
        {todayEntries.length === 0 ? (
          <p className="text-gray-400 text-sm">Noch keine Einträge.</p>
        ) : (
          <div className="space-y-2">
            {todayEntries.map(entry => {
              const emp = employees.find(e => e.id === entry.employee_id)
              return (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: emp?.color ?? "#6366f1" }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{emp?.name}</p>
                    <p className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{entry.clock_in.slice(0,5)} – {entry.clock_out?.slice(0,5) ?? "läuft…"}</span>
                      {entry.break_minutes > 0 && <span>· {entry.break_minutes}min Pause</span>}
                      {entry.shift_revenue != null && (
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                          💶 {Number(entry.shift_revenue).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </span>
                      )}
                      {entry.auto_closed && <span className="text-amber-600"> · ⚠ automatisch beendet</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    {entry.total_hours ? <p className="text-sm font-semibold text-gray-800">{entry.total_hours}h</p> : null}
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                      entry.clock_out ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700")}>
                      {entry.clock_out ? "Fertig" : "Aktiv"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Verlauf */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Verlauf</h2>
        {entries.length === 0 ? (
          <p className="text-gray-400 text-sm">Keine Einträge vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Mitarbeiter</th>
                  <th className="text-left py-2 pr-4">Datum</th>
                  <th className="text-left py-2 pr-4">Von</th>
                  <th className="text-left py-2 pr-4">Bis</th>
                  <th className="text-left py-2 pr-4">Pause</th>
                  <th className="text-right py-2">Stunden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.slice(0, 50).map(entry => {
                  const emp = employees.find(e => e.id === entry.employee_id)
                  return (
                    <tr key={entry.id}>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: emp?.color ?? "#94a3b8" }} />
                          <span className="text-gray-800 font-medium">{emp?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{entry.date}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{entry.clock_in.slice(0,5)}</td>
                      <td className="py-2.5 pr-4 text-gray-700">
                        {entry.clock_out?.slice(0,5) ?? <span className="text-emerald-500 font-medium">aktiv</span>}
                        {entry.auto_closed && <span className="ml-1 text-amber-600" title="automatisch beendet">⚠</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{entry.break_minutes > 0 ? `${entry.break_minutes}min` : "—"}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-800">{entry.total_hours ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Nachträgliches Einstempeln (Admin) */}
      {showRetroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 mb-1">Nachträgliche Zeiterfassung (Admin)</h3>
            <p className="text-xs text-gray-500 mb-4">Erfasse nachträglich die Arbeitszeit für einen Mitarbeiter.</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Mitarbeiter</label>
                <select
                  value={retroForm.employeeId}
                  onChange={e => setRetroForm(f => ({ ...f, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.position})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Datum</label>
                <input
                  type="date"
                  value={retroForm.date}
                  onChange={e => setRetroForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Von (HH:MM)</label>
                  <input
                    type="time"
                    value={retroForm.clockIn}
                    onChange={e => setRetroForm(f => ({ ...f, clockIn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Bis (HH:MM)</label>
                  <input
                    type="time"
                    value={retroForm.clockOut}
                    onChange={e => setRetroForm(f => ({ ...f, clockOut: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Pause</label>
                <select
                  value={retroForm.breakMinutes}
                  onChange={e => setRetroForm(f => ({ ...f, breakMinutes: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                >
                  <option value={0}>Keine Pause</option>
                  <option value={15}>15 Min Pause</option>
                  <option value={30}>30 Min Pause</option>
                  <option value={45}>45 Min Pause</option>
                  <option value={60}>1 Std Pause</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Begründung / Notiz</label>
                <input
                  type="text"
                  value={retroForm.note}
                  onChange={e => setRetroForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z.B. Vergessen einzustempeln"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowRetroModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={submitRetroactiveEntry}
                disabled={retroSaving}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {retroSaving ? "Speichern…" : "Freigeben & Eintragen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clock-Out Modal with Mandatory Shift Revenue Input */}
      {showClockOutModal && clockOutTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                  <Euro className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base">Schicht beenden & Ausstempeln</h2>
                  <p className="text-xs text-gray-500">Kassenumsatz-Erfassung nach der Schicht</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowClockOutModal(false); setClockOutTarget(null) }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-semibold text-gray-700 text-xs block mb-1">Pausenzeit</label>
                <select
                  value={breakMinutes}
                  onChange={e => setBreakMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-800 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value={0}>Keine Pause</option>
                  <option value={15}>15 Min Pause</option>
                  <option value={30}>30 Min Pause</option>
                  <option value={45}>45 Min Pause</option>
                  <option value={60}>1 Std Pause</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-gray-900 text-xs flex items-center gap-1">
                    💶 Erbrachter Schichtumsatz in € <span className="text-red-500">* (Pflichtfeld)</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="z. B. 450.00"
                    value={shiftRevenueInput}
                    onChange={e => { setShiftRevenueInput(e.target.value); setRevenueValidationError("") }}
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-brand-200 text-base font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 shadow-sm"
                  />
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">€</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Bitte trage deinen mit der Kasse in dieser Schicht erzielten Umsatz ein.
                </p>
              </div>

              {revenueValidationError && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  {revenueValidationError}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowClockOutModal(false); setClockOutTarget(null) }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={executeClockOut}
                disabled={loading || !shiftRevenueInput.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition disabled:opacity-40"
              >
                {loading ? "Wird gespeichert…" : "✅ Schicht beenden & Ausstempeln"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
