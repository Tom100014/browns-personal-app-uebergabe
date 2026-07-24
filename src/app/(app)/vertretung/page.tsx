import { createClient } from "@/lib/supabase-server"
import CoverageBoard from "@/components/vertretung/CoverageBoard"
import type { Employee, CoverageRequest } from "@/types"

export default async function VertretungPage() {
  const supabase = await createClient()
  const [{ data: coverage }, { data: employees }] = await Promise.all([
    supabase.from("coverage_requests")
      .select("*, offers:coverage_offers(*, employee:employees(id,name,color,position,role))")
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id,name,email,phone,position,role,employment_type,color,start_date,created_at,auth_user_id").order("name"),
  ])

  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Vertretung</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Automatische Ersatzsuche bei Ausfällen — Vorschläge prüfen und freigeben
        </p>
      </div>
      <CoverageBoard
        requests={(coverage ?? []) as CoverageRequest[]}
        employees={(employees ?? []) as Employee[]}
      />
    </div>
  )
}
