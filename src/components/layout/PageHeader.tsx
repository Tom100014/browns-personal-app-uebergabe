"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Clock } from "lucide-react"
import Logo from "@/components/brand/Logo"

/**
 * Feststehende Kopfleiste mit Original Browns Logo, Live-Uhrzeit & Glassmorphism.
 */
export default function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  const [today, setToday] = useState("")
  const [time, setTime] = useState("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setToday(now.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Berlin" }))
      setTime(now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }))
    }
    updateTime()
    const t = setInterval(updateTime, 10_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3.5 mb-6 glass-nav shadow-lg border-b border-white/10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <Logo className="h-11 w-11 shadow-lg shadow-amber-500/20" />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-100 truncate tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs font-medium text-slate-400 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {actions}
          <div className="hidden sm:inline-flex items-center gap-2.5 text-xs font-bold text-slate-200 bg-slate-800/80 border border-white/10 rounded-xl px-3 py-1.5 shadow-md backdrop-blur-md">
            <span className="inline-flex items-center gap-1 text-amber-400">
              <CalendarDays className="w-3.5 h-3.5" />
              {today}
            </span>
            <span className="text-slate-600">|</span>
            <span className="inline-flex items-center gap-1 text-slate-100 tabular-nums">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              {time}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
