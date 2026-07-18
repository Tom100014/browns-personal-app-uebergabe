import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import TeamChat from "@/components/nachrichten/TeamChat"
import type { Message, Employee, CoverageRequest } from "@/types"

export default async function PortalChat() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const [{ data: messages }, { data: employees }, { data: coverage }] = await Promise.all([
    supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(120),
    supabase.from("employee_directory").select("id,name,color,position,role").order("name"),
    supabase.from("coverage_requests").select("*, offers:coverage_offers(*)").neq("status", "cancelled").order("created_at", { ascending: false }).limit(40),
  ])

  return (
    <div className="flex min-h-0 flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Team-Chat</h1>
        <p className="text-gray-500 text-sm mt-0.5">Schreib mit deinen Kollegen</p>
      </div>
      <TeamChat
        messages={((messages ?? []) as Message[]).reverse()}
        employees={(employees ?? []) as Employee[]}
        coverageRequests={(coverage ?? []) as CoverageRequest[]}
        selfEmployeeId={staff.employee.id}
      />
    </div>
  )
}
