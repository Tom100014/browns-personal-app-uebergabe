import { createClient } from "@/lib/supabase-server"
import TeamChat from "@/components/nachrichten/TeamChat"
import type { Message, Employee, CoverageRequest } from "@/types"

export default async function NachrichtenPage() {
  const supabase = await createClient()
  const [{ data: messages }, { data: employees }, { data: coverage }] = await Promise.all([
    supabase.from("messages").select("*, employee:employees(*)").order("created_at").limit(100),
    supabase.from("employees").select("*").order("name"),
    supabase.from("coverage_requests").select("*, offers:coverage_offers(*, employee:employees(*))").order("created_at", { ascending: false }),
  ])
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl font-bold text-gray-900">Nachrichten</h1>
        <p className="text-gray-500 text-sm mt-0.5">Team-Kommunikation &amp; Ersatzsuche</p>
      </div>
      <TeamChat
        messages={(messages ?? []) as Message[]}
        employees={(employees ?? []) as Employee[]}
        coverageRequests={(coverage ?? []) as CoverageRequest[]}
        isAdmin
      />
    </div>
  )
}
