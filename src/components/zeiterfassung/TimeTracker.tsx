"use client"

import { useState, useEffect } from "react"
import { Play, Square, Wifi, WifiOff, AlertTriangle } from "lucide-react"
import { useRealtimeRefresh } from "@/lib/realtime"
import type { TimeEntry, Employee } from "@/types"
import { cn, calcHours } from "@/lib/utils"
import { format } from "date-fns"
import { de } from "date-fns/locale"

interface Props { entries: TimeEntry[]; employees: Employee[]; locationConfigured: boolean; lockedEmployeeId?: string; hero?: boolean }

export default function TimeTracker({ entries: initialEntries, employees, locationConfigured, lockedEmployeeId, hero = false }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries)
  const [selectedEmployee, setSelectedEmployee] = useState(lockedEmployeeId ?? employees[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [actionError, setActionError] = useState("")
  const [breakMinutes, setBreakMinutes] = useState(0)
  // Live-Timer für die Hero-Ansicht: aktualisiert die gearbeitete Zeit jede halbe Minute.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hero) return
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [hero])

  const todayStr = format(new Date(), "yyyy-MM-dd")

  // Live-Sync: Ein-/Ausstempeln anderer Mitarbeiter sofort sichtbar.
  useRealtimeRefresh(["time_entries"])
  useEffect(() => { setEntries(initialEntries) }, [initialEntries])

  const activeEntry = entries.find(e => e.employee_id === selectedEmployee && !e.clock_out)

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

  async function clockOut(entry: TimeEntry) {
    setLoading(true); setActionError("")
    try {
      const res = await fetch("/api/timeentries/clockin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, breakMinutes }),
      })
      const data = await res.json()
      if (data.entry) setEntries(prev => prev.map(e => e.id === entry.id ? data.entry as TimeEntry : e))
      else setActionError(data.error || "Ausstempeln fehlgeschlagen.")
    } catch {
      setActionError("Keine Verbindung zum Server.")
    }
    setLoading(false)
  }

  const todayEntries = entries.filter(e => e.date === todayStr)
  const totalToday = todayEntries.reduce((s, e) => s + (e.total_hours ?? 0), 0)

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Standort-/WLAN-Status — ehrlich: grün nur bei echter, aktiver Prüfung */}
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

      {/* Hero-Stempeluhr (Mitarbeiter-App): eine große, eindeutige Aktion */}
      {hero && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-card flex flex-col items-center text-center">
          {activeEntry ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-3 flex items-center gap-1.5">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
                </span>
                Eingestempelt seit {activeEntry.clock_in.slice(0, 5)} Uhr
              </p>
              <p className="stat-number text-5xl text-gray-900 mb-1 tabular-nums">
                {(() => {
                  const h = calcHours(activeEntry.clock_in, format(new Date(), "HH:mm"))
                  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60)
                  return `${hh}:${String(mm).padStart(2, "0")}`
                })()}
              </p>
              <p className="text-xs text-gray-400 mb-5">Stunden gearbeitet</p>
              <div className="flex items-center gap-2.5">
                <select value={breakMinutes} onChange={e => setBreakMinutes(Number(e.target.value))}
                  aria-label="Pause"
                  className="px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                  <option value={0}>Keine Pause</option>
                  <option value={15}>15 Min Pause</option>
                  <option value={30}>30 Min Pause</option>
                  <option value={45}>45 Min Pause</option>
                  <option value={60}>1h Pause</option>
                </select>
                <button onClick={() => clockOut(activeEntry)} disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition disabled:opacity-50">
                  <Square className="w-4 h-4" /> Ausstempeln
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={clockIn} disabled={loading || !selectedEmployee}
                aria-label="Einstempeln"
                className="w-36 h-36 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-card-lg
                  flex flex-col items-center justify-center gap-1.5 transition-all
                  hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100">
                <Play className="w-9 h-9" fill="currentColor" />
                <span className="text-sm font-bold tracking-wide">Einstempeln</span>
              </button>
              <p className="text-xs text-gray-400 mt-4">
                {totalToday > 0 ? `Heute bereits ${totalToday.toLocaleString("de-DE")} h erfasst` : "Tippe zum Schichtbeginn"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Clock In/Out */}
      {!hero && (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Stempeln</h2>
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
              <button onClick={() => clockOut(activeEntry)} disabled={loading}
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

      {/* Ablehnung auch in der Hero-Ansicht anzeigen */}
      {hero && rejected && (
        <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Einstempeln nur im Browns Café WLAN möglich. Bist du mit dem Café-Netz verbunden?
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
                    <p className="text-xs text-gray-400">
                      {entry.clock_in.slice(0,5)} – {entry.clock_out?.slice(0,5) ?? "läuft…"}
                      {entry.break_minutes > 0 && ` · ${entry.break_minutes}min Pause`}
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

      {/* Alle Einträge Tabelle */}
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
                      <td className="py-2.5 pr-4 text-gray-700">{entry.clock_out?.slice(0,5) ?? <span className="text-emerald-500 font-medium">aktiv</span>}{entry.auto_closed && <span className="ml-1 text-amber-600" title="automatisch beendet (vergessenes Ausstempeln)">⚠</span>}</td>
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
    </div>
  )
}
