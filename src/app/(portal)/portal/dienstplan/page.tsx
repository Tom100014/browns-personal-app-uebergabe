import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import MyShifts from "@/components/portal/MyShifts"
import type { Shift } from "@/types"

export default async function PortalDienstplan() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const today = new Date().toISOString().split("T")[0]
  const { data: shifts } = await supabase
    .from("shifts").select("*")
    .eq("employee_id", staff.employee.id)
    .gte("date", today)
    .order("date").order("start_time")

  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Mein Dienstplan</h1>
        <p className="text-gray-500 text-sm mt-0.5">Dein Plan ist verbindlich — nur melden, wenn ein Tag nicht passt</p>
      </div>
      <MyShifts shifts={(shifts ?? []) as Shift[]} />
    </div>
  )
}
