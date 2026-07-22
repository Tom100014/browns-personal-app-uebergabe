"use client"

import { useState, useEffect } from "react"
import { LifeBuoy, Check, Sparkles, Clock, CalendarDays, X, UserCheck, AlertTriangle } from "lucide-react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import { formatDayLabel } from "@/lib/coverage"
import type { Employee, CoverageRequest } from "@/types"

interface Props {
  requests: CoverageRequest[]
  employees: Employee[]
}

const hhmm = (t?: string | null) => (t ?? "").slice(0, 5)

export default function CoverageBoard({ requests: initial, employees }: Props) {
  const [requests, setRequests] = useState<CoverageRequest[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  // Live-Sync: neue Vertretungs-Anfragen und Zusagen erscheinen sofort.
  useRealtimeRefresh(["coverage_requests", "coverage_offers"])
  useEffect(() => { setRequests(initial) }, [initial])

  const empById = (id?: string | null) => employees.find(e => e.id === id)
  // Vergangene, nie besetzte Anfragen bleiben in der Datenbank offen, sollen sich
  // hier aber nicht mehr als "zu erledigen" darstellen — die Schicht ist vorbei.
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const open = requests.filter(r => r.status === "open" && r.date >= todayStr)
  const filled = requests.filter(r => r.status === "filled")

  async function assign(req: CoverageRequest, employeeId: string) {
    setBusy(req.id)
    setActionError("")
    const supabase = createClient()
    const emp = empById(employeeId)
    const orig = empById(req.original_employee_id)

    try {
      const { error: shiftError } = await supabase.from("shifts").insert({
        employee_id: employeeId,
        date: req.date,
        start_time: req.start_time,
        end_time: req.end_time,
        position: req.position,
        status: "confirmed",
        note: `Vertretung für ${orig?.name ?? "Kollegen"}`,
      })
      if (shiftError) {
        setActionError("Die Schicht konnte nicht angelegt werden. Bitte erneut versuchen.")
        return
      }

      const { error: requestError } = await supabase.from("coverage_requests")
        .update({ status: "filled", filled_by: employeeId })
        .eq("id", req.id)
      if (requestError) {
        setActionError("Die Schicht wurde angelegt, die Anfrage konnte aber nicht als besetzt markiert werden.")
        return
      }

      await supabase.from("messages").insert({
        employee_id: null,
        type: "coverage_filled",
        content: `✅ ${emp?.name ?? "Ein Kollege"} übernimmt die Schicht ${req.position} am ` +
          `${formatDayLabel(req.date)} ${hhmm(req.start_time)}–${hhmm(req.end_time)} Uhr. Bestätigt durch die Leitung.`,
        meta: { request_id: req.id },
        created_at: new Date().toISOString(),
      })

      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "filled", filled_by: employeeId } : r))
    } catch {
      setActionError("Zuweisung fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(req: CoverageRequest) {
    setBusy(req.id)
    setActionError("")
    const supabase = createClient()
    try {
      const { error } = await supabase.from("coverage_requests").update({ status: "cancelled" }).eq("id", req.id)
      if (error) {
        setActionError("Verwerfen fehlgeschlagen. Bitte erneut versuchen.")
        return
      }
      setRequests(prev => prev.filter(r => r.id !== req.id))
    } catch {
      setActionError("Verwerfen fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {actionError}
        </div>
      )}
      {/* Offene Lücken */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 text-sm">Offene Lücken</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{open.length}</span>
        </div>

        {open.length === 0 ? (
          <div className="glass-card rounded-2xl py-10 text-center">
            <UserCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">Alle Schichten sind besetzt. Keine offenen Vertretungen.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map(req => {
              const orig = empById(req.original_employee_id)
              const suggested = empById(req.suggested_employee_id)
              const offers = req.offers ?? []
              return (
                <div key={req.id} className="glass-card rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <LifeBuoy className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-charcoal">{req.position}</p>
                        <p className="text-xs text-gray-500">
                          {orig ? `${orig.name} fällt aus` : "Schicht unbesetzt"}
                          {req.reason === "krank" ? " (krank)" : ""}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => dismiss(req)} disabled={busy === req.id}
                      className="text-gray-400 hover:text-gray-600 transition p-1" title="Verwerfen">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs font-semibold text-gray-600">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gray-400" />{formatDayLabel(req.date)}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-400" />{hhmm(req.start_time)}–{hhmm(req.end_time)} Uhr</span>
                  </div>

                  {/* Vorschlag */}
                  {suggested && (
                    <div className="mt-3.5 flex items-center justify-between gap-2 rounded-xl bg-brand-500/10 border border-brand-500/20 px-3.5 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-800">
                        <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                        Vorschlag: <span className="font-bold">{suggested.name}</span>
                      </span>
                      <button onClick={() => assign(req, suggested.id)} disabled={busy === req.id}
                        className="spring-press text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition disabled:opacity-50">
                        Zuweisen
                      </button>
                    </div>
                  )}

                  {/* Zusagen aus dem Chat */}
                  <div className="mt-3.5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Zusagen aus dem Team ({offers.length})
                    </p>
                    {offers.length === 0 ? (
                      <p className="text-xs text-gray-400">Noch keine Rückmeldung. Anfrage läuft im Team-Chat.</p>
                    ) : (
                      <div className="space-y-2">
                        {offers.map(o => {
                          const e = empById(o.employee_id)
                          return (
                            <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/70 border border-gray-200/80 px-3 py-2">
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-charcoal">
                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shadow-sm"
                                  style={{ backgroundColor: e?.color ?? "#c74806" }}>
                                  {e?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                                </span>
                                {e?.name ?? "—"}
                                {e?.position === req.position && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">passt</span>
                                )}
                              </span>
                              <button onClick={() => assign(req, o.employee_id)} disabled={busy === req.id}
                                className="spring-press text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-50">
                                Zuweisen
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Erledigt */}
      {filled.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Erledigt</h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
            {filled.map(req => {
              const by = empById(req.filled_by)
              const orig = empById(req.original_employee_id)
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">
                      <span className="font-medium">{by?.name ?? "—"}</span> übernimmt für {orig?.name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400">{req.position} · {formatDayLabel(req.date)} · {hhmm(req.start_time)}–{hhmm(req.end_time)} Uhr</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium flex-shrink-0">Besetzt</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
