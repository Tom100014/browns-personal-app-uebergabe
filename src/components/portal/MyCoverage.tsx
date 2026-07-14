"use client"

import { useState, useEffect } from "react"
import { LifeBuoy, Clock, CalendarDays, Hand, Check, UserCheck } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import { formatDayLabel } from "@/lib/coverage"
import { cn } from "@/lib/utils"
import type { CoverageRequest, Employee } from "@/types"

const hhmm = (t?: string | null) => (t ?? "").slice(0, 5)

interface Props {
  requests: CoverageRequest[]
  employees: Employee[]
  selfId: string
}

export default function MyCoverage({ requests, employees, selfId }: Props) {
  const [offered, setOffered] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const r of requests) if ((r.offers ?? []).some(o => o.employee_id === selfId)) m[r.id] = true
    return m
  })
  const [busy, setBusy] = useState<string | null>(null)

  // Live-Sync: neue Ersatz-Gesuche erscheinen sofort.
  useRealtimeRefresh(["coverage_requests", "coverage_offers"])
  useEffect(() => {
    const m: Record<string, boolean> = {}
    for (const r of requests) if ((r.offers ?? []).some(o => o.employee_id === selfId)) m[r.id] = true
    setOffered(m)
  }, [requests, selfId])

  const empById = (id?: string | null) => employees.find(e => e.id === id)
  const me = empById(selfId)

  async function offer(req: CoverageRequest) {
    setBusy(req.id)
    const supabase = createClient()
    const { data } = await supabase.from("coverage_offers")
      .insert({ request_id: req.id, employee_id: selfId, created_at: new Date().toISOString() })
      .select().single()
    if (data) {
      setOffered(prev => ({ ...prev, [req.id]: true }))
      await supabase.from("messages").insert({
        employee_id: selfId,
        content: `✋ ${me?.name ?? "Jemand"} kann die Schicht übernehmen.`,
        type: "coverage_offer",
        meta: { request_id: req.id },
        created_at: new Date().toISOString(),
      })
    }
    setBusy(null)
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-12 text-center">
        <UserCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Aktuell werden keine Vertretungen gesucht.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {requests.map(req => {
        const orig = empById(req.original_employee_id)
        const suggested = empById(req.suggested_employee_id)
        const iOffered = offered[req.id]
        const suggestedIsMe = req.suggested_employee_id === selfId
        return (
          <div key={req.id} className="bg-white border border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                <LifeBuoy className="w-4.5 h-4.5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{req.position}</p>
                <p className="text-xs text-gray-500">{orig ? `${orig.name} fällt aus` : "Schicht frei"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-3">
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-gray-400" />{formatDayLabel(req.date)}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{hhmm(req.start_time)}–{hhmm(req.end_time)} Uhr</span>
            </div>
            {suggestedIsMe && !iOffered && (
              <p className="text-xs text-brand-700 bg-brand-50 rounded-lg px-2.5 py-1.5 mb-2">💡 Du wärst eine gute Besetzung für diese Schicht.</p>
            )}
            <button onClick={() => offer(req)} disabled={iOffered || busy === req.id}
              className={cn("w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition",
                iOffered ? "bg-emerald-100 text-emerald-700 cursor-default" : "bg-orange-600 hover:bg-orange-700 text-white")}>
              {iOffered ? <><Check className="w-4 h-4" /> Du hast zugesagt</> : <><Hand className="w-4 h-4" /> Ich kann übernehmen</>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
