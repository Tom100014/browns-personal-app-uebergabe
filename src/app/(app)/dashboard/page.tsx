import { createClient } from "@/lib/supabase-server"
import { 
  Users, 
  Calendar, 
  UserCheck, 
  LifeBuoy, 
  ArrowRight, 
  TrendingUp, 
  AlertTriangle,
  Clock,
  Sparkles,
  ChevronRight,
  Sun,
  CloudSun,
  Moon
} from "lucide-react"
import Link from "next/link"
import { format, startOfWeek, endOfWeek } from "date-fns"
import { de } from "date-fns/locale"
import { formatDayLabel } from "@/lib/coverage"
import { shiftHours, formatHours } from "@/lib/hours"
import OccupancyForecast from "@/components/belegung/OccupancyForecast"
import LiveRefresh from "@/components/realtime/LiveRefresh"
import WeekHoursChart from "@/components/charts/WeekHoursChart"
import type { CoverageRequest } from "@/types"

type DashboardCoverage = Pick<CoverageRequest, "id" | "date" | "position"> & { offers?: { id: string }[] }

const initials = (name?: string) => (name ?? "—").split(" ").map(n => n[0]).join("").slice(0, 2)

export default async function DashboardPage() {
  const supabase = await createClient()
  const TZ = "Europe/Berlin"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ }) // yyyy-MM-dd (Café-Zeit)
  const nowHHMM = new Date().toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
  
  // Woche aus der Café-Zeit (Berlin) ableiten
  const todayAnchor = new Date(today + "T12:00:00")
  const weekStart = format(startOfWeek(todayAnchor, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const weekEnd = format(endOfWeek(todayAnchor, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const hour = Number(nowHHMM.slice(0, 2))
  const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend"
  
  // Choose greeting icon
  const GreetingIcon = hour < 11 ? Sun : hour < 17 ? CloudSun : Moon

  const [{ data: { user } }, { count: employeeCount }, { data: todayShifts }, { data: openEntries }, { count: pendingAbsenceCount }, { data: openCoverage, count: openCoverageCount }, { data: openShifts, count: openShiftCount }, { data: weekShifts }, { data: todayEntries }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("employees").select("id", { count: "exact", head: true }),
    supabase.from("shifts").select("id,employee_id,status,start_time,end_time,position,employee:employees(name,color)").eq("date", today).order("start_time"),
    supabase.from("time_entries").select("id,clock_in,employee:employees(name,color,position)").is("clock_out", null),
    supabase.from("absences").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("coverage_requests")
      .select("id,date,position,offers:coverage_offers(id)", { count: "exact" })
      .eq("status", "open")
      .order("date")
      .limit(3),
    supabase.from("shifts").select("id,date,position,start_time,end_time", { count: "exact" }).is("employee_id", null).gte("date", today).order("date").limit(3),
    supabase.from("shifts").select("date,start_time,end_time").not("employee_id", "is", null).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("time_entries").select("employee_id").eq("date", today),
  ])

  const coverage = (openCoverage ?? []) as DashboardCoverage[]
  const coverageCount = openCoverageCount ?? 0
  const openShiftList = (openShifts ?? []) as { id: string; date: string; position: string; start_time: string; end_time: string }[]
  const unfilledShiftCount = openShiftCount ?? 0

  // Wer fehlt: Schicht hat begonnen, aber noch nicht eingestempelt
  const clockedIn = new Set((todayEntries ?? []).map((e: { employee_id: string }) => e.employee_id))
  const noShows = ((todayShifts ?? []) as { id: string; employee_id: string | null; status: string; start_time: string; end_time: string; position: string; employee?: { name?: string; color?: string } }[])
    .filter(s => s.employee_id && s.status !== "absent" && s.start_time.slice(0, 5) <= nowHHMM && !clockedIn.has(s.employee_id))

  // Geplante Team-Stunden pro Wochentag (Mo–So)
  const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
  const weekHours = WD.map(() => 0)
  for (const s of (weekShifts ?? []) as { date: string; start_time: string; end_time: string }[]) {
    const d = new Date(s.date)
    const idx = (d.getDay() + 6) % 7 // Mo=0 … So=6
    weekHours[idx] += shiftHours(s)
  }
  const weekTotal = weekHours.reduce((a, b) => a + b, 0)
  const todayIdx = (new Date(today + "T12:00:00").getDay() + 6) % 7
  const chartData = WD.map((day, i) => ({ day, stunden: Math.round(weekHours[i] * 10) / 10, istHeute: i === todayIdx }))

  const stats = [
    { label: "Mitarbeiter", value: employeeCount ?? 0, icon: Users, color: "text-brand-600", bg: "bg-brand-50/70 border border-brand-100/40", href: "/mitarbeiter" },
    { label: "Schichten heute", value: todayShifts?.length ?? 0, icon: Calendar, color: "text-violet-600", bg: "bg-violet-50/70 border border-violet-100/40", href: "/dienstplan" },
    { label: "Gerade im Café", value: openEntries?.length ?? 0, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50/70 border border-emerald-100/40", href: "/zeiterfassung" },
    { label: "Offene Vertretungen", value: coverageCount, icon: LifeBuoy, color: "text-orange-600", bg: "bg-orange-50/70 border border-orange-100/40", href: "/vertretung" },
  ]

  return (
    <div className="max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <LiveRefresh tables={["shifts", "time_entries", "absences", "coverage_requests", "coverage_offers"]} />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-card">
            <Sparkles className="h-3.5 w-3.5" />
            Browns Admin Dashboard
          </div>
          <h1 className="flex items-center gap-3 text-3xl leading-tight text-slate-950 sm:text-5xl">
            <GreetingIcon className="h-8 w-8 text-brand-500" />
            {greeting}, Leitung
          </h1>
          <p className="mt-3 text-sm capitalize text-slate-500">{format(todayAnchor, "EEEE, dd. MMMM yyyy", { locale: de })}</p>
          <p className="mt-1 text-xs text-slate-400">{user?.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-card">
            <p className="text-xs font-semibold text-slate-400">Aktuelle Zeit</p>
            <p className="stat-number text-2xl text-slate-950">{nowHHMM}</p>
          </div>
          {(pendingAbsenceCount ?? 0) > 0 && (
            <Link href="/abwesenheiten"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand-600">
            <span>{pendingAbsenceCount} offene Urlaubsanträge</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href}
            className="surface-card group flex min-h-[132px] flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-lg">
            <div className="flex items-start justify-between">
              <span className="stat-number text-3xl font-bold leading-none text-slate-950 sm:text-4xl">{value}</span>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${bg}`}>
                <Icon className={`h-4 w-4 ${color} group-hover:scale-105 transition-transform duration-300`} />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-500 transition-colors group-hover:text-slate-900">{label}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          {noShows.length > 0 && (
            <div className="rounded-[1.35rem] border border-red-200 bg-red-50 p-5 shadow-card">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-red-950">{noShows.length} Mitarbeiter überfällig</p>
                  <p className="mt-0.5 text-sm text-red-700">Schichten laufen bereits, aber die Zeiterfassung wurde nicht gestartet.</p>
                </div>
                <Link href="/vertretung"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">
                  <LifeBuoy className="h-4 w-4" /> Vertretung organisieren
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {noShows.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: s.employee?.color ?? "#ef4444" }}>
                      {initials(s.employee?.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold leading-tight text-slate-950">{s.employee?.name ?? "Offene Schicht"}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-red-600">
                        Ab {s.start_time.slice(0, 5)} Uhr erwartet ({s.position})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {coverageCount > 0 && (
              <Link href="/vertretung"
                className="surface-card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-card-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100">
                  <LifeBuoy className="h-6 w-6 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950">{coverageCount} offene Vertretungsanfragen</p>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">
                    {coverage.slice(0, 3).map(c => `${c.position} am ${formatDayLabel(c.date)} (${c.offers?.length ?? 0} Angebote)`).join(" · ")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-orange-500 transition group-hover:translate-x-0.5" />
              </Link>
            )}

            {unfilledShiftCount > 0 && (
              <Link href="/dienstplan"
                className="surface-card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-card-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                  <Calendar className="h-6 w-6 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950">{unfilledShiftCount} unbesetzte Schichten</p>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">
                    {openShiftList.slice(0, 3).map(s => `${s.position} am ${formatDayLabel(s.date)}`).join(" · ")}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-500 transition group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>

          <div className="surface-card p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
                  <TrendingUp className="h-4 w-4 text-brand-600" /> Geplante Team-Stunden
                </h2>
                <p className="mt-1 text-xs text-slate-400">Aktuelle Woche (Mo - So)</p>
              </div>
              <div className="text-right">
                <span className="stat-number text-2xl font-bold text-slate-950">{formatHours(weekTotal)}</span>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Gesamt</p>
              </div>
            </div>
            <WeekHoursChart data={chartData} />
          </div>

          <div className="surface-card p-5">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-950">Schichten am heutigen Tag</h2>
                <p className="mt-1 text-xs text-slate-400">Alle geplanten Einsätze für heute</p>
              </div>
              <Link href="/dienstplan" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                Dienstplan <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {!todayShifts?.length ? (
              <div className="py-10 text-center">
                <Calendar className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">Heute sind keine Schichten geplant.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(todayShifts as { id: string; start_time?: string; end_time?: string; position: string; status: string; employee?: { name?: string; color?: string } }[]).map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 transition hover:bg-white">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.employee?.color ?? "#4a8df7" }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{s.employee?.name ?? "Offene Schicht"}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                          {s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)} Uhr · {s.position}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                      s.status === "absent" ? "bg-red-50 text-red-700" :
                      "bg-slate-200 text-slate-600"
                    }`}>
                      {s.status === "confirmed" ? "Bestätigt" : s.status === "absent" ? "Abwesend" : "Geplant"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <OccupancyForecast compact />

          <div className="surface-card flex flex-col p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                Gerade im Café
              </h2>
              <Link href="/zeiterfassung" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                Zeiterfassung <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="max-h-72 flex-1 space-y-2 overflow-y-auto pr-1">
              {!openEntries?.length ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Clock className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm text-slate-400">Derzeit ist niemand eingestempelt.</p>
                </div>
              ) : (
                (openEntries as { id: string; clock_in?: string; employee?: { name?: string; color?: string; position?: string } }[]).map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: e.employee?.color ?? "#4a8df7" }}>
                        {initials(e.employee?.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-slate-950">{e.employee?.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">{e.employee?.position}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600">
                      seit {e.clock_in?.slice(0, 5)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
