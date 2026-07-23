import { createClient } from "@/lib/supabase-server"
import TimeTracker from "@/components/zeiterfassung/TimeTracker"
import type { TimeEntry, Employee, Shift } from "@/types"
import PageHeader from "@/components/layout/PageHeader"

export default async function ZeiterfassungPage() {
  const supabase = await createClient()
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" })

  const [{ data: entries }, { data: employees }, { data: setting }, { data: shifts }] = await Promise.all([
    supabase.from("time_entries").select("*, employee:employees(*)").order("created_at", { ascending: false }).limit(100),
    supabase.from("employees").select("*").order("name"),
    supabase.from("settings").select("value").eq("key", "wifi_ip").maybeSingle(),
    supabase.from("shifts").select("*, employee:employees(*)").gte("date", sevenDaysAgo).lte("date", todayStr),
  ])

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title={"Zeiterfassung"} subtitle={"Ein- und Ausstempeln · Nachträgliche Erfassung · WiFi-Verifikation"} />
      <TimeTracker
        entries={(entries ?? []) as TimeEntry[]}
        employees={(employees ?? []) as Employee[]}
        shifts={(shifts ?? []) as Shift[]}
        locationConfigured={!!(setting?.value ?? "").trim()}
        isAdmin={true}
      />
    </div>
  )
}
