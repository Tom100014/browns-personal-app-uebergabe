"use client"

import { useState, useEffect } from "react"
import { Sun, AlertTriangle, Users, Calendar, CheckCircle2, X, Sparkles, ChevronRight, RefreshCw, ShieldAlert, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface BriefingProps {
  userName?: string
  weather?: { city: string; tmax: number; rain: number; hint: string }
  openShiftsCount?: number
  unbookedCount?: number
  pendingAbsencesCount?: number
  pendingCoverageCount?: number
}

export default function DailyMorningBriefing({
  userName = "Leitung",
  weather,
  openShiftsCount = 0,
  unbookedCount = 0,
  pendingAbsencesCount = 0,
  pendingCoverageCount = 0,
}: BriefingProps) {
  const [isOpen, setIsOpen] = useState(false)
  const todayStr = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
  const todayISO = new Date().toISOString().split("T")[0]

  useEffect(() => {
    // Show automatically once per morning
    const lastSeen = localStorage.getItem("browns_daily_briefing_date")
    if (lastSeen !== todayISO) {
      setIsOpen(true)
    }
  }, [todayISO])

  const dismiss = () => {
    localStorage.setItem("browns_daily_briefing_date", todayISO)
    setIsOpen(false)
  }

  const hasAlarms = openShiftsCount > 0 || unbookedCount > 0 || pendingAbsencesCount > 0 || pendingCoverageCount > 0

  return (
    <>
      {/* Daily Banner Bar on Dashboard */}
      <div className="relative overflow-hidden rounded-3xl border border-brand-200/80 bg-gradient-to-r from-brand-900 via-brand-850 to-brand-950 p-5 sm:p-6 text-white shadow-xl mb-6">
        {/* Photorealistic Hero Gradient Glow */}
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide backdrop-blur-md text-amber-300 border border-white/10">
              <Sun className="h-3.5 w-3.5 animate-spin-slow text-amber-400" />
              <span>Tages-Briefing · {todayStr}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Guten Morgen, {userName}! ☕
            </h2>
            <p className="text-xs sm:text-sm text-brand-100/90 leading-relaxed max-w-2xl">
              Hier ist dein automatischer Tages-Check für Browns Nürnberg: Weather-Outlook, Personal-Auslastung und kritische Warnungen auf einen Blick.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0">
            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-brand-950 px-4 py-2.5 text-xs font-black shadow-lg transition active:scale-95"
            >
              <Sparkles className="h-4 w-4" /> Briefing-Details öffnen
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="relative z-10 mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 border-t border-white/10 pt-4">
          <div className="rounded-2xl bg-white/5 p-3 backdrop-blur-xs border border-white/5">
            <span className="text-[10px] uppercase font-bold text-brand-200">Wetter &amp; Terrasse</span>
            <p className="text-sm font-black text-white mt-0.5">
              {weather ? `${weather.tmax}°C · ${weather.rain}% Regen` : "Standort aktiv"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3 backdrop-blur-xs border border-white/5">
            <span className="text-[10px] uppercase font-bold text-brand-200">Unbesetzte Schichten</span>
            <p className={cn("text-sm font-black mt-0.5", openShiftsCount > 0 ? "text-amber-400" : "text-emerald-400")}>
              {openShiftsCount > 0 ? `${openShiftsCount} unbesetzt ⚠️` : "Alle besetzt ✓"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3 backdrop-blur-xs border border-white/5">
            <span className="text-[10px] uppercase font-bold text-brand-200">Nicht eingestempelt</span>
            <p className={cn("text-sm font-black mt-0.5", unbookedCount > 0 ? "text-rose-400" : "text-emerald-400")}>
              {unbookedCount > 0 ? `${unbookedCount} ausstehend` : "Alle pünktlich ✓"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3 backdrop-blur-xs border border-white/5">
            <span className="text-[10px] uppercase font-bold text-brand-200">Offene Anträge</span>
            <p className={cn("text-sm font-black mt-0.5", (pendingAbsencesCount + pendingCoverageCount) > 0 ? "text-amber-300" : "text-emerald-400")}>
              {pendingAbsencesCount + pendingCoverageCount} Ausstehend
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Morning Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-brand-950 px-6 py-6 text-white relative">
              <button
                onClick={dismiss}
                className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-400/30 mb-2">
                <Sun className="h-3.5 w-3.5 text-amber-400" /> Tages-Briefing fürleitung
              </div>
              <h3 className="text-2xl font-black text-white">Browns Morgen-Report ☀️</h3>
              <p className="text-xs text-brand-200 mt-1">{todayStr}</p>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Weather Recommendation Box */}
              {weather && (
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 border border-amber-200/80">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-500 text-white p-2.5 shadow-md">
                      <Sun className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-950">Wetter &amp; Terrassen-Prognose</h4>
                      <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                        Heute max. <strong>{weather.tmax}°C</strong> in Nürnberg ({weather.rain}% Regenwahrscheinlichkeit).  
                        <br />
                        <span className="font-semibold text-amber-950">Empfehlung:</span> {weather.hint}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Alarms Section */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">System- &amp; Personal-Status</h4>

                {openShiftsCount > 0 ? (
                  <div className="flex items-center justify-between rounded-2xl bg-rose-50 p-3.5 border border-rose-200 text-rose-900">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold">{openShiftsCount} unbesetzte Schichten im Dienstplan!</p>
                        <p className="text-xs text-rose-700">Dienstplan prüfen und Vertretung zuweisen.</p>
                      </div>
                    </div>
                    <Link href="/dienstplan" onClick={dismiss} className="rounded-xl bg-rose-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-rose-700 transition">
                      Dienstplan
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3.5 border border-emerald-200 text-emerald-900">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <p className="text-xs font-semibold">Alle Schichten für heute sind vollständig besetzt.</p>
                  </div>
                )}

                {unbookedCount > 0 && (
                  <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-amber-900">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold">{unbookedCount} Mitarbeiter noch nicht eingestempelt</p>
                        <p className="text-xs text-amber-700">Schichten prüfen oder Zeiterfassung anpassen.</p>
                      </div>
                    </div>
                    <Link href="/zeiterfassung" onClick={dismiss} className="rounded-xl bg-amber-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-amber-700 transition">
                      Zeiterfassung
                    </Link>
                  </div>
                )}

                {(pendingAbsencesCount > 0 || pendingCoverageCount > 0) && (
                  <div className="flex items-center justify-between rounded-2xl bg-sky-50 p-3.5 border border-sky-200 text-sky-900">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-sky-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold">{pendingAbsencesCount} Urlaubsanträge / {pendingCoverageCount} Vertretungsfragen offen</p>
                        <p className="text-xs text-sky-700">Erfordert Freigabe durch die Betriebsleitung.</p>
                      </div>
                    </div>
                    <Link href="/abwesenheiten" onClick={dismiss} className="rounded-xl bg-sky-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-sky-700 transition">
                      Anträge
                    </Link>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                <Link
                  href="/belegung"
                  onClick={dismiss}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700"
                >
                  Prognosen &amp; Events anzeigen <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={dismiss}
                  className="rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 text-xs font-bold shadow-md transition"
                >
                  Tages-Briefing beenden ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
