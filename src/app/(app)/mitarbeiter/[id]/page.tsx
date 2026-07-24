import { createClient } from "@/lib/supabase-server"
import { notFound } from "next/navigation"
import EmployeeDetail from "@/components/mitarbeiter/EmployeeDetail"
import type { Employee, EmployeeDocument } from "@/types"

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: employee }, { data: priv }, { data: documents }, { data: timeEntries }, { data: absences }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).single(),
    supabase.from("employee_private").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("documents").select("*").eq("employee_id", id).order("uploaded_at", { ascending: false }),
    supabase.from("time_entries").select("id,date,clock_in,clock_out,break_minutes").eq("employee_id", id).order("date", { ascending: false }).limit(60),
    supabase.from("absences").select("id,type,start_date,end_date,status,note").eq("employee_id", id).order("start_date", { ascending: false }),
  ])

  if (!employee) notFound()
  const merged = { ...employee, ...(priv ?? {}) } as Employee

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <EmployeeDetail
        employee={merged}
        documents={(documents ?? []) as EmployeeDocument[]}
        timeEntries={(timeEntries ?? []) as []}
        absences={(absences ?? []) as []}
      />
    </div>
  )
}
