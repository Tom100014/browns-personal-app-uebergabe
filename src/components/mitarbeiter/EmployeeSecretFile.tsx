"use client"

import { useMemo } from "react"
import { ShieldCheck, Award, TrendingUp, AlertTriangle, Clock, MessageSquare, Euro, CalendarOff, LifeBuoy, CheckCircle2, FileText, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { entryHours, formatHours, formatEuro } from "@/lib/hours"
import type { Employee } from "@/types"
import { format } from "date-fns"
import { de } from "date-fns/locale"

type TimeEntry = { id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null; shift_revenue?: number | null; auto_closed?: boolean }
type Absence = { id: string; type: string; start_date: string; end_date: string; status: string; note?: string }

interface Props {
  employee: Employee
  timeEntries: TimeEntry[]
  absences: Absence[]
}

export default function EmployeeSecretFile({ employee, timeEntries, absences }: Props) {
  // Compute Key Analytics
  const stats = useMemo(() => {
    const totalHours = timeEntries.reduce((sum, e) => sum + entryHours(e), 0)
    const completedShifts = timeEntries.filter(e => e.clock_out).length
    
    // Revenue Analytics
    const totalRevenue = timeEntries.reduce((sum, e) => sum + (e.shift_revenue ?? 0), 0)
    const shiftsWithRevenue = timeEntries.filter(e => e.shift_revenue != null && e.shift_revenue > 0).length
    const avgShiftRevenue = shiftsWithRevenue > 0 ? totalRevenue / shiftsWithRevenue : 0
    const hourlyRevenue = totalHours > 0 ? totalRevenue / totalHours : 0

    // Absences Analytics
    const sickAbsences = absences.filter(a => a.type === "krank" && a.status === "approved")
    const sickDays = sickAbsences.reduce((days, a) => {
      const s = new Date(a.start_date).getTime()
      const e = new Date(a.end_date).getTime()
      return days + Math.max(1, Math.round((e - s) / 86400000) + 1)
    }, 0)

    const vacationDays = absences.filter(a => a.type === "urlaub" && a.status === "approved").length

    // Punctuality & Auto-closed Warnings
    const autoClosedCount = timeEntries.filter(e => e.auto_closed).length
    const punctualityScore = completedShifts > 0 ? Math.max(60, 100 - autoClosedCount * 10) : 100

    // Calculate Behavioral Score (0 - 100)
    let score = 80 // baseline
    score += Math.min(15, Math.round(shiftsWithRevenue * 1.5))
    if (sickDays === 0) score += 5
    if (sickDays > 5) score -= 15
    if (autoClosedCount > 0) score -= autoClosedCount * 8
    score = Math.max(30, Math.min(100, score))

    // Determine Badge Level
    let badge = { label: "⭐ Zuverlässiges Teammitglied", color: "bg-emerald-50 text-emerald-800 border-emerald-200" }
    if (score >= 90) badge = { label: "🏆 Top-Performer & Stütze im Café", color: "bg-amber-50 text-amber-900 border-amber-300" }
    else if (score < 65) badge = { label: "🚨 Ausfallrisiko / Aufmerksamkeit erforderlich", color: "bg-red-50 text-red-800 border-red-200" }
    else if (score < 78) badge = { label: "🔍 Stempeldisziplin & Leistung prüfen", color: "bg-orange-50 text-orange-800 border-orange-200" }

    // Generate Executive Management KI Statement
    let statement = `Mitarbeiter ${employee.name} (${employee.position}) zeigt in den erfassten Daten eine solide Präsenz. `
    if (score >= 88) {
      statement += `Besonders hervorzuheben ist die ausgezeichnete Umsatzleistung von durchschnittlich ${formatEuro(avgShiftRevenue)} pro Schicht sowie die hohe Zuverlässigkeit. `
    } else if (sickDays > 3) {
      statement += `Es liegen Krankheitszeiten von insgesamt ${sickDays} Tagen vor. Bei der Dienstplanung sollten ausreichend Vertretungs-Puffer vorgesehen werden. `
    }
    if (autoClosedCount > 0) {
      statement += `Es wurden ${autoClosedCount} automatisch beendete Stempelungen registriert. Eine kurze Belehrung zur Stempeldisziplin wird empfohlen. `
    } else {
      statement += `Die Stempeldisziplin ist makellos ohne unentschuldigte Abbeschlüsse. `
    }
    statement += `Empfehlung für die Geschäftsleitung: ${score >= 85 ? "Hervorragend geeignet für Schichtleitungen und Prämierungen." : "Normal weiter einplanen."}`

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
  }, [timeEntries, absences, employee])

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

      {/* Internal Management Notes */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Erfasste Schicht-Notizen & Stempel-Historie</h3>
        {timeEntries.length === 0 ? (
          <p className="text-xs text-gray-400">Keine Stempeldokumente vorhanden.</p>
        ) : (
          <div className="divide-y divide-gray-100 text-xs">
            {timeEntries.slice(0, 10).map(e => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-gray-800">{format(new Date(e.date), "EEE dd.MM.yyyy", { locale: de })}</span>
                  <span className="text-gray-500 ml-2">{e.clock_in.slice(0,5)} – {e.clock_out?.slice(0,5) ?? "läuft"}</span>
                </div>
                {e.shift_revenue != null && e.shift_revenue > 0 ? (
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    💶 {formatEuro(e.shift_revenue)}
                  </span>
                ) : (
                  <span className="text-gray-400">Kein Umsatz eingetragen</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
