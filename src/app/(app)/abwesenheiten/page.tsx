import { createClient } from "@/lib/supabase-server"
import AbsenceManager, { type Absence } from "@/components/abwesenheiten/AbsenceManager"
import type { Employee } from "@/types"

export default async function AbwesenheitenPage() {
  const supabase = await createClient()
  const [{ data: absences }, { data: employees }] = await Promise.all([
    supabase.from("absences").select("*, employee:employees(id,name,color,position,role)").order("created_at", { ascending: false }),
    supabase.from("employees").select("id,name,email,phone,position,role,employment_type,color,start_date,created_at,auth_user_id").order("name"),
  ])
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Abwesenheiten</h1>
        <p className="text-gray-500 text-sm mt-0.5">Urlaub, Krankmeldungen und Freitage verwalten</p>
      </div>
      <AbsenceManager absences={(absences ?? []) as Absence[]} employees={(employees ?? []) as Employee[]} />
    </div>
  )
}
