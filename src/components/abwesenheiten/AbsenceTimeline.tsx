"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Employee } from "@/types"
import {
  startOfMonth, endOfMonth, getDaysInMonth, addMonths, subMonths,
  format, isWeekend, differenceInCalendarDays, isToday, parseISO,
} from "date-fns"
import { de } from "date-fns/locale"

type Absence = {
  id: string; employee_id: string; type: string; start_date: string; end_date: string
  note?: string; status: "pending" | "approved" | "rejected"; created_at: string
}

const DAY_W = 30 // px per day column

const BAR: Record<string, string> = {
  urlaub: "bg-brand-500",
  krank: "bg-red-500",
  frei: "bg-gray-400",
  sonderurlaub: "bg-violet-500",
}
const LABEL: Record<string, string> = { urlaub: "Urlaub", krank: "Krank", frei: "Frei", sonderurlaub: "Sonderurlaub" }

interface Props { absences: Absence[]; employees: Employee[] }

export default function AbsenceTimeline({ absences, employees }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = getDaysInMonth(month)
  const dayList = Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))
  const trackWidth = days * DAY_W

  function barsFor(empId: string) {
    return absences
      .filter(a => a.employee_id === empId && a.status !== "rejected")
      .map(a => {
        const s = parseISO(a.start_date)
        const e = parseISO(a.end_date)
        const cs = s < monthStart ? monthStart : s
        const ce = e > monthEnd ? monthEnd : e
        if (ce < cs) return null
        const startIdx = differenceInCalendarDays(cs, monthStart)
        const span = differenceInCalendarDays(ce, cs) + 1
        return { ...a, startIdx, span }
      })
      .filter(Boolean) as (Absence & { startIdx: number; span: number })[]
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={() => setMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setMonth(startOfMonth(new Date()))} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition">
          Heute
        </button>
        <button onClick={() => setMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 ml-2 capitalize">{format(month, "MMMM yyyy", { locale: de })}</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          {Object.entries(LABEL).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("w-2.5 h-2.5 rounded-sm", BAR[k])} /> {v}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: 176 + trackWidth }}>
          {/* Day header */}
          <div className="flex border-b border-gray-100 bg-gray-50/50">
            <div className="w-44 flex-shrink-0 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Mitarbeiter</div>
            <div className="flex" style={{ width: trackWidth }}>
              {dayList.map((d, i) => (
                <div key={i} style={{ width: DAY_W }}
                  className={cn("flex-shrink-0 text-center py-2 border-l border-gray-100",
                    isWeekend(d) && "bg-gray-100/60", isToday(d) && "bg-brand-50")}>
                  <div className={cn("text-[10px] uppercase", isToday(d) ? "text-brand-600 font-semibold" : "text-gray-400")}>
                    {format(d, "EEEEE", { locale: de })}
                  </div>
                  <div className={cn("text-xs font-medium", isToday(d) ? "text-brand-700" : "text-gray-600")}>{i + 1}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Employee rows */}
          {employees.map(emp => {
            const bars = barsFor(emp.id)
            return (
              <div key={emp.id} className="flex border-b border-gray-50 last:border-0 hover:bg-gray-50/30">
                <div className="w-44 flex-shrink-0 px-4 py-2.5 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: emp.color }}>
                    {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.position}</p>
                  </div>
                </div>
                <div className="relative flex-shrink-0" style={{ width: trackWidth, minHeight: 52 }}>
                  {/* day grid */}
                  <div className="absolute inset-0 flex">
                    {dayList.map((d, i) => (
                      <div key={i} style={{ width: DAY_W }}
                        className={cn("border-l border-gray-50", isWeekend(d) && "bg-gray-100/40", isToday(d) && "bg-brand-50/50")} />
                    ))}
                  </div>
                  {/* bars */}
                  {bars.map(b => (
                    <div key={b.id}
                      title={`${LABEL[b.type] ?? b.type}: ${b.start_date} – ${b.end_date}${b.note ? " · " + b.note : ""}`}
                      className={cn("absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-white text-[11px] font-medium shadow-sm overflow-hidden",
                        BAR[b.type] ?? "bg-gray-400", b.status === "pending" && "opacity-60 border border-white/60")}
                      style={{ left: b.startIdx * DAY_W + 2, width: b.span * DAY_W - 4 }}>
                      <span className="truncate">{LABEL[b.type] ?? b.type}{b.status === "pending" ? " ?" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {employees.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Keine Mitarbeiter.</div>
          )}
        </div>
      </div>
    </div>
  )
}
