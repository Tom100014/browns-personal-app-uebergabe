import type { SupabaseClient } from "@supabase/supabase-js"
import { entryHours, shiftHours } from "@/lib/hours"
import { parseKnowledgeNote, type KnowledgeDoc } from "@/lib/knowledge"

type EmployeeRow = {
  id: string
  name: string
  position?: string | null
  employment_type?: string | null
}

type EntryRow = {
  employee_id: string
  date: string
  clock_in: string
  clock_out?: string | null
  break_minutes?: number | null
}

type ShiftRow = {
  employee_id: string | null
  date: string
  start_time: string
  end_time: string
  position?: string | null
  status?: string | null
}

type AbsenceRow = {
  employee_id: string
  type: string
  start_date: string
  end_date: string
  status: string
}

type CoverageRow = {
  original_employee_id?: string | null
  suggested_employee_id?: string | null
  filled_by?: string | null
  date?: string | null
  status?: string | null
}

export type EmployeePairHint = {
  employeeId: string
  name: string
  score: number
  label: "eingespielt" | "prüfen"
  reason: string
}

export type EmployeeIntelligence = {
  employeeId: string
  name: string
  position: string
  employmentType: string
  workedHours: number
  plannedHours: number
  absenceDays: number
  sickDays: number
  pendingAbsences: number
  shiftsWithoutEntry: number
  coverageCount: number
  knowledgeCount: number
  positiveSignals: number
  riskSignals: number
  tags: string[]
  notes: string[]
  pairHints: EmployeePairHint[]
  recommendation: string
}

const RISK_SIGNALS = new Set(["problem", "krankheit", "fehler"])
const POSITIVE_SIGNALS = new Set(["positiv", "lernen"])

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
}

function daysInclusive(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${end}T00:00:00Z`).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0
  return Math.round((e - s) / 864e5) + 1
}

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function timeMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number)
  return h * 60 + m
}

function overlaps(a: ShiftRow, b: ShiftRow) {
  const aStart = timeMinutes(a.start_time)
  const aEnd = timeMinutes(a.end_time)
  const bStart = timeMinutes(b.start_time)
  const bEnd = timeMinutes(b.end_time)
  return aStart < bEnd && bStart < aEnd
}

function hasEmployeeLink(doc: KnowledgeDoc, employee: EmployeeRow) {
  const parsed = parseKnowledgeNote(doc.note)
  if (parsed.meta.employeeIds?.includes(employee.id)) return true
  if (parsed.meta.employeeNames?.some(name => norm(name) === norm(employee.name))) return true
  const searchable = `${doc.title} ${parsed.body} ${doc.extracted ?? ""}`
  return norm(searchable).includes(norm(employee.name))
}

function recommendationFor(row: {
  pendingAbsences: number
  sickDays: number
  shiftsWithoutEntry: number
  riskSignals: number
  positiveSignals: number
  workedHours: number
  plannedHours: number
}) {
  if (row.pendingAbsences > 0) return "Abwesenheitsantrag zuerst prüfen, dann verplanen."
  if (row.shiftsWithoutEntry >= 2) return "Zeitnachweise prüfen, bevor Stunden oder Zuverlässigkeit bewertet werden."
  if (row.riskSignals >= 2) return "Vor kritischen Schichten kurz mit Notizen/Leitung abgleichen."
  if (row.sickDays >= 3) return "Mit Vertretungspuffer planen, ohne die Person negativ zu bewerten."
  if (row.positiveSignals > row.riskSignals) return "Guter Kandidat für stabile Team-Kombinationen."
  if (row.workedHours > row.plannedHours + 5) return "Auslastung prüfen, damit keine Überlastung entsteht."
  return "Normal einplanen und weiter Daten sammeln."
}

export async function buildEmployeeIntelligence(
  admin: SupabaseClient,
  options: { days?: number; tz?: string; maxDocs?: number } = {},
): Promise<EmployeeIntelligence[]> {
  const days = options.days ?? 56
  const maxDocs = options.maxDocs ?? 160
  const tz = options.tz ?? "Europe/Berlin"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz })
  const nowHHMM = new Date().toLocaleTimeString("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  const since = isoDaysAgo(days)

  const [{ data: employees }, { data: entries }, { data: shifts }, { data: absences }, { data: coverage }, { data: docs }] = await Promise.all([
    admin.from("employees").select("id,name,position,employment_type").order("name"),
    admin.from("time_entries").select("employee_id,date,clock_in,clock_out,break_minutes").gte("date", since),
    admin.from("shifts").select("employee_id,date,start_time,end_time,position,status").gte("date", since),
    admin.from("absences").select("employee_id,type,start_date,end_date,status").gte("end_date", since),
    admin.from("coverage_requests").select("original_employee_id,suggested_employee_id,filled_by,date,status").gte("date", since),
    admin.from("knowledge_docs").select("title,note,kind,extracted,created_at").order("created_at", { ascending: false }).limit(maxDocs),
  ])

  const team = (employees ?? []) as EmployeeRow[]
  const entryRows = (entries ?? []) as EntryRow[]
  const shiftRows = (shifts ?? []) as ShiftRow[]
  const absenceRows = (absences ?? []) as AbsenceRow[]
  const coverageRows = (coverage ?? []) as CoverageRow[]
  const knowledgeRows = (docs ?? []) as KnowledgeDoc[]

  const workedBy = new Map<string, number>()
  const entryKeys = new Set<string>()
  for (const entry of entryRows) {
    workedBy.set(entry.employee_id, (workedBy.get(entry.employee_id) ?? 0) + entryHours(entry))
    entryKeys.add(`${entry.employee_id}:${entry.date}`)
  }

  const plannedBy = new Map<string, number>()
  const missingEntryBy = new Map<string, number>()
  for (const shift of shiftRows) {
    if (!shift.employee_id || shift.status === "absent") continue
    plannedBy.set(shift.employee_id, (plannedBy.get(shift.employee_id) ?? 0) + shiftHours(shift))
    const shiftAlreadyStarted = shift.date < today || (shift.date === today && shift.start_time.slice(0, 5) <= nowHHMM)
    if (shiftAlreadyStarted && !entryKeys.has(`${shift.employee_id}:${shift.date}`)) {
      missingEntryBy.set(shift.employee_id, (missingEntryBy.get(shift.employee_id) ?? 0) + 1)
    }
  }

  const absenceDaysBy = new Map<string, number>()
  const sickDaysBy = new Map<string, number>()
  const pendingBy = new Map<string, number>()
  for (const absence of absenceRows) {
    if (absence.status === "rejected") continue
    const daysCount = daysInclusive(absence.start_date, absence.end_date)
    absenceDaysBy.set(absence.employee_id, (absenceDaysBy.get(absence.employee_id) ?? 0) + daysCount)
    if (absence.status === "pending") pendingBy.set(absence.employee_id, (pendingBy.get(absence.employee_id) ?? 0) + 1)
    if (norm(absence.type).includes("krank")) {
      sickDaysBy.set(absence.employee_id, (sickDaysBy.get(absence.employee_id) ?? 0) + daysCount)
    }
  }

  const coverageBy = new Map<string, number>()
  for (const row of coverageRows) {
    for (const id of [row.original_employee_id, row.suggested_employee_id, row.filled_by]) {
      if (id) coverageBy.set(id, (coverageBy.get(id) ?? 0) + 1)
    }
  }

  const shiftsByDate = new Map<string, ShiftRow[]>()
  for (const shift of shiftRows) {
    if (!shift.employee_id || shift.status === "absent") continue
    shiftsByDate.set(shift.date, [...(shiftsByDate.get(shift.date) ?? []), shift])
  }
  const pairScores = new Map<string, number>()
  for (const dayShifts of shiftsByDate.values()) {
    for (let i = 0; i < dayShifts.length; i++) {
      for (let j = i + 1; j < dayShifts.length; j++) {
        const a = dayShifts[i]
        const b = dayShifts[j]
        if (!a.employee_id || !b.employee_id || a.employee_id === b.employee_id || !overlaps(a, b)) continue
        const key = [a.employee_id, b.employee_id].sort().join(":")
        pairScores.set(key, (pairScores.get(key) ?? 0) + 1)
      }
    }
  }

  return team.map(employee => {
    const linkedDocs = knowledgeRows.filter(doc => hasEmployeeLink(doc, employee))
    const tags: string[] = []
    const notes: string[] = []
    let positiveSignals = 0
    let riskSignals = 0

    for (const doc of linkedDocs) {
      const parsed = parseKnowledgeNote(doc.note)
      tags.push(...(parsed.meta.tags ?? []))
      const signal = parsed.meta.signal
      if (signal && POSITIVE_SIGNALS.has(signal)) positiveSignals += 1
      if (signal && RISK_SIGNALS.has(signal)) riskSignals += 1
      const note = parsed.body || doc.extracted || doc.title
      if (note) notes.push(`${doc.title}: ${note.slice(0, 150)}`)
    }

    const pairHints = [...pairScores.entries()]
      .map(([key, score]) => {
        const [a, b] = key.split(":")
        if (a !== employee.id && b !== employee.id) return null
        const otherId = a === employee.id ? b : a
        const other = team.find(e => e.id === otherId)
        if (!other) return null
        return {
          employeeId: other.id,
          name: other.name,
          score,
          label: score >= 3 ? "eingespielt" as const : "prüfen" as const,
          reason: `${score} gemeinsame überlappende Schichten in ${days} Tagen`,
        }
      })
      .filter((value): value is EmployeePairHint => value !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const row = {
      employeeId: employee.id,
      name: employee.name,
      position: employee.position || "ohne Position",
      employmentType: employee.employment_type || "?",
      workedHours: Math.round((workedBy.get(employee.id) ?? 0) * 10) / 10,
      plannedHours: Math.round((plannedBy.get(employee.id) ?? 0) * 10) / 10,
      absenceDays: absenceDaysBy.get(employee.id) ?? 0,
      sickDays: sickDaysBy.get(employee.id) ?? 0,
      pendingAbsences: pendingBy.get(employee.id) ?? 0,
      shiftsWithoutEntry: missingEntryBy.get(employee.id) ?? 0,
      coverageCount: coverageBy.get(employee.id) ?? 0,
      knowledgeCount: linkedDocs.length,
      positiveSignals,
      riskSignals,
      tags: [...new Set(tags)].slice(0, 8),
      notes: notes.slice(0, 4),
      pairHints,
      recommendation: "",
    }

    return { ...row, recommendation: recommendationFor(row) }
  })
}

export function formatEmployeeIntelligenceForAgent(intelligence: EmployeeIntelligence[], maxRows = 18): string {
  const rows = intelligence.slice(0, maxRows).map(row => {
    const pairs = row.pairHints.length
      ? ` | Teamfit: ${row.pairHints.map(p => `${p.name} (${p.label}, ${p.score}x)`).join(", ")}`
      : ""
    const tags = row.tags.length ? ` | Tags: ${row.tags.join(", ")}` : ""
    const notes = row.notes.length ? `\n  Wissensnotizen: ${row.notes.join(" / ")}` : ""
    return `- ${row.name} (${row.position}, ${row.employmentType}): Ist ${row.workedHours} h, Plan ${row.plannedHours} h, Abwesenheit ${row.absenceDays} T (${row.sickDays} krank), offene Anträge ${row.pendingAbsences}, Zeitprüfung ${row.shiftsWithoutEntry}, Wissen +${row.positiveSignals}/!${row.riskSignals}. Empfehlung: ${row.recommendation}${pairs}${tags}${notes}`
  })
  return rows.join("\n") || "(keine Mitarbeiterdaten)"
}
