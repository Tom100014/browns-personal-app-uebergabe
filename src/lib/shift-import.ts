import type { Employee, Shift } from "@/types"

export type ImportCell = string | number | boolean | null
export type ImportMatrix = ImportCell[][]

type HeaderField = "date" | "employee" | "start" | "end" | "timeRange" | "position" | "note"
type HeaderMap = Partial<Record<HeaderField, number>>

export type ShiftImportRow = {
  sourceRow: number
  employeeId: string | null
  employeeName: string
  date: string
  start: string
  end: string
  position: string
  note: string
  duplicate: boolean
  errors: string[]
}

export type ShiftImportResult = {
  mode: "list" | "matrix" | "unknown"
  headerRow: number
  rows: ShiftImportRow[]
  error?: string
}

type WeekHeader = { row: number; employeeColumn: number; dayColumns: Record<number, number> }

const WEEKDAY_ALIASES: Record<number, string[]> = {
  0: ["montag", "mo", "monday"],
  1: ["dienstag", "di", "tuesday"],
  2: ["mittwoch", "mi", "wednesday"],
  3: ["donnerstag", "do", "thursday"],
  4: ["freitag", "fr", "friday"],
  5: ["samstag", "sa", "saturday"],
  6: ["sonntag", "so", "sunday"],
}

const HEADER_ALIASES: Record<HeaderField, string[]> = {
  date: ["datum", "date", "tag", "arbeitstag", "schichtdatum"],
  employee: ["mitarbeiter", "mitarbeiterin", "name", "personal", "person", "employee", "teammitglied"],
  start: ["von", "beginn", "start", "startzeit", "arbeitsbeginn", "schichtbeginn"],
  end: ["bis", "ende", "end", "endzeit", "arbeitsende", "schichtende"],
  timeRange: ["zeit", "uhrzeit", "arbeitszeit", "schichtzeit", "vonbis", "zeitraum"],
  position: ["position", "station", "bereich", "arbeitsbereich", "rolle", "einsatz"],
  note: ["notiz", "bemerkung", "hinweis", "kommentar", "info"],
}

function cleanToken(value: ImportCell): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

function cleanName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function headerMap(row: ImportCell[]): HeaderMap {
  const result: HeaderMap = {}
  row.forEach((cell, index) => {
    const token = cleanToken(cell)
    const field = (Object.keys(HEADER_ALIASES) as HeaderField[]).find(key => HEADER_ALIASES[key].includes(token))
    if (field && result[field] == null) result[field] = index
  })
  return result
}

function isUsableHeader(map: HeaderMap): boolean {
  return map.date != null && map.employee != null && (map.timeRange != null || (map.start != null && map.end != null))
}

function findHeader(matrix: ImportMatrix): { row: number; map: HeaderMap } | null {
  let best: { row: number; map: HeaderMap; score: number } | null = null
  const candidates = matrix.slice(0, 15)
  for (let index = 0; index < candidates.length; index += 1) {
    const map = headerMap(candidates[index])
    const score = Object.keys(map).length
    if (isUsableHeader(map) && (!best || score > best.score)) best = { row: index, map, score }
  }
  return best ? { row: best.row, map: best.map } : null
}

function findWeekHeader(matrix: ImportMatrix): WeekHeader | null {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex += 1) {
    const row = matrix[rowIndex]
    const employeeColumn = row.findIndex(cell => HEADER_ALIASES.employee.includes(cleanToken(cell)))
    if (employeeColumn < 0) continue
    const dayColumns: Record<number, number> = {}
    row.forEach((cell, column) => {
      const token = cleanToken(cell)
      const day = Object.keys(WEEKDAY_ALIASES).map(Number).find(index => WEEKDAY_ALIASES[index].includes(token))
      if (day != null) dayColumns[day] = column
    })
    if (Object.keys(dayColumns).length >= 5) return { row: rowIndex, employeeColumn, dayColumns }
  }
  return null
}

function validDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ""
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function normalizeDate(value: ImportCell): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 1000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return validDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
  }
  const text = String(value ?? "").trim()
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3])
    return validDate(year, Number(match[2]), Number(match[1]))
  }
  return ""
}

function normalizeTime(value: ImportCell): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = value >= 1 ? value % 1 : value
    if (value >= 1 && value <= 24 && Number.isInteger(value)) return `${String(value).padStart(2, "0")}:00`
    const minutes = Math.round(fraction * 1440) % 1440
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  }
  const text = String(value ?? "").trim()
  const isoTime = text.match(/T(\d{1,2}):(\d{2})/)
  const match = isoTime ?? text.match(/(?:^|\s)(\d{1,2})(?::|\.)(\d{2})(?:\s|Uhr|$)/i)
  if (match) {
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour < 24 && minute < 60) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  }
  if (/^\d{1,2}$/.test(text) && Number(text) < 24) return `${text.padStart(2, "0")}:00`
  return ""
}

function splitTimeRange(value: ImportCell): [string, string] {
  const matches = String(value ?? "").match(/\d{1,2}(?:(?::|\.)\d{2})?/g) ?? []
  return [normalizeTime(matches[0] ?? ""), normalizeTime(matches[1] ?? "")]
}

function splitTimeRanges(value: ImportCell): [string, string][] {
  const matches = String(value ?? "").match(/\d{1,2}(?:(?::|\.)\d{2})?/g) ?? []
  const ranges: [string, string][] = []
  for (let index = 0; index + 1 < matches.length; index += 2) {
    const start = normalizeTime(matches[index])
    const end = normalizeTime(matches[index + 1])
    if (start && end) ranges.push([start, end])
  }
  return ranges
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function guessWeekStart(fileName: string): string {
  const match = fileName.match(/(?:^|\s)(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\s*(?:bis|[-–])\s*\d{1,2}[.\/-]\d{1,2}(?:[.\/-](\d{2,4}))?/i)
  if (!match) return ""
  const yearPart = match[3] || match[4]
  const year = yearPart ? (Number(yearPart) < 100 ? 2000 + Number(yearPart) : Number(yearPart)) : new Date().getFullYear()
  return validDate(year, Number(match[2]), Number(match[1]))
}

function employeeMatcher(employees: Employee[]) {
  const exact = new Map<string, Employee>()
  const firstNames = new Map<string, Employee | null>()
  employees.forEach(employee => {
    const normalized = cleanName(employee.name)
    exact.set(normalized, employee)
    exact.set(normalized.split(" ").reverse().join(" "), employee)
    const first = normalized.split(" ")[0]
    firstNames.set(first, firstNames.has(first) ? null : employee)
  })
  return (name: string): Employee | null => {
    const normalized = cleanName(name)
    return exact.get(normalized) ?? firstNames.get(normalized) ?? null
  }
}

function minutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function overlaps(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  const aStart = minutes(start)
  const aEnd = minutes(end) <= aStart ? minutes(end) + 1440 : minutes(end)
  const bStart = minutes(otherStart)
  const bEnd = minutes(otherEnd) <= bStart ? minutes(otherEnd) + 1440 : minutes(otherEnd)
  return aStart < bEnd && bStart < aEnd
}

function shiftKey(employeeId: string, date: string, start: string, end: string, position: string): string {
  return [employeeId, date, start, end, cleanToken(position)].join("|")
}

export function parseShiftImport(
  matrix: ImportMatrix,
  employees: Employee[],
  existingShifts: Shift[],
  employeeOverrides: Record<number, string> = {},
  weekStart = "",
): ShiftImportResult {
  const header = findHeader(matrix)
  const weekHeader = header ? null : findWeekHeader(matrix)
  if (!header && !weekHeader) {
    return {
      mode: "unknown",
      headerRow: -1,
      rows: [],
      error: "Format nicht erkannt. Möglich sind eine Liste mit Datum/Mitarbeiter/Von/Bis oder eine Wochenmatrix mit Name und Montag bis Sonntag.",
    }
  }

  if (weekHeader && !weekStart) {
    return { mode: "matrix", headerRow: weekHeader.row + 1, rows: [], error: "Wochenmatrix erkannt. Bitte den Montag dieser Planwoche auswählen." }
  }

  const matchEmployee = employeeMatcher(employees)
  const existingKeys = new Set(existingShifts.filter(shift => shift.employee_id).map(shift => shiftKey(
    shift.employee_id!, shift.date, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), shift.position,
  )))
  const seenKeys = new Set<string>()
  const rows: ShiftImportRow[] = []

  function addRow(sourceRow: number, rawName: string, date: string, start: string, end: string, rawPosition: string, note: string) {
    const override = employeeOverrides[sourceRow]
    const employee = employees.find(item => item.id === override) ?? matchEmployee(rawName)
    const position = rawPosition.trim() || employee?.position || "Service"
    const errors: string[] = []
    if (!rawName && !override) errors.push("Mitarbeiter fehlt")
    else if (!employee) errors.push("Mitarbeiter nicht gefunden")
    if (!date) errors.push("Datum ungültig")
    if (!start || !end) errors.push("Zeit ungültig")

    let duplicate = false
    if (employee && date && start && end) {
      const key = shiftKey(employee.id, date, start, end, position)
      duplicate = existingKeys.has(key) || seenKeys.has(key)
      if (!duplicate) {
        const existingOverlap = existingShifts.some(shift => shift.employee_id === employee.id && shift.date === date && shift.status !== "absent"
          && overlaps(start, end, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5)))
        const importOverlap = rows.some(row => row.employeeId === employee.id && row.date === date && !row.duplicate && row.errors.length === 0
          && overlaps(start, end, row.start, row.end))
        if (existingOverlap || importOverlap) errors.push("Zeit überschneidet eine andere Schicht")
      }
      seenKeys.add(key)
    }

    rows.push({
      sourceRow,
      employeeId: employee?.id ?? null,
      employeeName: employee?.name ?? (rawName || "—"),
      date,
      start,
      end,
      position,
      note,
      duplicate,
      errors,
    })
  }

  if (header) {
    matrix.slice(header.row + 1).forEach((source, offset) => {
      if (!source.some(cell => String(cell ?? "").trim())) return
      const sourceRow = header.row + offset + 2
      const rawName = String(source[header.map.employee!] ?? "").trim()
      const date = normalizeDate(source[header.map.date!])
      const range = header.map.timeRange != null ? splitTimeRange(source[header.map.timeRange]) : ["", ""] as [string, string]
      const start = header.map.start != null ? normalizeTime(source[header.map.start]) : range[0]
      const end = header.map.end != null ? normalizeTime(source[header.map.end]) : range[1]
      const position = String(header.map.position != null ? source[header.map.position] ?? "" : "")
      const note = String(header.map.note != null ? source[header.map.note] ?? "" : "").trim()
      addRow(sourceRow, rawName, date, start, end, position, note)
    })
    return { mode: "list", headerRow: header.row + 1, rows }
  }

  const unavailable = /^(?:-|x|f|frei|urlaub|krank|k|schule|wunschfrei)$/i
  matrix.slice(weekHeader!.row + 1).forEach((source, offset) => {
    const sourceRow = weekHeader!.row + offset + 2
    const rawName = String(source[weekHeader!.employeeColumn] ?? "").trim()
    if (!rawName || /^bedarf\b/i.test(rawName)) return
    const dayColumnSet = new Set(Object.values(weekHeader!.dayColumns))
    const note = source
      .map((cell, index) => ({ cell, index }))
      .filter(item => item.index > Math.max(...dayColumnSet) && !dayColumnSet.has(item.index) && String(item.cell ?? "").trim())
      .map(item => String(item.cell).trim())
      .join(" · ")
    Object.entries(weekHeader!.dayColumns).forEach(([dayText, column]) => {
      const value = source[column]
      const text = String(value ?? "").trim()
      if (!text || unavailable.test(text)) return
      const ranges = splitTimeRanges(value)
      const date = addDays(weekStart, Number(dayText))
      if (ranges.length === 0) {
        addRow(sourceRow, rawName, date, "", "", "", note || `Nicht erkannte Zeitangabe: ${text}`)
        return
      }
      ranges.forEach(([start, end]) => addRow(sourceRow, rawName, date, start, end, "", note))
    })
  })

  return {
    mode: "matrix",
    headerRow: weekHeader!.row + 1,
    rows,
    error: rows.length === 0 ? "Wochenmatrix erkannt, aber keine Zeitangaben in den Wochentagsfeldern gefunden." : undefined,
  }
}
