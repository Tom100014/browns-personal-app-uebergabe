"use client"

import { useMemo, useState } from "react"
import { Search, Coffee, AlertTriangle, Clock } from "lucide-react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { entryHours, formatHours } from "@/lib/hours"

type Entry = {
  id: string
  date: string
  clock_in: string
  clock_out?: string | null
  break_minutes?: number | null
  total_hours?: number | null
  shift_revenue?: number | null
  auto_closed?: boolean | null
}

const money = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Professionelle, durchsuchbare Stundenübersicht für Mitarbeiter: einzelne
 * Nachweise, nach Monat gruppiert und nach Datum sortiert (neueste zuerst),
 * mit Zeit, Pause, Stunden, Umsatz und Hinweis auf automatisch beendete Schichten.
 */
export default function MyHoursList({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState("")

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.clock_in ?? "").localeCompare(a.clock_in ?? "")),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(e => {
      const label = format(new Date(e.date + "T12:00:00"), "EEEE dd.MM.yyyy", { locale: de }).toLowerCase()
      return (
        label.includes(q) ||
        e.date.includes(q) ||
        (e.clock_in ?? "").includes(q) ||
        (e.clock_out ?? "").includes(q)
      )
    })
  }, [sorted, query])

  // Nach Monat gruppieren (Struktur „nach Zeit")
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of filtered) {
      const key = e.date.slice(0, 7) // yyyy-MM
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: format(new Date(key + "-01T12:00:00"), "MMMM yyyy", { locale: de }),
      hours: list.reduce((s, e) => s + entryHours(e), 0),
      entries: list,
    }))
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          inputMode="search"
          placeholder="Suchen — Tag, Datum oder Uhrzeit (z. B. Montag, 21.07, 16:00)"
          aria-label="Stunden durchsuchen"
          className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
        />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {query ? "Keine Einträge für diese Suche." : "Noch keine erfassten Stunden."}
        </div>
      ) : (
        groups.map(group => (
          <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
              <span className="text-sm font-bold capitalize text-gray-900">{group.label}</span>
              <span className="text-xs font-bold text-brand-700">{formatHours(group.hours)}</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {group.entries.map(e => {
                const hours = e.total_hours ?? entryHours(e)
                const open = !e.clock_out
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <span className="text-[10px] font-bold uppercase leading-none">{format(new Date(e.date + "T12:00:00"), "EEE", { locale: de })}</span>
                      <span className="text-sm font-black leading-tight">{format(new Date(e.date + "T12:00:00"), "dd")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-gray-900">
                        <span className="tabular-nums">
                          {e.clock_in.slice(0, 5)} – {open ? <span className="text-emerald-600">läuft…</span> : e.clock_out!.slice(0, 5)} Uhr
                        </span>
                        {e.auto_closed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> auto. beendet
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        <span className="capitalize">{format(new Date(e.date + "T12:00:00"), "EEEE, dd.MM.yyyy", { locale: de })}</span>
                        {(e.break_minutes ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1"><Coffee className="h-3 w-3" />{e.break_minutes} Min</span>
                        )}
                        {e.shift_revenue != null && Number(e.shift_revenue) > 0 && (
                          <span className="font-semibold text-emerald-700">💶 {money(Number(e.shift_revenue))} €</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {open ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          <Clock className="h-3 w-3" /> aktiv
                        </span>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-gray-900">{formatHours(hours)}</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
