import { createClient } from "@/lib/supabase-server"
import { 
  Users, 
  Calendar, 
  UserCheck, 
  LifeBuoy, 
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
import { PLANNING_EMAIL_SUFFIX } from "@/lib/planning-profile"
import OccupancyForecast from "@/components/belegung/OccupancyForecast"
import LiveRefresh from "@/components/realtime/LiveRefresh"
import WeekHoursChart from "@/components/charts/WeekHoursChart"
import ActionCenter, { type DashboardActionItem } from "@/components/dashboard/ActionCenter"
import DailyMorningBriefing from "@/components/dashboard/DailyMorningBriefing"
import type { CoverageRequest } from "@/types"

type DashboardCoverage = Pick<CoverageRequest, "id" | "date" | "position"> & { offers?: { id: string }[] }
type DashboardShift = { id: string; date: string; position: string; start_time: string; end_time: string; note?: string | null }
type DashboardAbsence = { id: string; type: string; start_date: string; end_date: string; employee?: { name?: string } }
type DashboardProfile = { id: string; name: string; email: string }
type DashboardKnowledgeDoc = { id: string; title: string; file_path: string; kind: string; created_at?: string | null }

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

  const [
    { data: { user } },
    { count: employeeCount },
    { data: todayShifts },
    { data: openEntries },
    { data: pendingAbsences, count: pendingAbsenceCount },
    { data: openCoverage, count: openCoverageCount },
    { data: openShifts, count: openShiftCount },
    { data: futureDraftShifts, count: futureDraftShiftCount },
    { data: planningProfiles, count: planningProfileCount },
    { data: unprocessedKnowledgeDocs },
    { data: weekShifts },
    { data: todayEntries },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("employees").select("id", { count: "exact", head: true }),
    supabase.from("shifts").select("id,employee_id,status,start_time,end_time,position,employee:employees(name,color)").eq("date", today).order("start_time"),
    supabase.from("time_entries").select("id,clock_in,employee:employees(name,color,position)").is("clock_out", null),
    supabase.from("absences")
      .select("id,type,start_date,end_date,employee:employees(name)", { count: "exact" })
      .eq("status", "pending")
      .order("created_at")
      .limit(3),
    supabase.from("coverage_requests")
      .select("id,date,position,offers:coverage_offers(id)", { count: "exact" })
      .eq("status", "open")
      .gte("date", today)
      .order("date")
      .limit(3),
    supabase.from("shifts").select("id,date,position,start_time,end_time", { count: "exact" }).is("employee_id", null).gte("date", today).order("date").limit(3),
    supabase.from("shifts")
      .select("id,date,position,start_time,end_time,note", { count: "exact" })
      .eq("status", "scheduled")
      .not("employee_id", "is", null)
      .ilike("note", "%Entwurf%")
      .gt("date", today)
      .order("date")
      .limit(3),
    supabase.from("employees")
      .select("id,name,email", { count: "exact" })
      .ilike("email", `%${PLANNING_EMAIL_SUFFIX}`)
      .order("name")
      .limit(3),
    supabase.from("knowledge_docs")
      .select("id,title,file_path,kind,created_at")
      .not("file_path", "is", null)
      .is("extracted", null)
      .order("created_at")
      .limit(100),
    supabase.from("shifts").select("date,start_time,end_time").not("employee_id", "is", null).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("time_entries").select("employee_id").eq("date", today),
  ])

  const coverage = (openCoverage ?? []) as DashboardCoverage[]
  const coverageCount = openCoverageCount ?? 0
  const openShiftList = (openShifts ?? []) as DashboardShift[]
  const unfilledShiftCount = openShiftCount ?? 0
  const draftShiftList = (futureDraftShifts ?? []) as DashboardShift[]
  const draftShiftCount = futureDraftShiftCount ?? 0
  const absenceList = (pendingAbsences ?? []) as DashboardAbsence[]
  const absenceCount = pendingAbsenceCount ?? 0
  const planningProfileList = (planningProfiles ?? []) as DashboardProfile[]
  const profileCount = planningProfileCount ?? 0
  const knowledgeDocList = ((unprocessedKnowledgeDocs ?? []) as DashboardKnowledgeDoc[])
    .filter(doc => doc.kind === "bild" || /\.(txt|csv|tsv|md|xlsx)$/i.test(doc.file_path))
  const knowledgeDocCount = knowledgeDocList.length

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
    { label: "Mitarbeiter", value: employeeCount ?? 0, icon: Users, color: "text-brand-600", bg: "bg-brand-50/70 border border-brand-100/40", accent: "before:bg-brand-400", href: "/mitarbeiter" },
    { label: "Schichten heute", value: todayShifts?.length ?? 0, icon: Calendar, color: "text-violet-600", bg: "bg-violet-50/70 border border-violet-100/40", accent: "before:bg-violet-400", href: `/dienstplan?date=${today}` },
    { label: "Gerade im Café", value: openEntries?.length ?? 0, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50/70 border border-emerald-100/40", accent: "before:bg-emerald-400", href: "/zeiterfassung" },
  ]

  const nextShift = ((todayShifts ?? []) as { start_time: string }[]).find(s => s.start_time.slice(0, 5) > nowHHMM)

  const actionItems: DashboardActionItem[] = [
    ...(unfilledShiftCount > 0 ? [{
      id: "unfilled-shifts",
      href: `/dienstplan?date=${openShiftList[0]?.date ?? today}`,
      title: "Unbesetzte Schichten zuweisen",
      detail: openShiftList.map(shift => `${shift.position} am ${formatDayLabel(shift.date)}`).join(" · "),
      count: unfilledShiftCount,
      kind: "unfilled" as const,
      severity: "critical" as const,
      status: "Besetzung",
    }] : []),
    ...(coverageCount > 0 ? [{
      id: "open-coverage",
      href: "/vertretung",
      title: "Offene Vertretungen besetzen",
      detail: coverage.map(request => `${request.position} am ${formatDayLabel(request.date)} (${request.offers?.length ?? 0} Angebote)`).join(" · "),
      count: coverageCount,
      kind: "coverage" as const,
      severity: "critical" as const,
      status: "Vertretung",
    }] : []),
    ...(absenceCount > 0 ? [{
      id: "pending-absences",
      href: "/abwesenheiten",
      title: "Abwesenheitsanträge entscheiden",
      detail: absenceList.map(absence => `${absence.employee?.name ?? "Mitarbeiter"}: ${formatDayLabel(absence.start_date)}`).join(" · "),
      count: absenceCount,
      kind: "absences" as const,
      severity: "warning" as const,
      status: "Freigabe",
    }] : []),
    ...(draftShiftCount > 0 ? [{
      id: "future-drafts",
      href: `/dienstplan?date=${draftShiftList[0]?.date ?? today}`,
      title: "Zukünftige Schichtentwürfe prüfen",
      detail: draftShiftList.map(shift => `${shift.position} am ${formatDayLabel(shift.date)}`).join(" · "),
      count: draftShiftCount,
      kind: "drafts" as const,
      severity: "warning" as const,
      status: "Planung",
    }] : []),
    ...(profileCount > 0 ? [{
      id: "planning-profiles",
      href: "/mitarbeiter?filter=planung",
      title: "Planungsprofile vervollständigen",
      detail: `${planningProfileList.map(profile => profile.name).join(" · ")} · E-Mail, Stammdaten und App-Zugang prüfen.`,
      count: profileCount,
      kind: "planning-profiles" as const,
      severity: "warning" as const,
      status: "Datenpflege",
    }] : []),
    ...(knowledgeDocCount > 0 ? [{
      id: "unprocessed-knowledge",
      href: "/einstellungen#wissensdatenbank",
      title: "Wissensdokumente verarbeiten",
      detail: knowledgeDocList.slice(0, 3).map(doc => doc.title).join(" · "),
      count: knowledgeDocCount,
      kind: "knowledge" as const,
      severity: "info" as const,
      status: "Wissensdatenbank",
    }] : []),
  ]

  // Current user employee profile
  let { data: currentEmp } = user ? await supabase.from("employees").select("name, avatar").eq("auth_user_id", user.id).maybeSingle() : { data: null }
  if (!currentEmp && user?.email) {
    const { data: byEmail } = await supabase.from("employees").select("name, avatar").ilike("email", user.email).maybeSingle()
    currentEmp = byEmail
  }
  const empName = currentEmp?.name ?? (user?.email?.includes("zeynep") ? "Zeynep Kara" : "Tom Schuh")
  const firstName = empName.split(" ")[0]
  const userAvatar = currentEmp?.avatar ?? (user?.email?.includes("zeynep") ? "/avatars/zeynep-kara.jpg" : null)

  const MOTIVATIONAL_QUOTES = [
    "✨ „Ein starkes Team beginnt mit einer inspirierenden Leitung. Schön, dass du da bist!“",
    "🌟 „Erfolg entsteht durch Leidenschaft, Vertrauen und gemeinsamen Einsatz.“",
    "☕ „Dein Lächeln und deine positive Energie stecken das ganze Café an — heute wird ein phantastischer Tag!“",
    "🏆 „Führung bedeutet, das Team gemeinsam zum Strahlen zu bringen. Auf einen großartigen Tag!“",
    "❤️ „Mit Herz, Ausdauer und Motivation schaffen wir heute wieder Außergewöhnliches in Browns Lounge!“",
  ]
  const dailyQuote = MOTIVATIONAL_QUOTES[todayAnchor.getDate() % MOTIVATIONAL_QUOTES.length]

  return (
    <div className="max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <LiveRefresh tables={["shifts", "time_entries", "absences", "coverage_requests", "coverage_offers", "employees", "knowledge_docs"]} />

      <DailyMorningBriefing
        userName={firstName}
        openShiftsCount={unfilledShiftCount}
        unbookedCount={noShows.length}
        pendingAbsencesCount={absenceCount}
        pendingCoverageCount={coverageCount}
      />

      <div className="soft-panel overflow-hidden p-6 sm:p-8 bg-gradient-to-r from-amber-500/10 via-white to-amber-500/5 border border-amber-200/60 shadow-sm rounded-3xl">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100/80 px-3.5 py-1.5 text-xs font-extrabold text-amber-900 shadow-sm border border-amber-200">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <span>Browns Admin Dashboard · Geschäftsleitung</span>
            </div>
            
            <div className="flex items-center gap-4 mb-3">
              {userAvatar ? (
                <img src={userAvatar} alt={empName} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-white shadow-md flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500 text-white font-extrabold text-2xl flex items-center justify-center border-4 border-white shadow-md flex-shrink-0">
                  {firstName[0]}
                </div>
              )}
              <div>
                <h1 className="flex items-center gap-2.5 text-2xl font-black leading-tight text-slate-950 sm:text-4xl">
                  <GreetingIcon className="h-7 w-7 text-amber-500 sm:h-9 sm:w-9 flex-shrink-0" />
                  {greeting}, {firstName}! ✨
                </h1>
                <p className="text-sm font-semibold text-amber-800 mt-1">Einen wunderschönen &amp; erfolgreichen Tag in Browns Lounge!</p>
              </div>
            </div>

            {/* Motivierender Tages-Spruch */}
            <div className="mt-3 p-3.5 rounded-2xl bg-white/90 border border-amber-200/80 shadow-sm text-xs font-semibold text-slate-800 leading-relaxed italic">
              {dailyQuote}
            </div>

            <p className="mt-2 text-xs capitalize leading-relaxed text-slate-500">{format(todayAnchor, "EEEE, dd. MMMM yyyy", { locale: de })} · <span className="font-mono text-slate-400">{user?.email}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
            <div className="rounded-3xl bg-white p-4 shadow-card">
              <Clock className="mb-4 h-5 w-5 text-brand-500" />
              <p className="stat-number text-3xl text-slate-950">{nowHHMM}</p>
              <p className="text-xs font-semibold text-slate-400">Aktuelle Zeit</p>
            </div>
            <div className="rounded-3xl bg-white p-4 shadow-card">
              <Calendar className="mb-4 h-5 w-5 text-brand-500" />
              <p className="stat-number text-3xl text-slate-950">{nextShift ? nextShift.start_time.slice(0, 5) : "—"}</p>
              <p className="text-xs font-semibold text-slate-400">{nextShift ? "Nächste Schicht" : "Keine weitere Schicht"}</p>
            </div>
          </div>
        </header>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, color, bg, accent, href }) => (
          <Link key={label} href={href}
            className={`surface-card group relative flex min-h-[132px] flex-col justify-between overflow-hidden p-5 transition before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-lg ${accent}`}>
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

      <ActionCenter items={actionItems} />

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
              <Link href={`/dienstplan?date=${today}`} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
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
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: s.employee?.color ?? "#4a8df7" }}>
                        {initials(s.employee?.name)}
                      </span>
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
