import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import MyAbsence from "@/components/portal/MyAbsence"

export default async function PortalAbwesenheit() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const { data: absences } = await supabase
    .from("absences").select("*")
    .eq("employee_id", staff.employee.id)
    .order("created_at", { ascending: false })

  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Abwesenheit</h1>
        <p className="text-gray-500 text-sm mt-0.5">Urlaub, Krankmeldung oder Frei-Wunsch beantragen</p>
      </div>
      <MyAbsence absences={(absences ?? []) as []} employeeId={staff.employee.id} />
    </div>
  )
}
