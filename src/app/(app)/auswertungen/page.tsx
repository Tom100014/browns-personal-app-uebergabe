import { createClient } from "@/lib/supabase-server"
import PayrollReport from "@/components/auswertungen/PayrollReport"
import type { Employee } from "@/types"
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns"

export default async function AuswertungenPage() {
  const supabase = await createClient()
  const now = new Date()
  const historyStart = format(startOfMonth(subMonths(now, 11)), "yyyy-MM-dd")
  const historyEnd = format(endOfMonth(now), "yyyy-MM-dd")

  const [{ data: employeeRows }, { data: pay }, { data: entries }, { data: shifts }, { data: absences }] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    supabase.from("employee_private").select("employee_id,hourly_wage"),
    supabase.from("time_entries").select("employee_id,date,clock_in,clock_out,break_minutes").gte("date", historyStart).lte("date", historyEnd).not("clock_out", "is", null),
    supabase.from("shifts").select("employee_id,date,start_time,end_time").gte("date", historyStart).lte("date", historyEnd),
    supabase.from("absences").select("employee_id,type,start_date,end_date,status").lte("start_date", historyEnd).gte("end_date", historyStart).neq("status", "rejected"),
  ])
  const wageById = new Map((pay ?? []).map((p: { employee_id: string; hourly_wage: number | null }) => [p.employee_id, p.hourly_wage]))
  const employees = (employeeRows ?? []).map(e => ({ ...e, hourly_wage: wageById.get(e.id) ?? null }))

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Auswertungen</h1>
        <p className="text-gray-500 text-sm mt-0.5">Arbeitsstunden &amp; Lohnkosten pro Monat — Grundlage für die Lohnabrechnung</p>
      </div>
      <PayrollReport
        employees={employees as Employee[]}
        entries={(entries ?? []) as []}
        shifts={(shifts ?? []) as []}
        absences={(absences ?? []) as []}
      />
    </div>
  )
}
