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
    <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3.5 mb-6 glass-nav shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <Logo className="h-11 w-11" />
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-charcoal truncate tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs font-medium text-gray-500 truncate mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {actions}
          <div className="hidden sm:inline-flex items-center gap-2.5 text-xs font-bold text-charcoal bg-white/80 border border-gray-200/80 rounded-xl px-3 py-1.5 shadow-sm">
            <span className="inline-flex items-center gap-1 text-brand-600">
              <CalendarDays className="w-3.5 h-3.5" />
              {today}
            </span>
            <span className="text-gray-300">|</span>
            <span className="inline-flex items-center gap-1 text-charcoal tabular-nums">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              {time}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
