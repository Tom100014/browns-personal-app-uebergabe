import { createClient } from "@/lib/supabase-server"
import TimeTracker from "@/components/zeiterfassung/TimeTracker"
import type { TimeEntry, Employee } from "@/types"

export default async function ZeiterfassungPage() {
  const supabase = await createClient()
  const [{ data: entries }, { data: employees }, { data: setting }] = await Promise.all([
    supabase.from("time_entries").select("*, employee:employees(*)").order("created_at", { ascending: false }).limit(100),
    supabase.from("employees").select("*").order("name"),
    supabase.from("settings").select("value").eq("key", "wifi_ip").single(),
  ])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Zeiterfassung</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ein- und Ausstempeln · Stundenübersicht · WiFi-Verifikation</p>
      </div>
      <TimeTracker
        entries={(entries ?? []) as TimeEntry[]}
        employees={(employees ?? []) as Employee[]}
        locationConfigured={!!(setting?.value ?? "").trim()}
      />
    </div>
  )
}
