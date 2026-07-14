import { createClient } from "@/lib/supabase-server"
import ChecklistManager from "@/components/checklisten/ChecklistManager"

export default async function ChecklistenPage() {
  const supabase = await createClient()
  const [{ data: checklists }, { data: employees }] = await Promise.all([
    supabase.from("checklists").select("*, items:checklist_items(*)").order("created_at", { ascending: false }),
    supabase.from("employees").select("*").order("name"),
  ])
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Checklisten</h1>
        <p className="text-gray-500 text-sm mt-0.5">Aufgaben verwalten und mit Schichten verknüpfen</p>
      </div>
      <ChecklistManager checklists={(checklists ?? []) as any} employees={(employees ?? []) as any} />
    </div>
  )
}
