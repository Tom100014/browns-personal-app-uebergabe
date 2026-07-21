"use client"

import { useEffect, useState } from "react"
import { CalendarDays } from "lucide-react"

/**
 * Feststehende Kopfleiste fuer jeden Bereich:
 * Titel + Untertitel links, aktuelles Datum (de) rechts.
 * Bleibt beim Scrollen sichtbar, damit Datum und Bereich immer klar sind.
 */
export default function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  const [today, setToday] = useState("")
  useEffect(() => {
    const fmt = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Berlin" })
    setToday(fmt())
    const t = setInterval(() => setToday(fmt()), 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="sticky top-20 lg:top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 mb-5 bg-gray-50/95 backdrop-blur border-b border-gray-200/70">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {actions}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 capitalize whitespace-nowrap">
            <CalendarDays className="w-3.5 h-3.5 text-brand-600" />
            {today}
          </span>
        </div>
      </div>
    </div>
  )
}
