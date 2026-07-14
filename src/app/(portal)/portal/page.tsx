import Link from "next/link"
import { Clock, Calendar, LifeBuoy, ArrowRight, CalendarOff, MessageSquare, Grid3X3, ThumbsUp, Euro, Hand, BriefcaseBusiness, UserRoundCheck } from "lucide-react"
import { createClient } from "@/lib/supabase-server"
import { getCurrentStaff } from "@/lib/staff"
import { entryHours, shiftHours, formatHours, formatEuro } from "@/lib/hours"
import { formatDayLabel } from "@/lib/coverage"
import LiveRefresh from "@/components/realtime/LiveRefresh"
import RingProgress from "@/components/charts/RingProgress"
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth } from "date-fns"
import { de } from "date-fns/locale"
import type { Shift } from "@/types"

type ChatMsg = { id: string; content: string; created_at: string; type: string; employee_id: string | null; employee?: { name?: string; color?: string } | null }
type Abs = { id: string; type: string; start_date: string; status: string }
type PrivatePay = { hourly_wage?: number | null }

const initials = (name?: string) => (name ?? "?").split(" ").map(n => n[0]).join("").slice(0, 2)

export default async function PortalHome() {
  const staff = await getCurrentStaff()
  if (!staff?.employee) return null
  const me = staff.employee
  const supabase = await createClient()
  const TZ = "Europe/Berlin"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ })
  const todayAnchor = new Date(today + "T12:00:00")
  const weekStartD = startOfWeek(todayAnchor, { weekStartsOn: 1 })
  const weekStart = format(weekStartD, "yyyy-MM-dd")
  const weekEnd = format(endOfWeek(todayAnchor, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const monthStart = format(startOfMonth(todayAnchor), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(todayAnchor), "yyyy-MM-dd")
  const hour = Number(new Date().toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", hour12: false }))
  const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Hallo" : "Guten Abend"

  const [{ data: nextShifts }, { data: weekEntries }, { data: weekShiftsOwn }, { data: openCoverage }, { data: chat }, { data: myAbs }, { data: monthEntries }, { data: pay }] = await Promise.all([
    supabase.from("shifts").select("*").eq("employee_id", me.id).neq("status", "absent").gte("date", today).order("date").order("start_time").limit(3),
    supabase.from("time_entries").select("clock_in,clock_out,break_minutes").eq("employee_id", me.id).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("shifts").select("date,start_time,end_time,position,status").eq("employee_id", me.id).neq("status", "absent").gte("date", weekStart).lte("date", weekEnd).order("start_time"),
    supabase.from("coverage_requests").select("id").eq("status", "open"),
    supabase.from("messages").select("id,content,created_at,type,employee_id,employee:employees(name,color)").eq("type", "chat").order("created_at", { ascending: false }).limit(4),
    supabase.from("absences").select("id,type,start_date,status").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("time_entries").select("clock_in,clock_out,break_minutes").eq("employee_id", me.id).gte("date", monthStart).lte("date", monthEnd),
    supabase.from("employee_private").select("hourly_wage").eq("employee_id", me.id).maybeSingle(),
  ])

  const shifts = (nextShifts ?? []) as Shift[]
  const next = shifts[0]
  const coverageCount = openCoverage?.length ?? 0
  const messages = ((chat ?? []) as ChatMsg[]).reverse() // ältere oben, neueste unten
  const absences = (myAbs ?? []) as Abs[]
  const pendingAbs = absences.filter(a => a.status === "pending")
  const todaysShift = shifts.find(s => s.date === today)
  const needsConfirm = shifts.filter(s => s.status === "scheduled").length

  // Wochenbilanz: gearbeitet (Stempeluhr) vs. geplant (Schichten)
  const worked = (weekEntries ?? []).reduce((s, e) => s + entryHours(e), 0)
  const weekOwn = (weekShiftsOwn ?? []) as { date: string; start_time: string; end_time: string; position: string }[]
  const planned = weekOwn.reduce((s, sh) => s + shiftHours(sh), 0)
  const progress = planned > 0 ? worked / planned : 0
  const monthWorked = (monthEntries ?? []).reduce((s, e) => s + entryHours(e), 0)
  const hourlyWage = ((pay ?? {}) as PrivatePay).hourly_wage ?? null
  const monthPay = hourlyWage ? monthWorked * hourlyWage : null

  // 7-Tage-Streifen mit eigenen Schichten
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStartD, i)
    const ds = format(d, "yyyy-MM-dd")
    return {
      ds,
      label: format(d, "EE", { locale: de }).slice(0, 2),
      dayNum: format(d, "d"),
      isToday: ds === today,
      shifts: weekOwn.filter(s => s.date === ds),
    }
  })
  const firstName = me.name.split(" ")[0]
  const primaryShift = todaysShift ?? next
  const nextShiftLabel = next ? `${formatDayLabel(next.date)} · ${next.start_time.slice(0, 5)}-${next.end_time.slice(0, 5)}` : "Keine Schicht geplant"
  const statusLabel = me.employment_type || me.position || "Aktiv"
  const tiles = [
    {
      href: "/portal/stempeln",
      icon: BriefcaseBusiness,
      title: "Nächster Einsatz:",
      value: nextShiftLabel,
      tone: "bg-[#bd6423] text-white",
    },
    {
      href: "/portal/vertretung",
      icon: Grid3X3,
      title: "Ungelesene Jobangebote:",
      value: `${coverageCount} ${coverageCount === 1 ? "Aktion" : "Aktionen"}`,
      tone: "bg-[#b85a75] text-white",
      badge: coverageCount,
    },
    {
      href: "/portal/dienstplan",
      icon: ThumbsUp,
      title: "Einsatzplan:",
      value: `${needsConfirm} ${needsConfirm === 1 ? "KAV offen" : "KAV offen"}`,
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
    <div className="min-h-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <LiveRefresh tables={["messages", "shifts", "coverage_requests", "absences", "time_entries"]} />
      <header className="mb-6 flex items-center justify-between gap-4 lg:hidden">
        <Link href="/portal/stempeln" className="text-charcoal-light">
          <Clock className="h-5 w-5" />
        </Link>
        <p className="text-sm font-extrabold text-charcoal">Start</p>
        <Link href="/portal/profil" className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white shadow-card"
          style={{ backgroundColor: me.color || "#f26a21" }}>
          {initials(me.name)}
        </Link>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <Link href="/portal/profil" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white text-2xl font-black text-white shadow-card-lg sm:h-24 sm:w-24"
              style={{ backgroundColor: me.color || "#f26a21" }}>
              {initials(me.name)}
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase text-brand-600">{greeting}</p>
              <h1 className="truncate text-[34px] leading-tight text-charcoal sm:text-5xl">
                Hallo {firstName}
              </h1>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{format(todayAnchor, "EEEE, dd. MMMM yyyy", { locale: de })}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {tiles.map(({ href, icon: Icon, title, value, tone, badge }) => (
              <Link key={title} href={href}
                className={`card-3d group relative min-h-[128px] overflow-hidden rounded-[1.35rem] p-4 transition hover:-translate-y-0.5 hover:shadow-float sm:min-h-[150px] ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-8 w-8 text-white/88 sm:h-9 sm:w-9" />
                  {typeof badge === "number" && badge > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-black text-[#b74f4f] shadow-card">{badge}</span>
                  )}
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <p className="text-sm font-extrabold leading-tight">{title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/88">{value}</p>
                </div>
                <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10 transition group-hover:scale-125" />
              </Link>
            ))}
          </div>

          <div className="surface-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold uppercase text-charcoal">{format(todayAnchor, "MMMM", { locale: de })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {next ? `Nächste Schicht ${formatDayLabel(next.date)} um ${next.start_time.slice(0, 5)} Uhr` : "Keine kommende Schicht eingetragen"}
                </p>
              </div>
              <Link href="/portal/dienstplan" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Plan öffnen</Link>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {strip.map(d => (
                <div key={d.ds}
                  className={`min-h-[72px] rounded-2xl px-2 py-2 text-center transition ${d.isToday ? "bg-brand-500 text-white shadow-card" : d.shifts.length > 0 ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-muted-foreground"}`}>
                  <p className="text-sm font-bold leading-none">{d.dayNum}</p>
                  <p className="mt-1 text-xs font-semibold">{d.label}</p>
                  <div className="mt-2 flex justify-center gap-1">
                    {d.shifts.length > 0 ? d.shifts.slice(0, 2).map((_, i) => (
                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${d.isToday ? "bg-white" : "bg-brand-500"}`} />
                    )) : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-extrabold uppercase text-charcoal">Gehalt & Stunden</p>
                  <p className="mt-1 text-xs text-muted-foreground">Diese Woche</p>
                </div>
                <RingProgress progress={progress} className="scale-75">
                  <p className="stat-number text-lg text-charcoal leading-none">{formatHours(worked)}</p>
                  <p className="text-[10px] text-muted-foreground">Ist</p>
                </RingProgress>
              </div>
              <div className="grid grid-cols-8 gap-2">
                {Array.from({ length: 40 }, (_, i) => (
                  <span key={i} className={`h-3 w-3 rounded-full ${i < Math.round(Math.min(progress, 1) * 40) ? "bg-brand-500" : "bg-gray-100"}`} />
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {formatHours(worked)} gearbeitet von {formatHours(planned)} geplant.
              </p>
            </div>

            <Link href="/portal/vertretung" className="surface-card flex flex-col justify-between overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-card-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-extrabold uppercase text-charcoal">Offene Schichten</p>
                  <p className="mt-1 text-xs text-muted-foreground">Vertretungen im Team</p>
                </div>
                <LifeBuoy className="h-5 w-5 text-brand-500" />
              </div>
              <div className="mt-7">
                <p className="stat-number text-5xl text-charcoal">{coverageCount}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {coverageCount === 1 ? "Eine Schicht sucht Unterstützung." : "Schichten suchen Unterstützung."}
                </p>
              </div>
            </Link>
          </div>
        </section>

        <aside className="space-y-4">
          {needsConfirm > 0 && (
            <Link href="/portal/dienstplan" className="floating-card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[7px] border-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight text-charcoal">Hallo {firstName},</p>
                <p className="text-sm text-muted-foreground">{needsConfirm} {needsConfirm === 1 ? "Schicht wartet" : "Schichten warten"} auf deine Bestätigung.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-brand-500" />
            </Link>
          )}

          {coverageCount > 0 && (
            <Link href="/portal/vertretung" className="floating-card block p-5 transition hover:-translate-y-0.5">
              <div className="mb-5 flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[7px] border-brand-500" />
                <div>
                  <p className="text-lg font-bold leading-tight text-charcoal">Hallo Team,</p>
                  <p className="text-sm text-muted-foreground">Es gibt offene Vertretungen. Bitte prüfe, ob du einspringen kannst.</p>
                </div>
              </div>
              {primaryShift && (
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Deine Schicht</p>
                  <p className="mt-2 text-xl font-bold text-charcoal">{primaryShift.position}</p>
                  <p className="text-sm text-muted-foreground">{formatDayLabel(primaryShift.date)} - {primaryShift.start_time.slice(0, 5)} - {primaryShift.end_time.slice(0, 5)}</p>
                </div>
              )}
            </Link>
          )}

          {pendingAbs.map(a => (
            <div key={a.id} className="surface-card flex items-center gap-3 p-4">
              <CalendarOff className="h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Dein Antrag ({a.type}, ab {formatDayLabel(a.start_date)}) wird noch geprüft.</p>
            </div>
          ))}

          <div className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-charcoal">Team-Chat</h2>
              </div>
              <Link href="/portal/chat" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Alle ansehen</Link>
            </div>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Nachrichten im Team-Chat.</p>
            ) : (
              <div className="space-y-3">
                {messages.map(m => (
                  <Link key={m.id} href="/portal/chat" className="flex items-start gap-3 rounded-2xl p-2 transition hover:bg-gray-50">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: m.employee?.color ?? "#4a8df7" }}>
                      {initials(m.employee?.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-muted-foreground">
                        <span className="font-semibold text-charcoal">{m.employee?.name?.split(" ")[0] ?? "Team"}:</span> {m.content}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/portal/stempeln", icon: Clock, label: "Stempeln" },
              { href: "/portal/dienstplan", icon: Calendar, label: "Plan" },
              { href: "/portal/abwesenheit", icon: CalendarOff, label: "Abwesenheit" },
              { href: "/portal/vertretung", icon: LifeBuoy, label: "Vertretung" },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}
                className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-lg">
                <Icon className="h-5 w-5 text-muted-foreground transition group-hover:text-brand-600" />
                <span className="text-sm font-semibold text-charcoal">{label}</span>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
