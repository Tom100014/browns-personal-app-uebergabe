import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours, formatHours } from "@/lib/hours"
import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, format } from "date-fns"
import { de } from "date-fns/locale"
import MyHoursList from "@/components/portal/MyHoursList"

type Row = {
  id: string
  date: string
  clock_in: string
  clock_out?: string | null
  break_minutes?: number | null
  total_hours?: number | null
  shift_revenue?: number | null
  auto_closed?: boolean | null
}

export default async function PortalStunden() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const me = staff.employee
  const supabase = await createClient()

  // Zwölf Wochen Verlauf laden (deckt die 8-Wochen-Balken + die Detailliste ab).
  const from = format(startOfWeek(subWeeks(new Date(), 11), { weekStartsOn: 1 }), "yyyy-MM-dd")
  const { data: entries } = await supabase
    .from("time_entries")
    .select("id,date,clock_in,clock_out,break_minutes,total_hours,shift_revenue,auto_closed")
    .eq("employee_id", me.id)
    .gte("date", from)
    .order("date", { ascending: false })

  const rows = (entries ?? []) as Row[]

  // 8-Wochen-Balken (Mo–So), neueste zuerst
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
    const we = endOfWeek(ws, { weekStartsOn: 1 })
    const wsStr = format(ws, "yyyy-MM-dd")
    const weStr = format(we, "yyyy-MM-dd")
    const hours = rows.filter(r => r.clock_out && r.date >= wsStr && r.date <= weStr).reduce((s, r) => s + entryHours(r), 0)
    return { ws, we, hours }
  })
  const max = Math.max(...weeks.map(w => w.hours), 1)
  const total8 = weeks.reduce((s, w) => s + w.hours, 0)
  const avgWeek = total8 / 8

  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd")
  const monthHours = rows.filter(r => r.clock_out && r.date >= monthStart && r.date <= monthEnd).reduce((s, r) => s + entryHours(r), 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Meine Stunden</h1>
        <p className="mt-0.5 text-sm text-gray-500">Alle erfassten Arbeitsstunden — strukturiert, durchsuchbar und nach Datum sortiert.</p>
      </div>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400">Dieser Monat</p>
          <p className="stat-number mt-1 text-2xl text-gray-900">{formatHours(monthHours)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400">8 Wochen gesamt</p>
          <p className="stat-number mt-1 text-2xl text-gray-900">{formatHours(total8)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400">Ø pro Woche</p>
          <p className="stat-number mt-1 text-2xl text-gray-900">{formatHours(avgWeek)}</p>
        </div>
      </div>

      {/* Wochenverlauf */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-bold text-gray-900">Wochenverlauf</p>
        <div className="divide-y divide-gray-50">
          {weeks.map((w, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <span className="w-24 shrink-0 text-xs text-gray-500 tabular-nums">
                {format(w.ws, "dd.MM.", { locale: de })}–{format(w.we, "dd.MM.", { locale: de })}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-md bg-gray-100">
                <div className="h-full rounded-md bg-brand-500 transition-all" style={{ width: `${Math.round((w.hours / max) * 100)}%`, minWidth: w.hours > 0 ? 4 : 0 }} />
              </div>
              <span className="w-14 shrink-0 text-right text-sm font-medium text-gray-800 tabular-nums">{w.hours > 0 ? formatHours(w.hours) : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Durchsuchbare Einzelnachweise */}
      <div>
        <p className="mb-3 text-sm font-bold text-gray-900">Einzelnachweise</p>
        <MyHoursList entries={rows} />
      </div>
    </div>
  )
}
