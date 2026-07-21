import { createClient } from "@/lib/supabase-server"
import TimeTracker from "@/components/zeiterfassung/TimeTracker"
import type { TimeEntry, Employee } from "@/types"
import PageHeader from "@/components/layout/PageHeader"

export default async function ZeiterfassungPage() {
  const supabase = await createClient()
  const [{ data: entries }, { data: employees }, { data: setting }] = await Promise.all([
    supabase.from("time_entries").select("*, employee:employees(*)").order("created_at", { ascending: false }).limit(100),
    supabase.from("employees").select("*").order("name"),
    supabase.from("settings").select("value").eq("key", "wifi_ip").single(),
  ])

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title={"Zeiterfassung"} subtitle={"Ein- und Ausstempeln · Stundenübersicht · WiFi-Verifikation"} />
      <TimeTracker
        entries={(entries ?? []) as TimeEntry[]}
        employees={(employees ?? []) as Employee[]}
        locationConfigured={!!(setting?.value ?? "").trim()}
      />
    </div>
  )
}
