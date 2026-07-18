import { createClient } from "@/lib/supabase-server"
import ShiftCalendar from "@/components/dienstplan/ShiftCalendar"
import type { Shift, Employee } from "@/types"
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"

type AbsenceRow = { employee_id: string; type: string; start_date: string; end_date: string; status: string }

export default async function DienstplanPage() {
  const supabase = await createClient()
  const now = new Date()
  const rangeStart = format(startOfMonth(subMonths(now, 12)), "yyyy-MM-dd")
  const rangeEnd = format(endOfMonth(addMonths(now, 18)), "yyyy-MM-dd")

  const [{ data: shifts }, { data: employees }, { data: priv }, { data: settingsRows }, { data: absences }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id,employee_id,date,start_time,end_time,position,note,status,created_at,employee:employees(*)")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date"),
    supabase.from("employees").select("*").order("name"),
    supabase.from("employee_private").select("employee_id,weekly_hours,hourly_wage"),
    supabase.from("settings").select("key,value").in("key", ["min_staffing", "opening_hours"]),
    supabase
      .from("absences")
      .select("employee_id,type,start_date,end_date,status")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart)
      .neq("status", "rejected"),
  ])
  const normalizedShifts = (shifts ?? []).map(shift => ({
    ...shift,
    employee: Array.isArray(shift.employee) ? shift.employee[0] : shift.employee,
  })) as Shift[]
  const privById = new Map((priv ?? []).map((p: { employee_id: string; weekly_hours: number | null; hourly_wage: number | null }) => [p.employee_id, p]))
  const employeesMerged = (employees ?? []).map(e => ({ ...e, weekly_hours: privById.get(e.id)?.weekly_hours ?? null, hourly_wage: privById.get(e.id)?.hourly_wage ?? null }))

  let minStaffing: Record<string, number> = {}
  let openingHours: Record<string, { open: string; close: string; closed: boolean }> = {}
  try { const v = settingsRows?.find(s => s.key === "min_staffing")?.value; if (v) minStaffing = JSON.parse(v) } catch {}
  try { const v = settingsRows?.find(s => s.key === "opening_hours")?.value; if (v) openingHours = JSON.parse(v) } catch {}

  return (
    <div className="p-4 sm:p-6 h-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Dienstplan</h1>
        <p className="text-gray-500 text-sm mt-0.5">Wochenansicht · Schichten planen und verwalten</p>
      </div>
      <ShiftCalendar
        shifts={normalizedShifts}
        employees={employeesMerged as Employee[]}
        minStaffing={minStaffing}
        absences={(absences ?? []) as AbsenceRow[]}
        openingHours={openingHours}
      />
    </div>
  )
}
