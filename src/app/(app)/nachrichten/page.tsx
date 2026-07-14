import { createClient } from "@/lib/supabase-server"
import TeamChat from "@/components/nachrichten/TeamChat"
import type { Message, Employee, CoverageRequest } from "@/types"

export default async function NachrichtenPage() {
  const supabase = await createClient()
  const [{ data: messages }, { data: employees }, { data: coverage }] = await Promise.all([
    supabase.from("messages").select("*, employee:employees(id,name,color,position,role)").order("created_at", { ascending: false }).limit(120),
    supabase.from("employees").select("*").order("name"),
    supabase.from("coverage_requests").select("*, offers:coverage_offers(*, employee:employees(id,name,color,position))").neq("status", "cancelled").order("created_at", { ascending: false }).limit(40),
  ])
  return (
    <div className="flex min-h-0 flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-4 shrink-0 sm:mb-5">
        <h1 className="text-xl font-bold text-gray-900">Nachrichten</h1>
        <p className="text-gray-500 text-sm mt-0.5">Team-Kommunikation &amp; Ersatzsuche</p>
      </div>
      <TeamChat
        messages={((messages ?? []) as Message[]).reverse()}
        employees={(employees ?? []) as Employee[]}
        coverageRequests={(coverage ?? []) as CoverageRequest[]}
        isAdmin
      />
    </div>
  )
}
