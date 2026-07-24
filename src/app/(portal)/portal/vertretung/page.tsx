import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import MyCoverage from "@/components/portal/MyCoverage"
import type { CoverageRequest, Employee } from "@/types"

export default async function PortalVertretung() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })
  const [{ data: coverage }, { data: employees }] = await Promise.all([
    supabase.from("coverage_requests")
      .select("*, offers:coverage_offers(*)")
      .in("status", ["open", "filled"])
      .gte("date", today)
      .order("date"),
    supabase.from("employee_directory").select("id,name,color,position,role").order("name"),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Vertretung</h1>
        <p className="text-gray-500 text-sm mt-0.5">Hier kannst du für Kollegen einspringen — die Leitung bestätigt</p>
      </div>
      <MyCoverage
        requests={(coverage ?? []) as CoverageRequest[]}
        employees={(employees ?? []) as Employee[]}
        selfId={staff.employee.id}
      />
    </div>
  )
}
