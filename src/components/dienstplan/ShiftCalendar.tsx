"use client"

import { useState, useEffect, Fragment } from "react"
import { addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, format } from "date-fns"
import { de } from "date-fns/locale"
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus, X, LifeBuoy, Clock, Megaphone, Trash2, Download, Printer, ShieldAlert, FileUp } from "lucide-react"
import { cn, getWeekDays, formatTime, calcHours, formatDate } from "@/lib/utils"
import { formatDayLabel } from "@/lib/coverage"
import { notifyPush } from "@/lib/push-client"
import { useRealtimeRefresh } from "@/lib/realtime"
import { logAudit } from "@/lib/audit"
import type { Shift, Employee } from "@/types"
import { createClient } from "@/lib/supabase"
import ShiftImportDialog from "@/components/dienstplan/ShiftImportDialog"

type AbsenceRow = { employee_id: string; type: string; start_date: string; end_date: string; status: string }
type DayHours = { open: string; close: string; closed: boolean }
interface Props { shifts: Shift[]; employees: Employee[]; minStaffing?: Record<string, number>; absences?: AbsenceRow[]; openingHours?: Record<string, DayHours> }
type PlanningIssueLevel = "critical" | "warning" | "info"
type PlanningIssue = { level: PlanningIssueLevel; title: string; detail: string }
type PendingPlanReview = {
  action: "create" | "assign"
  employeeId: string
  employeeName: string
  date: string
  start: string
  end: string
  position: string
  note?: string
  shiftId?: string
  issues: PlanningIssue[]
}

const POSITIONS = ["Service", "Theke", "Küche", "Spüle", "Bar", "Kasse", "Reinigung", "Leitung"]

export default function ShiftCalendar({ shifts: initialShifts, employees, minStaffing = {}, absences = [], openingHours = {} }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [adding, setAdding] = useState<{ date: string; employeeId: string } | null>(null)
  const [form, setForm] = useState({ start: "08:00", end: "16:00", position: "Service", note: "" })
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<"week" | "month">("week")
  const [openForm, setOpenForm] = useState<{ date: string; start: string; end: string; position: string } | null>(null)
  const [savingOpen, setSavingOpen] = useState(false)
  const [published, setPublished] = useState(false)
  const [mobileDay, setMobileDay] = useState(0) // Index in weekDays für die Mobil-Tagesansicht
  const [planReview, setPlanReview] = useState<PendingPlanReview | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Live-Sync: Schichten anderer Geräte/Mitarbeiter (z.B. Abgaben) sofort sichtbar.
  useRealtimeRefresh(["shifts", "absences"])
  useEffect(() => {
    const id = window.setTimeout(() => setShifts(initialShifts), 0)
    return () => window.clearTimeout(id)
  }, [initialShifts])

  function publishPlan() {
    notifyPush({
      audience: "all",
      title: "📅 Schichtplan aktualisiert",
      body: "Der neue Dienstplan ist da — bitte schau dir deine Schichten an.",
      url: "/",
      tag: "plan",
    })
    logAudit("Dienstplan veröffentlicht", rangeLabel())
    setPublished(true)
    setTimeout(() => setPublished(false), 2500)
  }

  const weekDays = getWeekDays(currentDate)
  const openShifts = shifts.filter(s => !s.employee_id)
  const monthDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
  })

  function goPrev() { setCurrentDate(d => view === "month" ? subMonths(d, 1) : subWeeks(d, 1)) }
  function goNext() { setCurrentDate(d => view === "month" ? addMonths(d, 1) : addWeeks(d, 1)) }

  // Soll/Ist-Stunden & Minijob-Verdienstgrenze (603 €/Monat, Stand 2026)
  const MINIJOB_LIMIT_EUR = 603
  const monthStr = format(currentDate, "yyyy-MM")
  const weekDateSet = new Set(weekDays.map(d => formatDate(d.date)))
  function weekPlanned(empId: string): number {
    return shifts.filter(s => s.employee_id === empId && weekDateSet.has(s.date) && s.status !== "absent")
      .reduce((n, s) => n + calcHours(s.start_time, s.end_time), 0)
  }
  function monthEarnings(emp: Employee): number {
    const h = shifts.filter(s => s.employee_id === emp.id && s.date.startsWith(monthStr) && s.status !== "absent")
      .reduce((n, s) => n + calcHours(s.start_time, s.end_time), 0)
    return h * (emp.hourly_wage ?? 0)
  }
  function minijobOver(emp: Employee): boolean {
    return emp.employment_type === "Minijob" && (emp.hourly_wage ?? 0) > 0 && monthEarnings(emp) > MINIJOB_LIMIT_EUR
  }
  const minijobWarnings = employees.filter(minijobOver)

  // Mitarbeiter nach Station gruppieren (Service, Theke, Küche, Spüle …)
  const STATIONS = ["Service", "Theke", "Küche", "Spüle", "Bar", "Kasse", "Reinigung", "Leitung"]
  const groups = (() => {
    const known = STATIONS.map(st => ({ station: st, members: employees.filter(e => e.position === st) })).filter(g => g.members.length > 0)
    const rest = employees.filter(e => !STATIONS.includes(e.position))
    if (rest.length) known.push({ station: "Weitere", members: rest })
    return known
  })()

  async function createOpenShift() {
    if (!openForm) return
    setSavingOpen(true)
    const supabase = createClient()
    const { data } = await supabase.from("shifts")
      .insert({ employee_id: null, date: openForm.date, start_time: openForm.start, end_time: openForm.end, position: openForm.position, status: "scheduled" })
      .select("*, employee:employees(*)").single()
    if (data) setShifts(prev => [...prev, data as Shift])
    setSavingOpen(false); setOpenForm(null)
  }

  async function persistAssignOpenShift(shiftId: string, employeeId: string) {
    const supabase = createClient()
    const { data } = await supabase.from("shifts")
      .update({ employee_id: employeeId, status: "scheduled" }).eq("id", shiftId)
      .select("*, employee:employees(*)").single()
    if (data) setShifts(prev => prev.map(s => s.id === shiftId ? data as Shift : s))
  }

  async function assignOpenShift(shiftId: string, employeeId: string) {
    if (!employeeId) return
    const sh = shifts.find(s => s.id === shiftId)
    const emp = employees.find(e => e.id === employeeId)
    if (sh && emp) {
      const issues = planningIssues(employeeId, sh.date, sh.start_time, sh.end_time, sh.position)
      if (issues.length > 0) {
        setPlanReview({ action: "assign", shiftId, employeeId, employeeName: emp.name, date: sh.date, start: sh.start_time, end: sh.end_time, position: sh.position, issues })
        return
      }
    }
    await persistAssignOpenShift(shiftId, employeeId)
  }

  function toMin(t: string) {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }

  function shiftDuration(start: string, end: string) {
    return calcHours(start, end)
  }

  function monthHoursWith(empId: string, date: string, start: string, end: string) {
    const month = date.slice(0, 7)
    return shifts
      .filter(s => s.employee_id === empId && s.date.startsWith(month) && s.status !== "absent")
      .reduce((n, s) => n + shiftDuration(s.start_time, s.end_time), 0) + shiftDuration(start, end)
  }

  function weekHoursWith(empId: string, date: string, start: string, end: string) {
    const base = new Date(date + "T12:00:00")
    const days = eachDayOfInterval({
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    })
    const set = new Set(days.map(d => formatDate(d)))
    return shifts
      .filter(s => s.employee_id === empId && set.has(s.date) && s.status !== "absent")
      .reduce((n, s) => n + shiftDuration(s.start_time, s.end_time), 0) + shiftDuration(start, end)
  }

  function gapHoursBetween(aDate: string, aStart: string, aEnd: string, b: Shift) {
    const aStartDate = new Date(`${aDate}T${aStart}:00`)
    const aEndDate = new Date(`${aDate}T${aEnd}:00`)
    if (aEndDate <= aStartDate) aEndDate.setDate(aEndDate.getDate() + 1)
    const bStartDate = new Date(`${b.date}T${b.start_time}:00`)
    const bEndDate = new Date(`${b.date}T${b.end_time}:00`)
    if (bEndDate <= bStartDate) bEndDate.setDate(bEndDate.getDate() + 1)
    if (bEndDate <= aStartDate) return (aStartDate.getTime() - bEndDate.getTime()) / 36e5
    if (aEndDate <= bStartDate) return (bStartDate.getTime() - aEndDate.getTime()) / 36e5
    return 0
  }

  function planningIssues(empId: string, date: string, start: string, end: string, position: string): PlanningIssue[] {
    const emp = employees.find(e => e.id === empId)
    const issues: PlanningIssue[] = []
    const s = toMin(start), e = toMin(end)
    const overlap = shifts.find(x => x.employee_id === empId && x.date === date && x.status !== "absent"
      && toMin(x.start_time) < e && toMin(x.end_time) > s)
    if (overlap) issues.push({
      level: "critical",
      title: "Doppelbelegung",
      detail: `Bereits ${overlap.start_time.slice(0, 5)}–${overlap.end_time.slice(0, 5)} (${overlap.position}) eingeplant.`,
    })
    const abs = absences.find(a => a.employee_id === empId && a.start_date <= date && a.end_date >= date)
    if (abs) issues.push({
      level: abs.status === "approved" ? "critical" : "warning",
      title: abs.status === "approved" ? "Abwesenheit" : "Abwesenheitsantrag offen",
      detail: `${emp?.name ?? "Mitarbeiter"} ist an diesem Tag ${abs.type}${abs.status === "pending" ? " (Antrag offen)" : ""}.`,
    })
    const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    const dh = openingHours[DAY_KEYS[new Date(date + "T00:00:00").getDay()]]
    if (dh) {
      if (dh.closed) issues.push({ level: "critical", title: "Geschlossen", detail: "Café ist an diesem Tag laut Öffnungszeiten geschlossen." })
      if (start < dh.open || end > dh.close) issues.push({ level: "warning", title: "Öffnungszeiten", detail: `Schicht liegt außerhalb der Öffnungszeiten (${dh.open}–${dh.close}).` })
    }
    if (!emp) return issues

    const duration = shiftDuration(start, end)
    if (duration > 10) issues.push({
      level: "warning",
      title: "Lange Schicht",
      detail: `${duration.toFixed(1).replace(".", ",")} Stunden geplant. Pause/Arbeitszeit bitte prüfen.`,
    })

    const weekHours = weekHoursWith(emp.id, date, start, end)
    if (emp.weekly_hours && weekHours > emp.weekly_hours + 0.05) {
      issues.push({
        level: "warning",
        title: "Wochenstunden überschritten",
        detail: `Nach dieser Schicht wären ${weekHours.toFixed(1).replace(".", ",")} h geplant, Soll: ${emp.weekly_hours} h.`,
      })
    }

    if (emp.employment_type === "Minijob") {
      if ((emp.hourly_wage ?? 0) > 0) {
        const afterHours = monthHoursWith(emp.id, date, start, end)
        const afterEarnings = afterHours * (emp.hourly_wage ?? 0)
        if (afterEarnings > MINIJOB_LIMIT_EUR) {
          issues.push({
            level: "critical",
            title: "Minijob-Grenze überschritten",
            detail: `Nach dieser Schicht wären ca. ${Math.round(afterEarnings)} € im Monat geplant. Grenze ${MINIJOB_LIMIT_EUR} €.`,
          })
        } else if (afterEarnings > MINIJOB_LIMIT_EUR * 0.9) {
          issues.push({
            level: "warning",
            title: "Minijob fast ausgeschöpft",
            detail: `Nach dieser Schicht wären ca. ${Math.round(afterEarnings)} € geplant (${Math.round(MINIJOB_LIMIT_EUR - afterEarnings)} € Rest bis zur Grenze).`,
          })
        }
      } else {
        issues.push({
          level: "info",
          title: "Stundenlohn fehlt",
          detail: "Minijob-Grenze kann ohne Stundenlohn nicht berechnet werden.",
        })
      }
    }

    if (emp.position && emp.position !== position) {
      issues.push({
        level: "info",
        title: "Station prüfen",
        detail: `${emp.name} ist als ${emp.position} geführt, geplant ist ${position}.`,
      })
    }

    const nearby = shifts
      .filter(x => x.employee_id === empId && x.status !== "absent" && Math.abs(new Date(`${x.date}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) <= 2 * 864e5)
      .map(x => ({ shift: x, gap: gapHoursBetween(date, start, end, x) }))
      .filter(x => x.gap > 0 && x.gap < 11)
      .sort((a, b) => a.gap - b.gap)[0]
    if (nearby) issues.push({
      level: "warning",
      title: "Ruhezeit prüfen",
      detail: `Nur ca. ${nearby.gap.toFixed(1).replace(".", ",")} h Abstand zur Schicht ${nearby.shift.date} ${nearby.shift.start_time.slice(0, 5)}–${nearby.shift.end_time.slice(0, 5)}.`,
    })

    return issues
  }

  async function persistCreateShift(payload: { employeeId: string; date: string; start: string; end: string; position: string; note?: string }) {
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from("shifts")
      .insert({ employee_id: payload.employeeId, date: payload.date, start_time: payload.start, end_time: payload.end, position: payload.position, note: payload.note, status: "scheduled" })
      .select("*, employee:employees(*)").single()
    if (!error && data) setShifts(prev => [...prev, data as Shift])
    setSaving(false)
    setAdding(null)
  }

  async function saveShift() {
    if (!adding) return
    const emp = employees.find(e => e.id === adding.employeeId)
    const issues = planningIssues(adding.employeeId, adding.date, form.start, form.end, form.position)
    if (issues.length > 0) {
      setPlanReview({
        action: "create",
        employeeId: adding.employeeId,
        employeeName: emp?.name ?? "Mitarbeiter",
        date: adding.date,
        start: form.start,
        end: form.end,
        position: form.position,
        note: form.note,
        issues,
      })
      return
    }
    await persistCreateShift({ employeeId: adding.employeeId, date: adding.date, start: form.start, end: form.end, position: form.position, note: form.note })
  }

  async function confirmPlanReview() {
    if (!planReview) return
    setReviewSaving(true)
    if (planReview.action === "assign" && planReview.shiftId) {
      await persistAssignOpenShift(planReview.shiftId, planReview.employeeId)
    } else {
      await persistCreateShift({
        employeeId: planReview.employeeId,
        date: planReview.date,
        start: planReview.start,
        end: planReview.end,
        position: planReview.position,
        note: planReview.note,
      })
    }
    setReviewSaving(false)
    setPlanReview(null)
  }

  async function deleteShift(id: string) {
    const supabase = createClient()
    await supabase.from("shifts").delete().eq("id", id)
    setShifts(prev => prev.filter(s => s.id !== id))
  }

  async function deleteAllShifts() {
    if (!confirm("Wirklich den GESAMTEN Dienstplan löschen? Das kann nicht rückgängig gemacht werden.")) return
    const supabase = createClient()
    await supabase.from("shifts").delete().not("id", "is", null)
    logAudit("Dienstplan geleert", `${shifts.length} Schichten gelöscht`)
    setShifts([])
  }

  async function deleteEmployeeShifts(empId: string, empName: string) {
    if (!confirm(`Alle Schichten von ${empName} löschen?`)) return
    const supabase = createClient()
    await supabase.from("shifts").delete().eq("employee_id", empId)
    setShifts(prev => prev.filter(s => s.employee_id !== empId))
  }

  // ---------- Export (CSV / PDF) ----------
  const STATUS_LABEL: Record<string, string> = { scheduled: "Geplant", confirmed: "Bestätigt", absent: "Abwesend" }
  const empById = (id: string | null) => employees.find(e => e.id === id)
  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  function rangeLabel(): string {
    return view === "month"
      ? format(currentDate, "LLLL yyyy", { locale: de })
      : `${format(weekDays[0].date, "dd.MM.")}–${format(weekDays[6].date, "dd.MM.yyyy")}`
  }

  function shiftsInRange(): Shift[] {
    const days = view === "month" ? monthDays.filter(d => isSameMonth(d, currentDate)) : weekDays.map(d => d.date)
    const set = new Set(days.map(d => formatDate(d)))
    return shifts.filter(s => s.employee_id && set.has(s.date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  function exportPlanCsv() {
    const rows = shiftsInRange()
    if (rows.length === 0) { alert("Keine Schichten im aktuellen Zeitraum."); return }
    const head = ["Datum", "Wochentag", "Mitarbeiter", "Station", "Von", "Bis", "Stunden", "Status", "Notiz"]
    const lines = rows.map(s => {
      const e = empById(s.employee_id)
      return [
        s.date, format(new Date(s.date), "EEEE", { locale: de }), e?.name ?? "—", s.position,
        s.start_time.slice(0, 5), s.end_time.slice(0, 5),
        String(calcHours(s.start_time, s.end_time)).replace(".", ","), STATUS_LABEL[s.status] ?? s.status, s.note ?? "",
      ]
    })
    const csv = [head, ...lines].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")
    download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `Dienstplan_${rangeLabel()}.csv`)
  }

  function printPlan() {
    const rows = shiftsInRange()
    if (rows.length === 0) { alert("Keine Schichten im aktuellen Zeitraum."); return }
    const byDate = new Map<string, Shift[]>()
    for (const s of rows) { const a = byDate.get(s.date) ?? []; a.push(s); byDate.set(s.date, a) }
    const body = [...byDate.keys()].sort().map(d => {
      const list = (byDate.get(d) ?? []).sort((a, b) => a.position.localeCompare(b.position) || a.start_time.localeCompare(b.start_time))
      const trs = list.map(s => {
        const e = empById(s.employee_id)
        return `<tr><td>${esc(s.position)}</td><td>${esc(e?.name ?? "—")}</td><td class="t">${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}</td><td class="t">${String(calcHours(s.start_time, s.end_time)).replace(".", ",")} h</td><td>${esc(STATUS_LABEL[s.status] ?? s.status)}</td></tr>`
      }).join("")
      return `<h3>${esc(format(new Date(d), "EEEE, dd. MMMM yyyy", { locale: de }))}</h3>
        <table><thead><tr><th>Station</th><th>Mitarbeiter</th><th>Zeit</th><th>Std.</th><th>Status</th></tr></thead><tbody>${trs}</tbody></table>`
    }).join("")
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Dienstplan ${esc(rangeLabel())}</title><style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2937;margin:32px;font-size:12px}
      .brand{font-weight:800;letter-spacing:.1em;color:#9a3412}
      h1{font-size:20px;margin:4px 0 2px} .sub{color:#6b7280;margin:0 0 20px}
      h3{font-size:13px;color:#9a3412;margin:18px 0 6px;border-bottom:1px solid #f1d9cd;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}
      th{text-align:left;font-size:10px;text-transform:uppercase;color:#9ca3af;padding:4px 8px;border-bottom:1px solid #e5e7eb}
      td{padding:5px 8px;border-bottom:1px solid #f3f4f6}
      td.t{font-variant-numeric:tabular-nums;white-space:nowrap}
      tr{page-break-inside:avoid}
      footer{margin-top:24px;color:#9ca3af;font-size:10px;text-align:center}
    </style></head><body>
      <div class="brand">BROWN'S COFFEE LOUNGE</div>
      <h1>Dienstplan — ${esc(rangeLabel())}</h1>
      <p class="sub">Stand: ${esc(format(new Date(), "dd.MM.yyyy HH:mm", { locale: de }))} Uhr · ${rows.length} Schichten</p>
      ${body}
      <footer>Browns Perso · Personalplanung</footer>
    </body></html>`
    const w = window.open("", "_blank")
    if (!w) { alert("Bitte Pop-ups erlauben, um den Plan als PDF zu drucken."); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 350)
  }

  async function toggleStatus(shift: Shift) {
    const next = shift.status === "scheduled" ? "confirmed" : shift.status === "confirmed" ? "absent" : "scheduled"
    const supabase = createClient()
    await supabase.from("shifts").update({ status: next }).eq("id", shift.id)
    setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, status: next } : s))
  }

  return (
    <div className="min-w-0">
      {/* Header toolbar */}
      <div className="mb-4 flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid w-full min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-1.5 sm:flex sm:w-auto sm:gap-2">
          <button onClick={goPrev}
            aria-label={view === "month" ? "Vorheriger Monat" : "Vorherige Woche"}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition">
            Heute
          </button>
          <button onClick={goNext}
            aria-label={view === "month" ? "Nächster Monat" : "Nächste Woche"}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="min-w-0 truncate text-right text-sm font-medium capitalize text-gray-600 sm:ml-2 sm:text-left">
            {view === "month"
              ? format(currentDate, "MMMM yyyy", { locale: de })
              : `${weekDays[0].label.split(" ")[1]} – ${weekDays[6].label.split(" ")[1]}`}
          </span>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          <button onClick={() => setShowImport(true)}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 sm:px-3">
            <FileUp className="h-3.5 w-3.5" /> Importieren
          </button>
          <button onClick={publishPlan}
            className={cn("flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-center text-xs font-medium leading-tight transition sm:px-3",
              published ? "bg-emerald-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white")}>
            <Megaphone className="w-3.5 h-3.5" /> {published ? "Team benachrichtigt" : "Plan veröffentlichen"}
          </button>
          <button onClick={() => setOpenForm({ date: formatDate(new Date()), start: "08:00", end: "16:00", position: "Service" })}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 sm:px-3">
            <Plus className="w-3.5 h-3.5" /> Offene Schicht
          </button>
          <div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-lg border border-gray-200">
            <button onClick={printPlan} title="Als PDF drucken/speichern"
              className="flex min-w-0 items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 sm:px-3">
              <Printer className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={exportPlanCsv} title="Als CSV herunterladen"
              className="flex min-w-0 items-center justify-center gap-1.5 border-l border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 sm:px-3">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <button onClick={deleteAllShifts}
            className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:px-3">
            <Trash2 className="w-3.5 h-3.5" /> Plan leeren
          </button>
          <div className="col-span-2 grid min-w-0 grid-cols-2 overflow-hidden rounded-lg border border-gray-200 sm:col-auto sm:flex">
            {(["week","month"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("min-w-0 px-3 py-1.5 text-xs font-medium transition",
                  view === v ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}>
                {v === "week" ? "Woche" : "Monat"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Minijob-Verdienstgrenze-Warnung (556 €/Monat) */}
      {minijobWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-red-600">⚠</span>
            <h3 className="text-sm font-semibold text-red-900">Minijob-Verdienstgrenze in Gefahr ({monthStr})</h3>
          </div>
          <div className="space-y-0.5">
            {minijobWarnings.map(emp => (
              <p key={emp.id} className="text-xs text-red-800">
                <span className="font-medium">{emp.name}</span> — geplant ca. {Math.round(monthEarnings(emp))} € (Grenze {MINIJOB_LIMIT_EUR} €). Schichten reduzieren oder umverteilen.
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Offene Schichten */}
      {openShifts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5 mb-4">
          <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <LifeBuoy className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-orange-900">Offene Schichten ({openShifts.length})</h3>
            <span className="text-xs text-orange-700/70">— noch niemandem zugewiesen</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {openShifts.map(s => (
              <div key={s.id} className="flex w-full min-w-0 flex-col gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">{s.position}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />{formatDayLabel(s.date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)}
                  </p>
                </div>
                <select defaultValue="" onChange={e => assignOpenShift(s.id, e.target.value)}
                  className="w-full min-w-0 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-auto">
                  <option value="" disabled>Zuweisen…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button onClick={() => deleteShift(s.id)} className="self-end text-gray-300 transition hover:text-red-500 sm:self-auto" title="Löschen">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month grid */}
      {view === "month" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(d => (
              <div key={d} className="px-2 py-2.5 text-xs font-semibold text-gray-400 text-center uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map(day => {
              const dateStr = formatDate(day)
              const dayShifts = shifts.filter(s => s.employee_id && s.date === dateStr)
              const inMonth = isSameMonth(day, currentDate)
              const today = isToday(day)
              return (
                <div key={dateStr} className={cn("min-h-[104px] border-b border-r border-gray-50 p-1.5 last:border-r-0",
                  !inMonth && "bg-gray-50/40", today && "bg-brand-50/40")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                      today ? "bg-brand-600 text-white" : inMonth ? "text-gray-700" : "text-gray-300")}>
                      {day.getDate()}
                    </span>
                    <button onClick={() => setOpenForm({ date: dateStr, start: "08:00", end: "16:00", position: "Service" })}
                      className="text-gray-300 hover:text-brand-500 transition" title="Schicht anlegen">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dayShifts.slice(0, 3).map(shift => {
                      const emp = employees.find(e => e.id === shift.employee_id)
                      return (
                        <div key={shift.id} onClick={() => toggleStatus(shift)}
                          className="rounded px-1.5 py-1 text-[11px] cursor-pointer hover:opacity-90 leading-tight"
                          style={{ backgroundColor: `${emp?.color ?? "#6366f1"}18`, borderLeft: `2px solid ${emp?.color ?? "#6366f1"}` }}>
                          <span className="font-medium text-gray-700">{formatTime(shift.start_time)}</span>{" "}
                          <span className="text-gray-500 truncate">{emp?.name?.split(" ")[0]}</span>
                        </div>
                      )
                    })}
                    {dayShifts.length > 3 && <p className="text-[10px] text-gray-400 px-1">+{dayShifts.length - 3} weitere</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Week grid */}
      {view === "week" && (
      <>
      {/* Mobil: Tag-für-Tag statt breiter Matrix */}
      <div className="md:hidden">
        <div className="mb-3 grid min-w-0 grid-cols-7 gap-1 pb-2">
          {weekDays.map((day, idx) => (
            <button key={day.label} onClick={() => setMobileDay(idx)}
              className={cn("min-w-0 rounded-lg border px-1 py-2 text-center transition",
                idx === mobileDay ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200",
                day.isToday && idx !== mobileDay && "border-brand-300")}>
              <div className="text-[10px] font-semibold uppercase">{day.label.split(" ")[0]}</div>
              <div className="text-sm font-bold">{day.label.split(" ")[1]?.split(".")[0]}</div>
            </button>
          ))}
        </div>
        {(() => {
          const ds = formatDate(weekDays[mobileDay].date)
          return (
            <div className="space-y-3">
              {groups.map(g => {
                const min = minStaffing[g.station] ?? 0
                const memberIds = new Set(g.members.map(m => m.id))
                const dayShifts = shifts.filter(s => s.employee_id && memberIds.has(s.employee_id) && s.date === ds && s.status !== "absent")
                const cnt = new Set(dayShifts.map(s => s.employee_id)).size
                const under = min > 0 && cnt < min
                return (
                  <div key={g.station} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className={cn("flex items-center justify-between px-4 py-2 border-b", under ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100")}>
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{g.station}</span>
                      <span className={cn("text-xs font-semibold tabular-nums", under ? "text-red-600" : "text-gray-400")}>
                        {under ? `${cnt}/${min} ⚠ unterbesetzt` : `${cnt}${min > 0 ? `/${min}` : ""}`}
                      </span>
                    </div>
                    {dayShifts.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-300">Keine Schicht</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {dayShifts.sort((a, b) => a.start_time.localeCompare(b.start_time)).map(s => {
                          const emp = employees.find(e => e.id === s.employee_id)
                          return (
                            <div key={s.id} className="flex items-center gap-2.5 px-4 py-2.5">
                              <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: emp?.color ?? "#6366f1" }}>
                                {emp?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{emp?.name ?? "—"}</p>
                                <p className="text-xs text-gray-400 tabular-nums">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {calcHours(s.start_time, s.end_time)} h</p>
                              </div>
                              <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0", s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                                {s.status === "confirmed" ? "Best." : "Geplant"}
                              </span>
                              <button onClick={() => deleteShift(s.id)} className="p-1.5 text-gray-300 hover:text-red-500 flex-shrink-0" title="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <button onClick={() => setOpenForm({ date: ds, start: "08:00", end: "16:00", position: "Service" })}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50 transition">
                <Plus className="w-4 h-4" /> Schicht für diesen Tag hinzufügen
              </button>
            </div>
          )
        })()}
      </div>

      {/* Desktop: volle Wochenmatrix */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-44 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 z-20 bg-white">Mitarbeiter</th>
                {weekDays.map(day => (
                  <th key={day.label} className={cn("px-2 py-3 text-xs font-semibold text-center min-w-[120px]",
                    day.isToday ? "text-brand-600" : "text-gray-500")}>
                    <div>{day.label.split(" ")[0]}</div>
                    <div className={cn("text-base font-bold mt-0.5", day.isToday ? "text-brand-600" : "text-gray-800")}>
                      {day.label.split(" ")[1]?.split(".")[0]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const min = minStaffing[g.station] ?? 0
                const memberIds = new Set(g.members.map(m => m.id))
                return (
                <Fragment key={g.station}>
                  <tr className="bg-gray-100/70 border-y border-gray-100">
                    <td className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap sticky left-0 z-10 bg-gray-100">
                      {g.station} <span className="text-gray-400 font-medium normal-case">· {g.members.length}{min > 0 ? ` · min ${min}` : ""}</span>
                    </td>
                    {weekDays.map(day => {
                      const ds = formatDate(day.date)
                      const cnt = new Set(shifts.filter(s => s.employee_id && memberIds.has(s.employee_id) && s.date === ds && s.status !== "absent").map(s => s.employee_id)).size
                      const under = min > 0 && cnt < min
                      return (
                        <td key={ds} title={under ? `Unterbesetzt: ${cnt}/${min}` : undefined}
                          className={cn("px-2 py-1.5 text-center text-[11px] tabular-nums font-semibold border-l border-gray-100",
                            day.isToday && "bg-brand-50/40", under ? "text-red-600" : cnt > 0 ? "text-gray-500" : "text-gray-300")}>
                          {under ? `${cnt}/${min} ⚠` : (cnt || "·")}
                        </td>
                      )
                    })}
                  </tr>
                  {g.members.map((emp, i) => (
                <tr key={emp.id} className={cn("border-b border-gray-50", i % 2 === 0 ? "bg-white" : "bg-gray-50/30")}>
                  <td className={cn("px-4 py-2 sticky left-0 z-10 border-r border-gray-100", i % 2 === 0 ? "bg-white" : "bg-gray-50")}>
                    <div className="flex items-center gap-2 group/emp">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: emp.color }}>
                        {emp.name.split(" ").map((n: string) => n[0]).join("").slice(0,2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate max-w-[140px] flex items-center gap-1">
                          {emp.name}
                          {minijobOver(emp) && <span className="text-red-500 flex-shrink-0" title={`Minijob: geplant ca. ${Math.round(monthEarnings(emp))} € > ${MINIJOB_LIMIT_EUR} €`}>⚠</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {emp.position}
                          {(() => { const ist = weekPlanned(emp.id); const soll = emp.weekly_hours ?? null
                            if (ist === 0 && !soll) return null
                            return <span className={cn("ml-1", soll && ist > soll + 0.05 ? "text-amber-600 font-medium" : "")}>· {ist.toFixed(0)}{soll ? `/${soll}` : ""} h</span>
                          })()}
                        </p>
                      </div>
                      <button onClick={() => deleteEmployeeShifts(emp.id, emp.name)}
                        className="ml-auto opacity-0 group-hover/emp:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition"
                        title={`Alle Schichten von ${emp.name} löschen`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  {weekDays.map(day => {
                    const dateStr = formatDate(day.date)
                    const dayShifts = shifts.filter(s => s.employee_id === emp.id && s.date === dateStr)
                    return (
                      <td key={dateStr} className={cn("px-1.5 py-1.5 align-top border-l border-gray-50",
                        day.isToday && "bg-brand-50/30")}>
                        <div className="space-y-1">
                          {dayShifts.map(shift => (
                            <div key={shift.id}
                              className="group relative rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: `${emp.color}18`, borderLeft: `3px solid ${emp.color}` }}
                              onClick={() => toggleStatus(shift)}>
                              <p className="font-semibold text-gray-800">{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</p>
                              <p className="text-gray-500">{shift.position}</p>
                              <span className={cn("text-xs",
                                shift.status === "confirmed" ? "text-emerald-600" :
                                shift.status === "absent" ? "text-red-500" : "text-gray-400")}>
                                {shift.status === "confirmed" ? "✓" : shift.status === "absent" ? "✗" : ""}
                              </span>
                              <button onClick={e => { e.stopPropagation(); deleteShift(shift.id) }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => setAdding({ date: dateStr, employeeId: emp.id })}
                            className="w-full rounded-lg border border-dashed border-gray-200 py-1.5 text-gray-300 hover:border-brand-400 hover:text-brand-500 transition flex items-center justify-center">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
                  ))}
                </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/70">
                <td className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sticky left-0 z-10 bg-gray-50">Besetzung / Tag</td>
                {weekDays.map(day => {
                  const ds = formatDate(day.date)
                  const dayShifts = shifts.filter(s => s.employee_id && s.date === ds && s.status !== "absent")
                  const count = new Set(dayShifts.map(s => s.employee_id)).size
                  const hrs = Math.round(dayShifts.reduce((a, s) => a + calcHours(s.start_time, s.end_time), 0))
                  return (
                    <td key={ds} className={cn("px-2 py-2 text-center text-xs tabular-nums border-l border-gray-100",
                      day.isToday && "bg-brand-50/40", count === 0 ? "text-gray-300" : "text-gray-700 font-medium")}>
                      {count > 0 ? <>{count}&nbsp;MA · {hrs}&nbsp;h</> : "—"}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Open shift modal */}
      {openForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Offene Schicht anlegen</h3>
              <button onClick={() => setOpenForm(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Datum</label>
                <input type="date" value={openForm.date} onChange={e => setOpenForm(f => f && ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Von</label>
                  <input type="time" value={openForm.start} onChange={e => setOpenForm(f => f && ({ ...f, start: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Bis</label>
                  <input type="time" value={openForm.end} onChange={e => setOpenForm(f => f && ({ ...f, end: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Position</label>
                <select value={openForm.position} onChange={e => setOpenForm(f => f && ({ ...f, position: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  {POSITIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setOpenForm(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition">Abbrechen</button>
              <button onClick={createOpenShift} disabled={savingOpen}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {savingOpen ? "Speichern…" : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add shift modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Neue Schicht</h3>
              <button onClick={() => setAdding(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Von</label>
                  <input type="time" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Bis · {calcHours(form.start, form.end)}h</label>
                  <input type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Position</label>
                <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                  {POSITIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Notiz (optional)</label>
                <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z.B. Frühschicht" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAdding(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition">
                Abbrechen
              </button>
              <button onClick={saveShift} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional planning guard */}
      {planReview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.35rem] border border-white/70 bg-white shadow-float">
            <div className="brand-topbar px-5 py-4 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/18">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-wide text-white/75">Planprüfung</p>
                  <h3 className="mt-0.5 text-lg font-black leading-tight">Vor dem Speichern prüfen</h3>
                  <p className="mt-1 text-xs font-semibold text-white/80">
                    {planReview.employeeName} · {formatDayLabel(planReview.date)} · {formatTime(planReview.start)}–{formatTime(planReview.end)} · {planReview.position}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-red-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase text-red-500">Kritisch</p>
                  <p className="stat-number text-2xl text-red-700">{planReview.issues.filter(i => i.level === "critical").length}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase text-amber-500">Warnung</p>
                  <p className="stat-number text-2xl text-amber-700">{planReview.issues.filter(i => i.level === "warning").length}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase text-sky-500">Info</p>
                  <p className="stat-number text-2xl text-sky-700">{planReview.issues.filter(i => i.level === "info").length}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                {planReview.issues.map((issue, idx) => (
                  <div key={`${issue.title}-${idx}`} className={cn(
                    "rounded-2xl border px-3.5 py-3",
                    issue.level === "critical" && "border-red-200 bg-red-50",
                    issue.level === "warning" && "border-amber-200 bg-amber-50",
                    issue.level === "info" && "border-sky-200 bg-sky-50",
                  )}>
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className={cn(
                        "mt-0.5 h-4 w-4 flex-shrink-0",
                        issue.level === "critical" && "text-red-600",
                        issue.level === "warning" && "text-amber-600",
                        issue.level === "info" && "text-sky-600",
                      )} />
                      <div>
                        <p className={cn(
                          "text-sm font-black",
                          issue.level === "critical" && "text-red-950",
                          issue.level === "warning" && "text-amber-950",
                          issue.level === "info" && "text-sky-950",
                        )}>{issue.title}</p>
                        <p className={cn(
                          "mt-0.5 text-xs leading-relaxed",
                          issue.level === "critical" && "text-red-800",
                          issue.level === "warning" && "text-amber-800",
                          issue.level === "info" && "text-sky-800",
                        )}>{issue.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 rounded-2xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
                Das System blockiert nicht blind. Es zeigt dir sauber, warum etwas riskant ist. Kritische Punkte sollten nur bewusst überschrieben werden.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPlanReview(null)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  <X className="h-4 w-4" /> Zurück ändern
                </button>
                <button
                  type="button"
                  onClick={confirmPlanReview}
                  disabled={reviewSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-sm font-bold text-white transition hover:bg-charcoal-light disabled:opacity-50"
                >
                  {reviewSaving ? "Speichern..." : <><CheckCircle2 className="h-4 w-4" /> Bewusst speichern</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ShiftImportDialog
          employees={employees}
          shifts={shifts}
          onClose={() => setShowImport(false)}
          onImported={imported => setShifts(current => [...current, ...imported])}
        />
      )}
    </div>
  )
}
