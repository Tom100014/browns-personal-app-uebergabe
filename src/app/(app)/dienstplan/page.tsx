import { createClient } from "@/lib/supabase-server"
import ShiftCalendar from "@/components/dienstplan/ShiftCalendar"
import type { Shift, Employee } from "@/types"

type AbsenceRow = { employee_id: string; type: string; start_date: string; end_date: string; status: string }

export default async function DienstplanPage() {
  const supabase = await createClient()

  const { data: shifts } = await supabase
    .from("shifts")
    .select("*, employee:employees(*)")
    .order("date")

  const [{ data: employees }, { data: priv }] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    supabase.from("employee_private").select("employee_id,weekly_hours,hourly_wage"),
  ])
  const privById = new Map((priv ?? []).map((p: { employee_id: string; weekly_hours: number | null; hourly_wage: number | null }) => [p.employee_id, p]))
  const employeesMerged = (employees ?? []).map(e => ({ ...e, weekly_hours: privById.get(e.id)?.weekly_hours ?? null, hourly_wage: privById.get(e.id)?.hourly_wage ?? null }))

  const { data: settingsRows } = await supabase.from("settings").select("key,value").in("key", ["min_staffing", "opening_hours"])
  let minStaffing: Record<string, number> = {}
  let openingHours: Record<string, { open: string; close: string; closed: boolean }> = {}
  try { const v = settingsRows?.find(s => s.key === "min_staffing")?.value; if (v) minStaffing = JSON.parse(v) } catch {}
  try { const v = settingsRows?.find(s => s.key === "opening_hours")?.value; if (v) openingHours = JSON.parse(v) } catch {}

  // Genehmigte/offene Abwesenheiten — zur Konfliktwarnung beim Einplanen.
  const { data: absences } = await supabase
    .from("absences")
    .select("employee_id,type,start_date,end_date,status")
    .neq("status", "rejected")

  return (
    <div className="p-4 sm:p-6 h-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Dienstplan</h1>
        <p className="text-gray-500 text-sm mt-0.5">Wochenansicht · Schichten planen und verwalten</p>
      </div>
      <ShiftCalendar
        shifts={(shifts ?? []) as Shift[]}
        employees={employeesMerged as Employee[]}
        minStaffing={minStaffing}
        absences={(absences ?? []) as AbsenceRow[]}
        openingHours={openingHours}
      />
    </div>
  )
}
