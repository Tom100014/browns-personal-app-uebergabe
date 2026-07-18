import { createClient } from "@/lib/supabase-server"
import EmployeeList from "@/components/mitarbeiter/EmployeeList"
import TeamChart from "@/components/mitarbeiter/TeamChart"
import { buildEmployeeIntelligence } from "@/lib/employee-intelligence"
import { getCurrentStaff } from "@/lib/staff"
import type { Employee } from "@/types"

export default async function MitarbeiterPage() {
  const [supabase, staff] = await Promise.all([createClient(), getCurrentStaff()])
  const [{ data: employeeRows }, { data: pay }, intelligence, { data: primaryAdmin }] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    supabase.from("employee_private").select("employee_id,hourly_wage"),
    buildEmployeeIntelligence(supabase, { days: 56, maxDocs: 180 }),
    supabase.from("settings").select("value").eq("key", "primary_admin_employee_id").maybeSingle(),
  ])
  const wageById = new Map((pay ?? []).map((p: { employee_id: string; hourly_wage: number | null }) => [p.employee_id, p.hourly_wage]))
  const employees = (employeeRows ?? []).map(e => ({ ...e, hourly_wage: wageById.get(e.id) ?? null }))

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-950 sm:text-4xl">Mitarbeiter</h1>
        <p className="text-slate-500 text-sm mt-2">
          Team verwalten · {employees.length} Mitarbeiter · Einladen gibt Zugang zur Mitarbeiter-App
        </p>
      </div>
      <TeamChart employees={(employees ?? []) as Employee[]} intelligence={intelligence} />
      <EmployeeList
        employees={(employees ?? []) as Employee[]}
        primaryAdminId={primaryAdmin?.value ?? null}
        canManageAdmins={staff?.email === "admin@browns.at" || staff?.employee?.role === "admin"}
      />
    </div>
  )
}
