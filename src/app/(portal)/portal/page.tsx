import Link from "next/link"
import { Clock, Calendar, LifeBuoy, ArrowRight, CalendarOff, MessageSquare, Grid3X3, ThumbsUp, Euro, Hand, BriefcaseBusiness, UserRoundCheck, Sun, CloudSun, Moon } from "lucide-react"
import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours, shiftHours, formatHours, formatEuro } from "@/lib/hours"
import { formatDayLabel } from "@/lib/coverage"
import LiveRefresh from "@/components/realtime/LiveRefresh"
import RingProgress from "@/components/charts/RingProgress"
import TimeTracker from "@/components/zeiterfassung/TimeTracker"
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth } from "date-fns"
import { de } from "date-fns/locale"
import type { Shift, TimeEntry } from "@/types"

type ChatMsg = { id: string; content: string; created_at: string; type: string; employee_id: string | null; employee?: { name?: string; color?: string } | null }
type Abs = { id: string; type: string; start_date: string; status: string }
type DirectoryRow = { id: string; name: string; color?: string | null }

const initials = (name?: string) => (name ?? "?").split(" ").map(n => n[0]).join("").slice(0, 2)

export default async function PortalHome() {
  const [staff, supabase] = await Promise.all([getCurrentStaff(), createClient()])
  if (!staff?.employee) return null
  const me = staff.employee
  const TZ = "Europe/Berlin"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ })
  const todayAnchor = new Date(today + "T12:00:00")
  const weekStartD = startOfWeek(todayAnchor, { weekStartsOn: 1 })
  const weekStart = format(weekStartD, "yyyy-MM-dd")
  const weekEnd = format(endOfWeek(todayAnchor, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const monthStart = format(startOfMonth(todayAnchor), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(todayAnchor), "yyyy-MM-dd")
  
  // Präzise deutsche Uhrzeit-Berechnung (Berlin Timezone)
  const nowBerlin = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }))
  const hour = nowBerlin.getHours()
  const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend"
  const GreetingIcon = hour < 11 ? Sun : hour < 17 ? CloudSun : Moon

  const [{ data: nextShifts }, { data: weekEntries }, { data: weekShiftsOwn }, { count: openCoverageCount }, { data: chat }, { data: myAbs }, { data: monthEntries }, { data: pay }, { data: directory }, { data: myEntries }] = await Promise.all([
    supabase.from("shifts").select("*").eq("employee_id", me.id).neq("status", "absent").gte("date", today).order("date").order("start_time").limit(3),
    supabase.from("time_entries").select("clock_in,clock_out,break_minutes").eq("employee_id", me.id).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("shifts").select("date,start_time,end_time,position,status").eq("employee_id", me.id).neq("status", "absent").gte("date", weekStart).lte("date", weekEnd).order("start_time"),
    supabase.from("coverage_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("messages").select("id,content,created_at,type,employee_id").eq("type", "chat").order("created_at", { ascending: false }).limit(4),
    supabase.from("absences").select("id,type,start_date,status").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("time_entries").select("clock_in,clock_out,break_minutes").eq("employee_id", me.id).gte("date", monthStart).lte("date", monthEnd),
    supabase.from("employee_private").select("hourly_wage").eq("employee_id", me.id).maybeSingle(),
    supabase.from("employee_directory").select("id,name,color"),
    supabase.from("time_entries").select("*").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(10),
  ])

  const shifts = (nextShifts ?? []) as Shift[]
  const next = shifts[0]
  const coverageCount = openCoverageCount ?? 0
  const directoryById = new Map(((directory ?? []) as DirectoryRow[]).map(employee => [employee.id, employee]))
  const messages = ((chat ?? []) as ChatMsg[])
    .map(message => ({ ...message, employee: message.employee_id ? directoryById.get(message.employee_id) : null }))
    .reverse()
  const absences = (myAbs ?? []) as Abs[]
  const pendingAbs = absences.filter(a => a.status === "pending")
  const todaysShift = shifts.find(s => s.date === today)
  const needsConfirm = shifts.filter(s => s.status === "scheduled").length

  // Wochenbilanz: gearbeitet vs. geplant
  const workedH = (weekEntries ?? []).reduce((acc, e) => acc + entryHours(e), 0)
  const plannedH = (weekShiftsOwn ?? []).reduce((acc, s) => acc + shiftHours(s), 0)

  // Monatslohn (Stunden × Stundenlohn)
  const monthWorkedH = (monthEntries ?? []).reduce((acc, e) => acc + entryHours(e), 0)
  const wage = pay?.hourly_wage ?? null
  const monthPay = wage != null ? monthWorkedH * wage : null

  const firstName = me.name.split(" ")[0]
  const statusLabel = me.position || me.role || "Mitarbeiter"

  const tiles = [
    {
      href: "/portal/dienstplan",
      icon: BriefcaseBusiness,
      title: "Nächster Einsatz:",
      value: next ? `${formatDayLabel(next.date)} · ${next.start_time.slice(0, 5)} Uhr (${next.position})` : "Keine Schicht",
      tone: "bg-[#c75d1b] text-white",
    },
    {
      href: "/portal/vertretung",
      icon: Grid3X3,
      title: "Ungelesene Jobangebote:",
      value: `${coverageCount} ${coverageCount === 1 ? "Aktion" : "Aktionen"}`,
      tone: "bg-[#ad4968] text-white",
      badge: coverageCount,
    },
    {
      href: "/portal/dienstplan",
      icon: ThumbsUp,
      title: "Einsatzplan:",
      value: `${needsConfirm} KAV offen`,
      tone: "bg-[#526f9d] text-white",
      badge: needsConfirm,
    },
    {
      href: "/portal/profil",
      icon: UserRoundCheck,
      title: "Reminder Profil:",
      value: `${pendingAbs.length} ${pendingAbs.length === 1 ? "Aktion" : "Aktionen"}`,
      tone: "bg-[#b74f4f] text-white",
    },
    {
      href: "/portal/stunden",
      icon: Euro,
      title: "Vorausschau Monatslohn:",
      value: monthPay == null ? "nicht hinterlegt" : formatEuro(monthPay),
      tone: "bg-[#4b9aa5] text-white",
    },
    {
      href: "/portal/profil",
      icon: Hand,
      title: "Aktueller Meldestatus:",
      value: String(statusLabel),
      tone: "bg-[#638345] text-white",
    },
  ]

  return (
    <div className="min-h-full max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 space-y-6">
      <LiveRefresh tables={["messages", "shifts", "coverage_requests", "absences", "time_entries"]} />
      
      <header className="mb-4 flex items-center justify-between gap-4 lg:hidden">
        <Link href="/portal/stempeln" className="text-charcoal-light">
          <Clock className="h-5 w-5" />
        </Link>
        <p className="text-sm font-extrabold text-charcoal">Mitarbeiter Portal</p>
        <Link href="/portal/profil" className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white shadow-card"
          style={{ backgroundColor: me.color || "#f26a21" }}>
          {initials(me.name)}
        </Link>
      </header>

      {/* Hero Greeting Header */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 flex items-center justify-between gap-6 relative overflow-hidden bg-gradient-to-r from-brand-500/10 via-white to-amber-500/5 border border-brand-200/60 shadow-sm">
        <div className="flex items-center gap-4 relative z-10 min-w-0">
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shrink-0">
            <GreetingIcon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-700 text-xs font-bold uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              {greeting}, {firstName}!
            </div>
            <h1 className="truncate text-2xl font-extrabold text-charcoal sm:text-3xl tracking-tight">
              Browns Personal Portal
            </h1>
            <p className="mt-0.5 text-xs font-medium text-gray-500 capitalize">{format(todayAnchor, "EEEE, dd. MMMM yyyy", { locale: de })}</p>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end gap-2 text-right relative z-10 shrink-0">
          <Link href="/portal/profil" className="spring-press flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-sm">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white shadow-xs" style={{ backgroundColor: me.color || "#c74806" }}>
              {initials(me.name)}
            </span>
            <span className="text-xs font-bold text-charcoal">{firstName}</span>
          </Link>
          <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-800 text-xs font-extrabold border border-emerald-500/30">
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Direkte Stempeluhr auf der Hauptseite */}
      <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" /> Live-Stempeluhr
          </h2>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            Echtzeit Erfassung
          </span>
        </div>
        <TimeTracker
          entries={(myEntries ?? []) as TimeEntry[]}
          employees={[me]}
          locationConfigured={false}
          lockedEmployeeId={me.id}
          hero={true}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {tiles.map(({ href, icon: Icon, title, value, tone, badge }) => (
              <Link key={title} href={href}
                className={`spring-press group relative min-h-[135px] overflow-hidden rounded-3xl p-5 shadow-xs transition-all hover:shadow-sm border border-white/40 ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-xs">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  {typeof badge === "number" && badge > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-black text-red-600 shadow-md">{badge}</span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">{title}</p>
                  <p className="mt-1 line-clamp-1 text-base font-extrabold text-white tracking-tight">{value}</p>
                </div>
                <span className="pointer-events-none absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-white/10 transition-transform group-hover:scale-150" />
              </Link>
            ))}
          </div>

          <div className="surface-card p-5 rounded-3xl border border-gray-200 shadow-xs bg-white">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  {format(todayAnchor, "MMMM", { locale: de })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {todaysShift
                    ? `Heute Schicht: ${todaysShift.start_time.slice(0, 5)} – ${todaysShift.end_time.slice(0, 5)} Uhr (${todaysShift.position})`
                    : "Keine kommende Schicht eingetragen"}
                </p>
              </div>
              <Link href="/portal/dienstplan" className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-700 hover:text-brand-800">
                Plan öffnen <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map(offset => {
                const dayDate = addDays(weekStartD, offset)
                const dateKey = format(dayDate, "yyyy-MM-dd")
                const isToday = dateKey === today
                const shiftForDay = (weekShiftsOwn ?? []).find((shift: { date: string }) => shift.date === dateKey)
                const isAbsent = shiftForDay?.status === "absent"

                return (
                  <div key={dateKey}
                    className={`flex flex-col items-center justify-between rounded-2xl p-2 sm:p-3 text-center transition-all border ${
                      isToday ? "bg-brand-600 text-white font-bold border-brand-600 shadow-sm" : shiftForDay ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-gray-50 text-gray-700 border-gray-100"
                    }`}>
                    <span className="text-[11px] font-bold uppercase opacity-80">{format(dayDate, "dd", { locale: de })}</span>
                    <span className="text-xs font-extrabold">{format(dayDate, "EEEEEE", { locale: de })}</span>
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isToday ? "#ffffff" : isAbsent ? "#ef4444" : shiftForDay ? "#f59e0b" : "transparent" }} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="surface-card p-5 rounded-3xl border border-gray-200 shadow-xs bg-white">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Gehalt &amp; Stunden</p>
              <p className="text-xs text-muted-foreground">Diese Woche</p>
              <div className="mt-4 flex items-center justify-center">
                <RingProgress progress={plannedH > 0 ? workedH / plannedH : 0}>
                  <span className="text-xl font-black text-gray-900">{workedH.toFixed(1)} h</span>
                  <span className="text-xs text-gray-500 font-semibold">ist</span>
                </RingProgress>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-gray-600 border-t border-gray-100 pt-3">
                <span>Gearbeitet: {formatHours(workedH)}</span>
                <span>Geplant: {formatHours(plannedH)}</span>
              </div>
            </div>

            <div className="surface-card p-5 rounded-3xl border border-gray-200 shadow-xs bg-white">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Offene Schichten</p>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <LifeBuoy className="h-4 w-4" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Vertretungen im Team</p>
              <div className="mt-4 space-y-2">
                {coverageCount > 0 ? (
                  <Link href="/portal/vertretung" className="block rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-900 hover:bg-amber-100 transition">
                    ⚠️ Es gibt {coverageCount} offene Vertretungsanfragen im Team. Klicke zum Übernehmen.
                  </Link>
                ) : (
                  <p className="text-xs text-gray-400 py-4 text-center">Aktuell keine offenen Vertretungen.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Rechte Spalte: Schnellzugriff & Team-Chat Preview */}
        <aside className="space-y-6">
          <div className="surface-card p-5 rounded-3xl border border-gray-200 shadow-xs bg-white">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">Schnellaktionen</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Link href="/portal/stempeln" className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-200 p-3 text-xs font-bold text-gray-800 hover:bg-brand-50 hover:border-brand-200 transition">
                <Clock className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Stempeln</span>
              </Link>
              <Link href="/portal/dienstplan" className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-200 p-3 text-xs font-bold text-gray-800 hover:bg-brand-50 hover:border-brand-200 transition">
                <Calendar className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Plan</span>
              </Link>
              <Link href="/portal/abwesenheit" className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-200 p-3 text-xs font-bold text-gray-800 hover:bg-brand-50 hover:border-brand-200 transition">
                <CalendarOff className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Abwesenheit</span>
              </Link>
              <Link href="/portal/vertretung" className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-200 p-3 text-xs font-bold text-gray-800 hover:bg-brand-50 hover:border-brand-200 transition">
                <LifeBuoy className="h-4 w-4 text-brand-600 shrink-0" />
                <span>Vertretung</span>
              </Link>
            </div>
          </div>

          <div className="surface-card p-5 rounded-3xl border border-gray-200 shadow-xs bg-white">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-brand-600" />
                Team-Chat
              </p>
              <Link href="/portal/chat" className="text-xs font-extrabold text-brand-700 hover:text-brand-800">
                Alle ansehen
              </Link>
            </div>

            <div className="space-y-2.5">
              {messages.length > 0 ? (
                messages.slice(0, 3).map(msg => (
                  <div key={msg.id} className="flex items-start gap-2.5 p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs"
                      style={{ backgroundColor: msg.employee?.color || "#f26a21" }}>
                      {initials(msg.employee?.name)}
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-bold text-gray-900">{msg.employee?.name || "Kollege"}</p>
                      <p className="text-gray-600 truncate mt-0.5">{msg.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">Noch keine Nachrichten.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
