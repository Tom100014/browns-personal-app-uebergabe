import { Clock, TrendingUp } from "lucide-react"
import { formatHours } from "@/lib/hours"

type OvertimeEntry = {
  employeeId: string
  name?: string
  color?: string
  position: string
  scheduledEnd: string
  actualEnd: string
  overtimeHours: number
  date: string
}

const initials = (name?: string) => (name ?? "?").split(" ").map(n => n[0]).join("").slice(0, 2)
const formatTime = (time: string) => time.slice(0, 5)

export default function OvertimeReport({ entries }: { entries: OvertimeEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <TrendingUp className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Heute: Keine Überstunden registriert.</p>
      </div>
    )
  }

  const totalOvertime = entries.reduce((sum, e) => sum + e.overtimeHours, 0)
  const maxOvertime = Math.max(...entries.map(e => e.overtimeHours), 1)

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm">
      <div className="border-b border-amber-100 bg-amber-100/50 px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-950">{entries.length} Mitarbeiter mit Überstunden heute</h2>
          </div>
          <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-bold text-white">{formatHours(totalOvertime)} total</span>
        </div>
      </div>

      <div className="divide-y divide-amber-100">
        {entries.map(entry => (
          <div key={`${entry.employeeId}-${entry.date}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-amber-100/30">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: entry.color ?? "#f59e0b" }}>
              {initials(entry.name)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-amber-950">{entry.name ?? "Unbekannt"}</p>
              <p className="mt-0.5 text-xs text-amber-700">{entry.position}</p>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <div className="text-right">
                <p className="text-xs text-amber-600 font-semibold">Geplant bis</p>
                <p className="text-sm font-bold text-amber-950 tabular-nums">{formatTime(entry.scheduledEnd)}</p>
              </div>
              <span className="text-xs font-bold text-amber-500">→</span>
              <div className="text-right">
                <p className="text-xs text-amber-600 font-semibold">Tatsächlich bis</p>
                <p className="text-sm font-bold text-amber-950 tabular-nums">{formatTime(entry.actualEnd)}</p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="w-24 h-4 rounded-full bg-amber-200 overflow-hidden">
                <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${Math.round((entry.overtimeHours / maxOvertime) * 100)}%` }} />
              </div>
              <p className="text-sm font-bold text-amber-900 tabular-nums">{formatHours(entry.overtimeHours)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
