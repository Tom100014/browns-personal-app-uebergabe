import type { SupabaseClient } from "@supabase/supabase-js"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import type { Employee, Shift } from "@/types"

type AbsenceLike = {
  id: string
  employee_id: string
  type: string
  start_date: string
  end_date: string
}

type AbsenceRow = {
  employee_id: string
  start_date: string
  end_date: string
  status: string
}

/** Two time ranges overlap (zero-padded HH:MM[:SS] strings compare lexicographically). */
function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Date falls within an inclusive [start, end] range. */
function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

/**
 * Rank employees who could cover a given shift gap.
 * Eligible = not the absent person, no clashing shift, no overlapping absence.
 * Same-position candidates are surfaced first.
 */
export function rankCandidates(
  gap: { date: string; start_time: string; end_time: string; position?: string | null },
  employees: Employee[],
  allShifts: Shift[],
  absences: AbsenceRow[],
  excludeEmployeeId: string,
  samePositionOnly = false,
): Employee[] {
  const eligible = employees.filter((emp) => {
    if (emp.id === excludeEmployeeId) return false

    const hasClashingShift = allShifts.some(
      (s) =>
        s.employee_id === emp.id &&
        s.date === gap.date &&
        timesOverlap(s.start_time, s.end_time, gap.start_time, gap.end_time),
    )
    if (hasClashingShift) return false

    const isAway = absences.some(
      (a) =>
        a.employee_id === emp.id &&
        a.status !== "rejected" &&
        dateInRange(gap.date, a.start_date, a.end_date),
    )
    if (isAway) return false

    return true
  })

  const pool = samePositionOnly ? eligible.filter((e) => e.position === gap.position) : eligible
  return pool.sort((a, b) => {
    const aMatch = a.position === gap.position ? 0 : 1
    const bMatch = b.position === gap.position ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    return a.name.localeCompare(b.name)
  })
}

export type AutomationMode = "vorschlag"
export type AutomationSettings = { mode: AutomationMode; samePositionOnly: boolean }

/** Read the configured replacement automation mode (defaults to suggestion + approval). */
export async function getAutomation(supabase: SupabaseClient): Promise<AutomationSettings> {
  const { data } = await supabase.from("settings").select("value").eq("key", "automation").maybeSingle()
  try {
    if (data?.value) {
      const j = JSON.parse(data.value)
      return { mode: "vorschlag", samePositionOnly: !!j.samePositionOnly }
    }
  } catch { /* ignore */ }
  return { mode: "vorschlag", samePositionOnly: false }
}

export function formatDayLabel(date: string): string {
  return format(new Date(date), "EEE dd.MM.", { locale: de })
}

function hhmm(t?: string | null): string {
  return (t ?? "").slice(0, 5)
}

/**
 * Open a coverage request for a single shift (e.g. an employee gives up their
 * own shift). Marks the shift absent, suggests the best replacement, and posts
 * a request into the team chat. Returns true if a request was opened.
 */
export async function requestShiftCoverage(
  supabase: SupabaseClient,
  shiftId: string,
): Promise<boolean> {
  const { data: shift } = await supabase.from("shifts").select("*").eq("id", shiftId).single()
  if (!shift) return false

  const [{ data: employees }, { data: allShifts }, { data: absRows }] = await Promise.all([
    supabase.from("employees").select("*"),
    supabase.from("shifts").select("id,employee_id,date,start_time,end_time").eq("date", shift.date),
    supabase.from("absences").select("employee_id,start_date,end_date,status"),
  ])

  const emps = (employees ?? []) as Employee[]
  const giver = emps.find(e => e.id === shift.employee_id)
  const automation = await getAutomation(supabase)
  const candidates = rankCandidates(
    { date: shift.date, start_time: shift.start_time, end_time: shift.end_time, position: shift.position },
    emps,
    (allShifts ?? []) as Shift[],
    (absRows ?? []) as AbsenceRow[],
    shift.employee_id ?? "",
    automation.samePositionOnly,
  )
  const suggested = candidates[0] ?? null

  const { data: req } = await supabase.from("coverage_requests").insert({
    shift_id: shift.id,
    original_employee_id: shift.employee_id,
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    position: shift.position,
    reason: "abgegeben",
    status: "open",
    suggested_employee_id: suggested?.id ?? null,
  }).select().single()
  if (!req) return false

  await supabase.from("shifts").update({ status: "absent" }).eq("id", shift.id)

  const content =
    `🔁 Schicht abgegeben: ${giver?.name ?? "Ein Mitarbeiter"} kann die Schicht ${shift.position} am ` +
    `${formatDayLabel(shift.date)} ${hhmm(shift.start_time)}–${hhmm(shift.end_time)} Uhr nicht übernehmen. ` +
    (suggested ? `Vorschlag: ${suggested.name}. ` : "") +
    `Wer kann einspringen?`

  await supabase.from("messages").insert({
    employee_id: null,
    content,
    type: "coverage_request",
    meta: { request_id: req.id, candidate_ids: candidates.map(c => c.id), suggested_id: suggested?.id ?? null },
    created_at: new Date().toISOString(),
  })
  return true
}

/**
 * When an absence is filed that collides with planned shifts, open a coverage
 * request per affected shift, mark the shift absent, suggest the best
 * replacement, and post a request into the team chat for volunteers.
 * Returns the number of gaps opened.
 */
export async function triggerCoverageForAbsence(
  supabase: SupabaseClient,
  absence: AbsenceLike,
): Promise<number> {
  // 1. Affected shifts: the absent employee's planned shifts within the range.
  const { data: affected } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", absence.employee_id)
    .gte("date", absence.start_date)
    .lte("date", absence.end_date)
    .neq("status", "absent")

  const shifts = (affected ?? []) as Shift[]
  if (shifts.length === 0) return 0

  // 2. Context for ranking candidates.
  const dates = [...new Set(shifts.map((s) => s.date))]
  const [{ data: employees }, { data: allShifts }, { data: absRows }] = await Promise.all([
    supabase.from("employees").select("*"),
    supabase.from("shifts").select("id,employee_id,date,start_time,end_time").in("date", dates),
    supabase.from("absences").select("employee_id,start_date,end_date,status"),
  ])

  const emps = (employees ?? []) as Employee[]
  const shiftRows = (allShifts ?? []) as Shift[]
  const absenceRows = (absRows ?? []) as AbsenceRow[]
  const absentEmp = emps.find((e) => e.id === absence.employee_id)
  const automation = await getAutomation(supabase)

  let opened = 0

  for (const shift of shifts) {
    const candidates = rankCandidates(
      { date: shift.date, start_time: shift.start_time, end_time: shift.end_time, position: shift.position },
      emps,
      shiftRows,
      absenceRows,
      absence.employee_id,
      automation.samePositionOnly,
    )
    const suggested = candidates[0] ?? null

    const { data: req } = await supabase
      .from("coverage_requests")
      .insert({
        shift_id: shift.id,
        absence_id: absence.id,
        original_employee_id: absence.employee_id,
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        position: shift.position,
        reason: absence.type,
        status: "open",
        suggested_employee_id: suggested?.id ?? null,
      })
      .select()
      .single()

    if (!req) continue
    opened++

    // Mark the original shift as absent so the gap is visible in the plan.
    await supabase.from("shifts").update({ status: "absent" }).eq("id", shift.id)

    // Announce in the team chat and ask for volunteers.
    const content =
      `🆘 Ersatz gesucht: ${absentEmp?.name ?? "Ein Mitarbeiter"} ist für diese Schicht nicht verfügbar. ` +
      `Schicht ${shift.position} am ${formatDayLabel(shift.date)} ` +
      `${hhmm(shift.start_time)}–${hhmm(shift.end_time)} Uhr. ` +
      (suggested ? `Vorschlag: ${suggested.name}. ` : "") +
      `Wer kann übernehmen?`

    await supabase.from("messages").insert({
      employee_id: null,
      content,
      type: "coverage_request",
      meta: {
        request_id: req.id,
        candidate_ids: candidates.map((c) => c.id),
        suggested_id: suggested?.id ?? null,
      },
      created_at: new Date().toISOString(),
    })
  }

  return opened
}
