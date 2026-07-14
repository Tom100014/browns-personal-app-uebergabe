import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import TimeTracker from "@/components/zeiterfassung/TimeTracker"
import type { TimeEntry, Employee } from "@/types"

export default async function PortalStempeln() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const supabase = await createClient()
  const [{ data: entries }, { data: setting }] = await Promise.all([
    supabase.from("time_entries").select("*, employee:employees(*)").eq("employee_id", staff.employee.id).order("date", { ascending: false }).limit(50),
    supabase.from("settings").select("value").eq("key", "wifi_ip").maybeSingle(),
  ])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Stempeln</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ein- und Ausstempeln · nur im Browns Café WLAN</p>
      </div>
      <TimeTracker
        entries={(entries ?? []) as TimeEntry[]}
        employees={[staff.employee] as Employee[]}
        locationConfigured={!!(setting?.value ?? "").trim()}
        lockedEmployeeId={staff.employee.id}
        hero
      />
    </div>
  )
}
