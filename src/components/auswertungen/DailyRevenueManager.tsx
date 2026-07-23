"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { TrendingUp, Euro, Percent, Save, Check, Calendar, Download, Printer, AlertCircle, BarChart3 } from "lucide-react"
import { entryHours, formatEuro, formatHours } from "@/lib/hours"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Employee } from "@/types"
import { format, getDaysInMonth, parseISO } from "date-fns"
import { de } from "date-fns/locale"

type Entry = { employee_id: string; date: string; clock_in: string; clock_out?: string | null; break_minutes?: number | null }

interface Props {
  month: string // e.g. "2026-07"
  employees: Employee[]
  entries: Entry[]
  onMonthlyRevenueChange?: (total: number) => void
}

type DailyRow = {
  date: string // "YYYY-MM-DD"
  dayNum: number
  dayName: string
  revenue: number
  laborHours: number
  laborCost: number
  quote: number | null
}

export default function DailyRevenueManager({ month, employees, entries, onMonthlyRevenueChange }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dailyRevenues, setDailyRevenues] = useState<Record<string, number>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart")

  // Load daily revenues from Supabase for the selected month
  const loadDailyRevenues = useCallback(async () => {
    const startDate = `${month}-01`
    const daysCount = getDaysInMonth(parseISO(startDate))
    const endDate = `${month}-${String(daysCount).padStart(2, "0")}`

    const { data } = await supabase
      .from("daily_revenue")
      .select("date,amount")
      .gte("date", startDate)
      .lte("date", endDate)

    const revMap: Record<string, number> = {}
    const inputMap: Record<string, string> = {}

    if (data) {
      for (const row of data) {
        const amt = Number(row.amount) || 0
        revMap[row.date] = amt
        inputMap[row.date] = amt ? String(amt).replace(".", ",") : ""
      }
    }

    setDailyRevenues(revMap)
    setInputs(inputMap)
  }, [month, supabase])

  useEffect(() => {
    void loadDailyRevenues()
  }, [loadDailyRevenues])

  // Compute employee wages lookup map
  const wageByEmp = useMemo(() => {
    const map = new Map<string, number>()
    for (const emp of employees) {
      map.set(emp.id, emp.hourly_wage ?? 0)
    }
    return map
  }, [employees])

  // Build daily calculation rows for all days in month
  const daysData = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    const totalDays = getDaysInMonth(new Date(y, m - 1, 1))
    const list: DailyRow[] = []

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`
      const dateObj = new Date(y, m - 1, d)
      const dayName = format(dateObj, "EEEE", { locale: de })

      // Filter entries for this date
      let laborHours = 0
      let laborCost = 0
      for (const entry of entries) {
        if (entry.date === dateStr && entry.clock_out) {
          const hours = entryHours(entry)
          const wage = wageByEmp.get(entry.employee_id) ?? 0
          laborHours += hours
          laborCost += hours * wage
        }
      }

      const revenue = dailyRevenues[dateStr] ?? 0
      const quote = revenue > 0 ? (laborCost / revenue) * 100 : null

      list.push({
        date: dateStr,
        dayNum: d,
        dayName,
        revenue,
        laborHours,
        laborCost,
        quote,
      })
    }

    return list
  }, [month, dailyRevenues, entries, wageByEmp])

  // Calculate totals
  const totalRevenue = useMemo(() => daysData.reduce((s, d) => s + d.revenue, 0), [daysData])
  const totalLaborHours = useMemo(() => daysData.reduce((s, d) => s + d.laborHours, 0), [daysData])
  const totalLaborCost = useMemo(() => daysData.reduce((s, d) => s + d.laborCost, 0), [daysData])
  const overallQuote = totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : null

  // Chart max value calculation
  const maxBarValue = useMemo(() => {
    return Math.max(...daysData.map(d => Math.max(d.revenue, d.laborCost)), 100)
  }, [daysData])

  function handleInputChange(date: string, val: string) {
    setInputs(prev => ({ ...prev, [date]: val }))
  }

  async function saveAllRevenues() {
    setSaving(true)
    const recordsToUpsert = daysData.map(d => {
      const raw = inputs[d.date] ?? ""
      const amount = raw ? Number(raw.replace(",", ".")) : 0
      return {
        date: d.date,
        amount,
        updated_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase.from("daily_revenue").upsert(recordsToUpsert)

    if (!error) {
      // Sync monthly sum to monthly revenue table
      const sum = recordsToUpsert.reduce((s, r) => s + r.amount, 0)
      await supabase.from("revenue").upsert({ month, amount: sum, updated_at: new Date().toISOString() })
      if (onMonthlyRevenueChange) onMonthlyRevenueChange(sum)

      setDailyRevenues(recordsToUpsert.reduce((acc, r) => ({ ...acc, [r.date]: r.amount }), {}))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  function exportDailyCsv() {
    const head = ["Datum", "Wochentag", "Umsatz EUR", "Arbeitsstunden", "Lohnkosten EUR", "Personalkosten-Quote %"]
    const lines = daysData.map(d => [
      d.date,
      d.dayName,
      d.revenue.toFixed(2).replace(".", ","),
      d.laborHours.toFixed(1).replace(".", ","),
      d.laborCost.toFixed(2).replace(".", ","),
      d.quote != null ? d.quote.toFixed(1).replace(".", ",") + " %" : "—",
    ])
    lines.push([
      "GESAMT",
      "",
      totalRevenue.toFixed(2).replace(".", ","),
      totalLaborHours.toFixed(1).replace(".", ","),
      totalLaborCost.toFixed(2).replace(".", ","),
      overallQuote != null ? overallQuote.toFixed(1).replace(".", ",") + " %" : "—",
    ])

    const csv = [head, ...lines].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Tagesumsatz_Auswertung_${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-gray-900">Tages-Umsatzerfassung &amp; Personalkosten-Analyse</h2>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Vergleiche tägliche Umsätze direkt mit den erfassten Personalstunden &amp; Lohnkosten.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setViewMode("chart")}
              className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition", viewMode === "chart" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              Diagramm
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition", viewMode === "table" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              Tabelle / Eingabe
            </button>
          </div>

          <button
            type="button"
            onClick={saveAllRevenues}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition disabled:opacity-50"
          >
            {saved ? <Check className="w-3.5 h-3.5 text-white" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Gespeichert!" : "Speichern"}
          </button>

          <button
            type="button"
            onClick={exportDailyCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            <Download className="w-3.5 h-3.5" /> CSV Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-3.5">
          <div className="text-xs font-medium text-brand-700 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Gesamt-Umsatz
          </div>
          <div className="text-lg font-extrabold text-brand-900 mt-1">{formatEuro(totalRevenue)}</div>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <Euro className="w-3.5 h-3.5" /> Lohnkosten Summe
          </div>
          <div className="text-lg font-extrabold text-emerald-900 mt-1">{formatEuro(totalLaborCost)}</div>
        </div>

        <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-3.5">
          <div className="text-xs font-medium text-violet-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Gesamt-Stunden
          </div>
          <div className="text-lg font-extrabold text-violet-900 mt-1">{formatHours(totalLaborHours)}</div>
        </div>

        <div className={cn("border rounded-xl p-3.5", overallQuote != null && overallQuote <= 30 ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" : overallQuote != null && overallQuote <= 40 ? "bg-amber-50/70 border-amber-200 text-amber-900" : "bg-rose-50/70 border-rose-200 text-rose-900")}>
          <div className="text-xs font-medium flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5" /> Personalkosten-Quote
          </div>
          <div className="text-lg font-extrabold mt-1">
            {overallQuote != null ? `${overallQuote.toFixed(1).replace(".", ",")} %` : "—"}
          </div>
        </div>
      </div>

      {/* CHART VIEW */}
      {viewMode === "chart" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-500" /> Umsatz</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Lohnkosten</span>
            </div>
            <span>Monat {month}</span>
          </div>

          <div className="h-64 flex items-end gap-1 sm:gap-2 pt-6 pb-2 px-2 border-b border-gray-200 overflow-x-auto">
            {daysData.map(d => {
              const revHeight = maxBarValue > 0 ? (d.revenue / maxBarValue) * 100 : 0
              const costHeight = maxBarValue > 0 ? (d.laborCost / maxBarValue) * 100 : 0

              return (
                <div key={d.date} className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative h-full justify-end">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition absolute bottom-full mb-2 z-20 bg-gray-900 text-white text-[10px] rounded-lg p-2 shadow-xl pointer-events-none whitespace-nowrap">
                    <div className="font-bold">{d.date} ({d.dayName})</div>
                    <div>Umsatz: {formatEuro(d.revenue)}</div>
                    <div>Lohnkosten: {formatEuro(d.laborCost)} ({formatHours(d.laborHours)})</div>
                    {d.quote != null && <div>Quote: {d.quote.toFixed(1)} %</div>}
                  </div>

                  {/* Dual Bar */}
                  <div className="w-full flex items-end justify-center gap-0.5 h-full">
                    {/* Revenue Bar */}
                    <div
                      className="w-1/2 bg-brand-500 rounded-t transition-all group-hover:bg-brand-600"
                      style={{ height: `${Math.max(revHeight, 2)}%` }}
                    />
                    {/* Labor Cost Bar */}
                    <div
                      className="w-1/2 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600"
                      style={{ height: `${Math.max(costHeight, 2)}%` }}
                    />
                  </div>

                  {/* Day Label */}
                  <span className="text-[10px] text-gray-400 font-semibold">{d.dayNum}</span>
                </div>
              )
            })}
          </div>

          <div className="text-[11px] text-gray-400 text-center">
            Tipp: Fahre mit der Maus über die Säulen, um Tagesdetails zu sehen. Wechsle zu „Tabelle“, um Umsätze pro Tag einzugeben.
          </div>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Tag / Datum</th>
                <th className="px-4 py-3 text-right">Umsatz (€)</th>
                <th className="px-4 py-3 text-right">Ist-Stunden</th>
                <th className="px-4 py-3 text-right">Lohnkosten (€)</th>
                <th className="px-4 py-3 text-right">Personalkosten-Quote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {daysData.map(d => {
                const isWeekend = d.dayName === "Samstag" || d.dayName === "Sonntag"
                return (
                  <tr key={d.date} className={cn("hover:bg-gray-50/70 transition", isWeekend && "bg-amber-50/30")}>
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-gray-900">{d.dayNum}.</span> {d.dayName}
                      <span className="text-gray-400 text-[11px] ml-2">({d.date})</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="text"
                        value={inputs[d.date] ?? ""}
                        onChange={e => handleInputChange(d.date, e.target.value)}
                        placeholder="0,00"
                        className="w-28 text-right px-2 py-1 rounded-lg border border-gray-300 text-xs font-semibold focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-700">
                      {formatHours(d.laborHours)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                      {formatEuro(d.laborCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {d.quote != null ? (
                        <span className={cn("px-2 py-0.5 rounded-full font-bold text-[11px]", d.quote <= 30 ? "bg-emerald-100 text-emerald-800" : d.quote <= 40 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800")}>
                          {d.quote.toFixed(1).replace(".", ",")} %
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
