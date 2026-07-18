"use client"

import { useState, useEffect } from "react"
import { LifeBuoy, Check, Sparkles, Clock, CalendarDays, X, UserCheck } from "lucide-react"
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

  // Live-Sync: neue Vertretungs-Anfragen und Zusagen erscheinen sofort.
  useRealtimeRefresh(["coverage_requests", "coverage_offers"])
  useEffect(() => { setRequests(initial) }, [initial])

  const empById = (id?: string | null) => employees.find(e => e.id === id)
  const open = requests.filter(r => r.status === "open")
  const filled = requests.filter(r => r.status === "filled")

  async function assign(req: CoverageRequest, employeeId: string) {
    setBusy(req.id)
    const supabase = createClient()
    const emp = empById(employeeId)
    const orig = empById(req.original_employee_id)

    await supabase.from("shifts").insert({
      employee_id: employeeId,
      date: req.date,
      start_time: req.start_time,
      end_time: req.end_time,
      position: req.position,
      status: "confirmed",
      note: `Vertretung für ${orig?.name ?? "Kollegen"}`,
    })

    await supabase.from("coverage_requests")
      .update({ status: "filled", filled_by: employeeId })
      .eq("id", req.id)

    await supabase.from("messages").insert({
      employee_id: null,
      type: "coverage_filled",
      content: `✅ ${emp?.name ?? "Ein Kollege"} übernimmt die Schicht ${req.position} am ` +
        `${formatDayLabel(req.date)} ${hhmm(req.start_time)}–${hhmm(req.end_time)} Uhr. Bestätigt durch die Leitung.`,
      meta: { request_id: req.id },
      created_at: new Date().toISOString(),
    })

    setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "filled", filled_by: employeeId } : r))
    setBusy(null)
  }

  async function dismiss(req: CoverageRequest) {
    setBusy(req.id)
    const supabase = createClient()
    await supabase.from("coverage_requests").update({ status: "cancelled" }).eq("id", req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    setBusy(null)
  }

  return (
    <div className="space-y-6">
      {/* Offene Lücken */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 text-sm">Offene Lücken</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{open.length}</span>
        </div>

        {open.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl py-10 text-center">
            <UserCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Alle Schichten sind besetzt. Keine offenen Vertretungen.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map(req => {
              const orig = empById(req.original_employee_id)
              const suggested = empById(req.suggested_employee_id)
              const offers = req.offers ?? []
              return (
                <div key={req.id} className="bg-white border border-orange-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <LifeBuoy className="w-4.5 h-4.5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{req.position}</p>
                        <p className="text-xs text-gray-500">
                          {orig ? `${orig.name} fällt aus` : "Schicht unbesetzt"}
                          {req.reason === "krank" ? " (krank)" : ""}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => dismiss(req)} disabled={busy === req.id}
                      className="text-gray-300 hover:text-gray-500 transition" title="Verwerfen">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-600">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-gray-400" />{formatDayLabel(req.date)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{hhmm(req.start_time)}–{hhmm(req.end_time)} Uhr</span>
                  </div>

                  {/* Vorschlag */}
                  {suggested && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-brand-800">
                        <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                        Vorschlag: <span className="font-semibold">{suggested.name}</span>
                      </span>
                      <button onClick={() => assign(req, suggested.id)} disabled={busy === req.id}
                        className="text-xs font-medium px-2.5 py-1 rounded-md bg-brand-600 hover:bg-brand-700 text-white transition disabled:opacity-50">
                        Zuweisen
                      </button>
                    </div>
                  )}

                  {/* Zusagen aus dem Chat */}
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">
                      Zusagen aus dem Team ({offers.length})
                    </p>
                    {offers.length === 0 ? (
                      <p className="text-xs text-gray-400">Noch keine Rückmeldung. Anfrage läuft im Team-Chat.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {offers.map(o => {
                          const e = empById(o.employee_id)
                          return (
                            <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                              <span className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: e?.color ?? "#6366f1" }}>
                                  {e?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                                </span>
                                {e?.name ?? "—"}
                                {e?.position === req.position && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">passt</span>
                                )}
                              </span>
                              <button onClick={() => assign(req, o.employee_id)} disabled={busy === req.id}
                                className="text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50">
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
