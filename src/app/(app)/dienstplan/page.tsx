import { createClient } from "@/lib/supabase-server"
import ShiftCalendar from "@/components/dienstplan/ShiftCalendar"
import type { Shift, Employee } from "@/types"
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import PageHeader from "@/components/layout/PageHeader"

type AbsenceRow = { employee_id: string; type: string; start_date: string; end_date: string; status: string }

type DienstplanPageProps = {
  searchParams: Promise<{ date?: string | string[] }>
}

function validDateParam(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined
  const parsed = new Date(`${candidate}T12:00:00`)
  return Number.isNaN(parsed.getTime()) || format(parsed, "yyyy-MM-dd") !== candidate ? undefined : candidate
}

export default async function DienstplanPage({ searchParams }: DienstplanPageProps) {
  const params = await searchParams
  const initialDate = validDateParam(params.date)
  const supabase = await createClient()
  const rangeAnchor = initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()
  const rangeStart = format(startOfMonth(subMonths(rangeAnchor, 12)), "yyyy-MM-dd")
  const rangeEnd = format(endOfMonth(addMonths(rangeAnchor, 18)), "yyyy-MM-dd")

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
      <PageHeader title={"Dienstplan"} subtitle={"Wochenansicht · Schichten planen und verwalten"} />
      <ShiftCalendar
        key={initialDate ?? "today"}
        shifts={normalizedShifts}
        employees={employeesMerged as Employee[]}
        minStaffing={minStaffing}
        absences={(absences ?? []) as AbsenceRow[]}
        openingHours={openingHours}
        initialDate={initialDate}
      />
    </div>
  )
}
