import { createClient } from "@/lib/supabase-server"
import TeamChat from "@/components/nachrichten/TeamChat"
import type { Message, Employee, CoverageRequest } from "@/types"
import PageHeader from "@/components/layout/PageHeader"

export default async function NachrichtenPage() {
  const supabase = await createClient()
  const [{ data: messages }, { data: employees }, { data: coverage }] = await Promise.all([
    supabase.from("messages").select("*, employee:employees(id,name,color,position,role)").order("created_at", { ascending: false }).limit(120),
    supabase.from("employees").select("*").order("name"),
    supabase.from("coverage_requests").select("*, offers:coverage_offers(*, employee:employees(id,name,color,position))").neq("status", "cancelled").order("created_at", { ascending: false }).limit(40),
  ])
  return (
    <div className="flex min-h-0 flex-col overflow-hidden p-2 sm:p-4 max-w-7xl mx-auto w-full">
      <PageHeader title={"WhatsApp Team-Chat"} subtitle={"Team-Kommunikation, 1:1 Nachrichten & Datei-Uploads"} />
      <TeamChat
        messages={((messages ?? []) as Message[]).reverse()}
        employees={(employees ?? []) as Employee[]}
        coverageRequests={(coverage ?? []) as CoverageRequest[]}
        isAdmin
      />
    </div>
  )
}
