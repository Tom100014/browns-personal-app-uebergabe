import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours, formatHours } from "@/lib/hours"
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns"
import { de } from "date-fns/locale"

export default async function PortalStunden() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const me = staff.employee
  const supabase = await createClient()

  const from = format(startOfWeek(subWeeks(new Date(), 7), { weekStartsOn: 1 }), "yyyy-MM-dd")
  const { data: entries } = await supabase
    .from("time_entries").select("date,clock_in,clock_out,break_minutes")
    .eq("employee_id", me.id).gte("date", from)

  const rows = (entries ?? []) as { date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null }[]

  // Last 8 weeks (Mon–Sun), newest first
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
    const we = endOfWeek(ws, { weekStartsOn: 1 })
    const wsStr = format(ws, "yyyy-MM-dd")
    const weStr = format(we, "yyyy-MM-dd")
    const hours = rows.filter(r => r.clock_out && r.date >= wsStr && r.date <= weStr).reduce((s, r) => s + entryHours(r), 0)
    return { ws, we, hours }
  })
  const max = Math.max(...weeks.map(w => w.hours), 1)
  const total = weeks.reduce((s, w) => s + w.hours, 0)

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Meine Stunden</h1>
        <p className="text-gray-500 text-sm mt-0.5">Deine erfassten Arbeitsstunden der letzten 8 Wochen</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-sm text-gray-500">Gesamt (8 Wochen)</p>
        <p className="stat-number text-3xl text-gray-900 mt-1">{formatHours(total)}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
        {weeks.map((w, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 text-xs text-gray-500 flex-shrink-0">
              {format(w.ws, "dd.MM.", { locale: de })}–{format(w.we, "dd.MM.", { locale: de })}
            </span>
            <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
              <div className="h-full bg-brand-500 rounded-md transition-all" style={{ width: `${Math.round((w.hours / max) * 100)}%`, minWidth: w.hours > 0 ? 4 : 0 }} />
            </div>
            <span className="w-16 text-right text-sm font-medium text-gray-800 flex-shrink-0">{w.hours > 0 ? formatHours(w.hours) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
