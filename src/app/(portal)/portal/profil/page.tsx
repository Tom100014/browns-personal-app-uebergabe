import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours, formatHours } from "@/lib/hours"
import { Mail, Phone, Briefcase, CalendarClock } from "lucide-react"
import { format } from "date-fns"
import PushToggle from "@/components/push/PushToggle"
import NotifyMuteToggle from "@/components/portal/NotifyMuteToggle"
import PasswordChange from "@/components/portal/PasswordChange"
import AvatarUpload from "@/components/portal/AvatarUpload"

export default async function PortalProfil() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const me = staff.employee
  const supabase = await createClient()
  const month = format(new Date(), "yyyy-MM")
  const { data: entries } = await supabase
    .from("time_entries").select("clock_in,clock_out,break_minutes,date")
    .eq("employee_id", me.id).gte("date", `${month}-01`)

  const monthHours = (entries ?? []).reduce((s, e) => s + entryHours(e), 0)
  const initials = me.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  const rows = [
    { icon: Mail, label: "E-Mail", value: me.email },
    { icon: Phone, label: "Telefon", value: me.phone || "—" },
    { icon: Briefcase, label: "Position", value: me.position },
    { icon: CalendarClock, label: "Anstellung", value: me.employment_type || "—" },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mein Profil</h1>
        <p className="text-gray-500 text-sm mt-0.5">Deine Daten — Änderungen bitte bei der Leitung melden</p>
      </div>

      <AvatarUpload employee={me} />

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 mb-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-5 py-3.5">
            <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 w-28">{label}</span>
            <span className="text-sm text-gray-800 font-medium">{value}</span>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <p className="text-sm text-gray-500">Gearbeitete Stunden diesen Monat</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{formatHours(monthHours)}</p>
      </div>

      <PasswordChange />

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Benachrichtigungen</h2>
        <p className="text-xs text-gray-500 mb-3">Erhalte Push bei neuem Plan, Ersatzsuche, Genehmigungen und Nachrichten.</p>
        <PushToggle />
        <NotifyMuteToggle employeeId={me.id} initial={me.notifications_enabled ?? true} />
      </div>
    </div>
  )
}
