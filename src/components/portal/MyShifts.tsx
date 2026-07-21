"use client"

import { useState, useEffect } from "react"
import { Clock, CalendarDays, CalendarX, Loader2, Download, Printer, CalendarPlus } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import { formatDayLabel } from "@/lib/coverage"
import { shiftHours, formatHours } from "@/lib/hours"
import { cn } from "@/lib/utils"
import type { Shift } from "@/types"

const hhmm = (t: string) => t.slice(0, 5)

export default function MyShifts({ shifts: initial }: { shifts: Shift[] }) {
  const [shifts, setShifts] = useState<Shift[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Live-Sync: Planänderungen der Leitung erscheinen sofort.
  useRealtimeRefresh(["shifts", "coverage_requests"])
  useEffect(() => { setShifts(initial) }, [initial])

  // Der veroeffentlichte Plan gilt als verbindlich — Mitarbeiter muessen nicht
  // jeden Tag einzeln bestaetigen. Nur wenn ein Tag NICHT passt, wird er gemeldet.
  async function reportProblem(shift: Shift) {
    if (!confirmWindow(`Passt der ${formatDayLabel(shift.date)} wirklich nicht? Die Leitung wird informiert und es wird Ersatz gesucht.`)) return
    setBusy(shift.id)
    try {
      const response = await fetch("/api/coverage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id }),
      })
      const result = await response.json().catch(() => null) as { opened?: number; duplicates?: number; error?: string } | null
      if (response.ok && Number(result?.opened ?? 0) > 0) {
        setShifts(prev => prev.filter(s => s.id !== shift.id))
        setNotice("Gemeldet: Dieser Tag passt nicht. Die Leitung wurde informiert und es wird Ersatz gesucht.")
      } else if (response.ok && Number(result?.duplicates ?? 0) > 0) {
        setNotice("Für diese Schicht läuft bereits eine Vertretungsanfrage.")
      } else {
        setNotice(result?.error ?? "Die Schicht konnte nicht freigegeben werden. Bitte die Leitung informieren.")
      }
    } catch {
      setNotice("Keine Verbindung. Die Schicht wurde nicht freigegeben; bitte erneut versuchen.")
    } finally {
      setBusy(null)
    }
  }

  function confirmWindow(msg: string) {
    return typeof window === "undefined" ? true : window.confirm(msg)
  }

  // ---------- Eigener Plan-Download ----------
  function download(content: string, name: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    if (shifts.length === 0) return
    const head = ["Datum", "Tag", "Von", "Bis", "Stunden", "Station", "Status"]
    const lines = shifts.map(s => [
      s.date, formatDayLabel(s.date), s.start_time.slice(0, 5), s.end_time.slice(0, 5),
      String(shiftHours(s)).replace(".", ","), s.position, "Verbindlich",
    ])
    const csv = [head, ...lines].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")
    download("﻿" + csv, "Mein-Dienstplan.csv", "text/csv;charset=utf-8;")
  }

  function exportIcs() {
    if (shifts.length === 0) return
    const pad = (n: number) => String(n).padStart(2, "0")
    const dt = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`
    const now = new Date()
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
    const events = shifts.map(s => [
      "BEGIN:VEVENT",
      `UID:${s.id}@browns-perso`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Berlin:${dt(s.date, s.start_time)}`,
      `DTEND;TZID=Europe/Berlin:${dt(s.date, s.end_time)}`,
      `SUMMARY:Schicht ${s.position}`,
      "LOCATION:Browns Coffee Lounge",
      "END:VEVENT",
    ].join("\r\n")).join("\r\n")
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Browns Perso//Dienstplan//DE", "CALSCALE:GREGORIAN", events, "END:VCALENDAR"].join("\r\n")
    download(ics, "Mein-Dienstplan.ics", "text/calendar;charset=utf-8;")
  }

  function printPlan() {
    if (shifts.length === 0) return
    const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const rows = shifts.map(s => `<tr><td>${esc(formatDayLabel(s.date))}, ${s.date.slice(8,10)}.${s.date.slice(5,7)}.</td><td class="t">${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}</td><td class="t">${String(shiftHours(s)).replace(".", ",")} h</td><td>${esc(s.position)}</td><td>${"Verbindlich"}</td></tr>`).join("")
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Mein Dienstplan</title><style>
      body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2937;margin:32px;font-size:13px}
      .brand{font-weight:800;letter-spacing:.1em;color:#9a3412}h1{font-size:20px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#9ca3af;padding:6px 8px;border-bottom:1px solid #e5e7eb}
      td{padding:7px 8px;border-bottom:1px solid #f3f4f6}td.t{font-variant-numeric:tabular-nums;white-space:nowrap}
    </style></head><body><div class="brand">BROWN'S COFFEE LOUNGE</div><h1>Mein Dienstplan</h1>
      <table><thead><tr><th>Tag</th><th>Zeit</th><th>Std.</th><th>Station</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`
    const w = window.open("", "_blank")
    if (!w) { alert("Bitte Pop-ups erlauben, um als PDF zu drucken."); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 350)
  }

  return (
    <div>
      {notice && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{notice}</div>
      )}
      {shifts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-sm text-gray-400">
          Keine anstehenden Schichten.
        </div>
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-gray-400 mr-auto">{shifts.length} anstehende Schichten herunterladen:</span>
          <button onClick={printPlan} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportIcs} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
            <CalendarPlus className="w-3.5 h-3.5" /> Kalender
          </button>
        </div>
        <div className="space-y-2.5">
          {shifts.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-brand-50 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-brand-500 font-semibold uppercase">{formatDayLabel(s.date).slice(0, 2)}</span>
                  <span className="text-sm font-bold text-brand-700 leading-none">{s.date.slice(8, 10)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.position}</p>
                  <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatDayLabel(s.date)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{hhmm(s.start_time)}–{hhmm(s.end_time)} · {formatHours(shiftHours(s))}</span>
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-emerald-50 text-emerald-700">
                  Verbindlich
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => reportProblem(s)} disabled={busy === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition disabled:opacity-50">
                  {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarX className="w-3.5 h-3.5" />} Passt nicht — melden
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
