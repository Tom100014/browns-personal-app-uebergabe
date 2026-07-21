import { createClient } from "@/lib/supabase-server"
import EmployeeList from "@/components/mitarbeiter/EmployeeList"
import TeamChart from "@/components/mitarbeiter/TeamChart"
import { buildEmployeeIntelligence } from "@/lib/employee-intelligence"
import { getCurrentStaff } from "@/lib/staff"
import type { Employee } from "@/types"

type MitarbeiterPageProps = {
  searchParams: Promise<{ filter?: string | string[] }>
}

export default async function MitarbeiterPage({ searchParams }: MitarbeiterPageProps) {
  const params = await searchParams
  const requestedFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter
  const planningOnly = requestedFilter === "planung"
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
      <div className="sticky top-20 lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-3 mb-5 bg-gray-50/95 backdrop-blur border-b border-gray-200/70">
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
        planningOnly={planningOnly}
      />
    </div>
  )
}
