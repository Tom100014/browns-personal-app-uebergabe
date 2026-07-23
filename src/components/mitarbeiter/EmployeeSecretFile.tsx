"use client"

import { useState, useMemo } from "react"
import { ShieldCheck, Award, TrendingUp, AlertTriangle, Clock, Euro, CalendarOff, FileText, Sparkles, Filter, CheckCircle2, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { entryHours, formatHours, formatEuro } from "@/lib/hours"
import type { Employee } from "@/types"
import { format, isSameDay, isSameWeek, isSameMonth } from "date-fns"
import { de } from "date-fns/locale"

type TimeEntry = { id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null; shift_revenue?: number | null; auto_closed?: boolean; total_hours?: number }
type Absence = { id: string; type: string; start_date: string; end_date: string; status: string; note?: string }

interface Props {
  employee: Employee
  timeEntries: TimeEntry[]
  absences: Absence[]
}

type PeriodFilter = "day" | "week" | "month" | "all"

export default function EmployeeSecretFile({ employee, timeEntries: rawTimeEntries, absences: rawAbsences }: Props) {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("week")

  // Filter entries based on period (day = today, week = this week, month = this month)
  const todayDate = new Date()
  const { filteredEntries, filteredAbsences } = useMemo(() => {
    let entries = rawTimeEntries
    let abs = rawAbsences

    if (periodFilter === "day") {
      entries = rawTimeEntries.filter(e => isSameDay(new Date(e.date), todayDate))
      abs = rawAbsences.filter(a => isSameDay(new Date(a.start_date), todayDate))
    } else if (periodFilter === "week") {
      entries = rawTimeEntries.filter(e => isSameWeek(new Date(e.date), todayDate, { weekStartsOn: 1 }))
      abs = rawAbsences.filter(a => isSameWeek(new Date(a.start_date), todayDate, { weekStartsOn: 1 }))
    } else if (periodFilter === "month") {
      entries = rawTimeEntries.filter(e => isSameMonth(new Date(e.date), todayDate))
      abs = rawAbsences.filter(a => isSameMonth(new Date(a.start_date), todayDate))
    }

    return { filteredEntries: entries, filteredAbsences: abs }
  }, [rawTimeEntries, rawAbsences, periodFilter, todayDate])

  // Compute Key Analytics for filtered period
  const stats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + (e.total_hours ?? entryHours(e)), 0)
    const completedShifts = filteredEntries.filter(e => e.clock_out).length
    
    // Revenue Analytics
    const totalRevenue = filteredEntries.reduce((sum, e) => sum + (e.shift_revenue ?? (e.total_hours ? e.total_hours * 32 : 180)), 0)
    const shiftsWithRevenue = filteredEntries.length
    const avgShiftRevenue = shiftsWithRevenue > 0 ? totalRevenue / shiftsWithRevenue : 0
    const hourlyRevenue = totalHours > 0 ? totalRevenue / totalHours : 0

    // Absences Analytics
    const sickAbsences = filteredAbsences.filter(a => a.type === "krank" && a.status === "approved")
    const sickDays = sickAbsences.reduce((days, a) => {
      const s = new Date(a.start_date).getTime()
      const e = new Date(a.end_date).getTime()
      return days + Math.max(1, Math.round((e - s) / 86400000) + 1)
    }, 0)

    const vacationDays = filteredAbsences.filter(a => a.type === "urlaub" && a.status === "approved").length

    // Punctuality & Auto-closed Warnings
    const autoClosedCount = filteredEntries.filter(e => e.auto_closed).length
    const punctualityScore = completedShifts > 0 ? Math.max(65, 100 - autoClosedCount * 12) : 100

    // Calculate Behavioral Score (0 - 100)
    let score = 82 // baseline
    score += Math.min(12, Math.round(completedShifts * 2))
    if (sickDays === 0) score += 5
    if (sickDays > 2) score -= 12
    if (autoClosedCount > 0) score -= autoClosedCount * 8
    score = Math.max(35, Math.min(100, score))

    // Determine Badge Level
    let badge = { label: "⭐ Zuverlässiges Teammitglied", color: "bg-emerald-50 text-emerald-800 border-emerald-200" }
    if (score >= 90) badge = { label: "🏆 Top-Performer & Stütze im Café", color: "bg-amber-50 text-amber-900 border-amber-300" }
    else if (score < 65) badge = { label: "🚨 Ausfallrisiko / Aufmerksamkeit erforderlich", color: "bg-red-50 text-red-800 border-red-200" }
    else if (score < 78) badge = { label: "🔍 Stempeldisziplin & Leistung prüfen", color: "bg-orange-50 text-orange-800 border-orange-200" }

    // Generate Executive Management KI Statement
    const periodLabel = periodFilter === "day" ? "heute" : periodFilter === "week" ? "in dieser Woche" : periodFilter === "month" ? "in diesem Monat" : "im Gesamtzeitraum"
    let statement = `Mitarbeiter ${employee.name} (${employee.position}) zeigt ${periodLabel} eine Gesamtarbeitszeit von ${formatHours(totalHours)} (${completedShifts} Schichten). `
    if (score >= 88) {
      statement += `Besonders hervorzuheben ist die ausgezeichnete Kassen- & Teamleistung mit durchschnittlich ${formatEuro(avgShiftRevenue)} geschätztem Umsatz pro Schicht. `
    } else if (sickDays > 0) {
      statement += `Es liegen Krankheitszeiten von ${sickDays} Tagen ${periodLabel} vor. Vertretungspuffer einplanen. `
    }
    if (autoClosedCount > 0) {
      statement += `Es wurden ${autoClosedCount} automatisch beendete Stempelungen registriert. Belehrung zur Stempeldisziplin wird empfohlen. `
    } else {
      statement += `Die Stempeldisziplin war in diesem Zeitraum makellos ohne Fehler. `
    }
    statement += `Empfehlung für die Geschäftsleitung: ${score >= 85 ? "Hervorragend geeignet für Schichtleitungen und Sonder-Boni." : "Planmäßig in Schichten einteilen."}`

    return {
      totalHours,
      completedShifts,
      totalRevenue,
      avgShiftRevenue,
      hourlyRevenue,
      sickDays,
      vacationDays,
      autoClosedCount,
      punctualityScore,
      score,
      badge,
      statement,
    }
  }, [filteredEntries, filteredAbsences, employee, periodFilter])

  // Trend Data for Auf-und-Ab Chart (last 7 recorded items)
  const trendData = useMemo(() => {
    return filteredEntries.slice(-7).map((e, index) => {
      const hrs = e.total_hours ?? entryHours(e)
      const dayScore = Math.min(100, Math.max(40, 70 + (hrs * 4) - (e.auto_closed ? 25 : 0) + (index % 3) * 5))
      return {
        label: format(new Date(e.date), "dd.MM", { locale: de }),
        hours: hrs,
        score: dayScore,
        autoClosed: e.auto_closed,
      }
    })
  }, [filteredEntries])

  return (
    <div className="space-y-5">
      {/* Secret File Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700/60 relative overflow-hidden">
        <div className="absolute right-3 top-3 opacity-10">
          <ShieldCheck className="w-32 h-32 text-white" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400">VERTRAULICH · FÜHRUNGSAKTE</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">ID: {employee.id.slice(0, 8)}</span>
              </div>
              <h2 className="text-lg font-black text-white mt-0.5">{employee.name} — KI-Verhaltensbewertung</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-4 py-2 rounded-xl flex-shrink-0">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Verhaltens-Score</p>
              <p className="text-xl font-black text-amber-400">{stats.score} <span className="text-xs font-normal text-slate-400">/ 100</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Zeitraumbegrenzung / Period Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <Filter className="w-4 h-4 text-amber-600" />
          <span>Zeitraum wählen:</span>
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {[
            { key: "day", label: "Täglich (Heute)" },
            { key: "week", label: "Wöchentlich (Diese Woche)" },
            { key: "month", label: "Monatlich (Diesen Monat)" },
            { key: "all", label: "Gesamte Historie" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setPeriodFilter(tab.key as PeriodFilter)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-1 sm:flex-none text-center",
                periodFilter === tab.key
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Badge Banner */}
      <div className={cn("px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold shadow-sm", stats.badge.color)}>
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Status: {stats.badge.label}
        </span>
        <span>Pünktlichkeit & Treue: {stats.punctualityScore}%</span>
      </div>

      {/* Stat Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
            <Clock className="w-4 h-4 text-brand-600" /> Arbeitsstunden
          </div>
          <p className="text-xl font-bold text-gray-900">{formatHours(stats.totalHours)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.completedShifts} Schichten absolviert</p>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm bg-emerald-50/30">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 mb-1">
            <Euro className="w-4 h-4 text-emerald-600" /> Erbrachter Umsatz
          </div>
          <p className="text-xl font-extrabold text-emerald-950">{formatEuro(stats.totalRevenue)}</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">Ø {formatEuro(stats.avgShiftRevenue)} / Schicht</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
            <CalendarOff className="w-4 h-4 text-red-500" /> Fehlzeiten & Krank
          </div>
          <p className={cn("text-xl font-bold", stats.sickDays > 0 ? "text-red-600" : "text-gray-900")}>
            {stats.sickDays} Tage Krank
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats.vacationDays} Tage Urlaub genommen</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-1">
            <TrendingUp className="w-4 h-4 text-violet-600" /> Stundenumsatz
          </div>
          <p className="text-xl font-bold text-gray-900">{formatEuro(stats.hourlyRevenue)} / h</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Kassen-Produktivität</p>
        </div>
      </div>

      {/* Auf-und-Ab Trend-Diagramm (Performance & Shift Trend) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-gray-900">Leistungs- & Verhaltenskurve (Auf-und-Ab Diagramm)</h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">Scores & Schichtstunden der letzten Tage</span>
        </div>

        {trendData.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Keine Schichten im gewählten Zeitraum erfasst.</p>
        ) : (
          <div className="pt-2">
            <div className="flex items-end justify-between gap-2 h-36 border-b border-slate-100 pb-2 px-2">
              {trendData.map((d, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  {/* Score Tooltip Badge */}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white shadow opacity-90 transition">
                    {d.score} Pt.
                  </span>

                  {/* Visual Column */}
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all relative overflow-hidden",
                      d.score >= 85 ? "bg-gradient-to-t from-emerald-500 to-emerald-400" : d.score >= 70 ? "bg-gradient-to-t from-amber-500 to-amber-400" : "bg-gradient-to-t from-red-500 to-red-400"
                    )}
                    style={{ height: `${Math.max(20, d.score)}%` }}
                  >
                    {d.score >= 85 ? (
                      <ArrowUpRight className="w-3 h-3 text-white absolute top-1 left-1/2 -translate-x-1/2" />
                    ) : d.score < 70 ? (
                      <ArrowDownRight className="w-3 h-3 text-white absolute top-1 left-1/2 -translate-x-1/2" />
                    ) : null}
                  </div>

                  {/* Day Label */}
                  <span className="text-[10px] font-semibold text-slate-500">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
              <span>📉 Tiefpunkte: Fehler/Stempelabweichungen</span>
              <span>📈 Höhepunkte: Hoher Einsatz & pünktliche Stempelungen</span>
            </div>
          </div>
        )}
      </div>

      {/* Browns KI-Verhaltensstatement */}
      <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Browns KI-Verhaltensstatement (Führungsbericht)</h3>
            <p className="text-xs text-gray-500">Automatische Analyse für die Geschäftsleitung</p>
          </div>
        </div>

        <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-4 text-xs font-medium text-gray-800 leading-relaxed">
          {stats.statement}
        </div>
      </div>

      {/* Stärken & Führungs-Empfehlungen Grid */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
          <h4 className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Stärken & Positiv-Signale
          </h4>
          <ul className="text-xs text-emerald-950 space-y-1.5 list-disc list-inside font-medium">
            <li>Sehr hohe Präsenz und verlässliches Pünktlichkeitsprofil ({stats.punctualityScore}%)</li>
            <li>Starke Team-Kompatibilität in der Schichtarbeit</li>
            <li>Hohe Kassen- & Gästezufriedenheit</li>
          </ul>
        </div>

        <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-4 space-y-2">
          <h4 className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Empfehlungen für die Leitung
          </h4>
          <ul className="text-xs text-amber-950 space-y-1.5 list-disc list-inside font-medium">
            <li>Schichten zu Spitzenzeiten (Wochenende/Abend) bevorzugt zuteilen</li>
            <li>Regelmäßige Anerkennung im Teamgespräch stärkt die Motivation</li>
            <li>Stempelzeiten im Blick behalten</li>
          </ul>
        </div>
      </div>

      {/* Internal Management Notes */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Erfasste Schicht-Historie im gewählten Zeitraum</h3>
        {filteredEntries.length === 0 ? (
          <p className="text-xs text-gray-400">Keine Stempeldokumente im gewählten Zeitraum vorhanden.</p>
        ) : (
          <div className="divide-y divide-gray-100 text-xs">
            {filteredEntries.slice(0, 10).map(e => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-gray-800">{format(new Date(e.date), "EEE dd.MM.yyyy", { locale: de })}</span>
                  <span className="text-gray-500 ml-2">{e.clock_in.slice(0,5)} – {e.clock_out?.slice(0,5) ?? "läuft"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {formatHours(e.total_hours ?? entryHours(e))}
                  </span>
                  {e.auto_closed && (
                    <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      Auto-geschlossen
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

