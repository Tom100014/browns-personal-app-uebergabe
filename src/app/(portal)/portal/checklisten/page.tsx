import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import ChecklistManager from "@/components/checklisten/ChecklistManager"
import type { Employee } from "@/types"

export default async function PortalChecklisten() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const [{ data: checklists }, { data: employees }] = await Promise.all([
    supabase.from("checklists").select("*, items:checklist_items(*)").order("created_at", { ascending: false }),
    supabase.from("employee_directory").select("id,name,color,position,role").order("name"),
  ])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Checklisten</h1>
        <p className="text-gray-500 text-sm mt-0.5">Hak deine Aufgaben ab</p>
      </div>
      <ChecklistManager
        checklists={(checklists ?? []) as []}
        employees={(employees ?? []) as Employee[]}
        canManage={false}
        selfEmployeeId={staff.employee.id}
      />
    </div>
  )
}
