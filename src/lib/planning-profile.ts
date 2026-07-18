export const PLANNING_EMAIL_SUFFIX = ".plan@browns.local"

export const PLANNING_POSITIONS = [
  "Service",
  "Theke",
  "Küche",
  "Spüle",
  "Bar",
  "Kasse",
  "Reinigung",
  "Leitung",
] as const

const PROFILE_COLORS = ["#0F766E", "#2563EB", "#7C3AED", "#C2410C", "#BE123C", "#4D7C0F", "#0369A1"]

export function normalizePlanningName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function planningNameKey(value: unknown): string {
  return normalizePlanningName(value)
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function isValidPlanningName(value: unknown): boolean {
  const name = normalizePlanningName(value)
  return name.length >= 2
    && name.length <= 80
    && /\p{L}/u.test(name)
    && !/[\u0000-\u001f\u007f<>]/.test(name)
    && !/^[=+\-@]/.test(name)
    && planningNameKey(name).length > 0
}

export function normalizePlanningPosition(value: unknown): string {
  const position = typeof value === "string" ? value.trim() : ""
  return PLANNING_POSITIONS.find(item => item.toLocaleLowerCase("de-DE") === position.toLocaleLowerCase("de-DE")) ?? "Service"
}

export function isPlanningProfileEmail(value: unknown): boolean {
  return typeof value === "string" && value.toLocaleLowerCase("de-DE").endsWith(PLANNING_EMAIL_SUFFIX)
}

export function planningEmailLocalPart(name: string): string {
  return normalizePlanningName(name)
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48) || "mitarbeiter"
}

export function nextPlanningEmail(name: string, usedEmails: Iterable<string>): string {
  const used = new Set(Array.from(usedEmails, email => email.toLocaleLowerCase("de-DE")))
  const localPart = planningEmailLocalPart(name)
  let suffix = 1
  let candidate = `${localPart}${PLANNING_EMAIL_SUFFIX}`
  while (used.has(candidate)) {
    suffix += 1
    candidate = `${localPart}.${suffix}${PLANNING_EMAIL_SUFFIX}`
  }
  return candidate
}

export function planningProfileColor(name: string): string {
  const score = Array.from(planningNameKey(name)).reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return PROFILE_COLORS[score % PROFILE_COLORS.length]
}

export function hasAmbiguousPlanningFirstName(name: string, candidateNames: Iterable<string>): boolean {
  const key = planningNameKey(name)
  if (!key || key.includes(" ")) return false
  return Array.from(candidateNames, planningNameKey).some(candidate => candidate !== key && candidate.split(" ")[0] === key)
}

type PlanningRowCandidate = {
  employeeName: string
  employeeId: string | null
  duplicate: boolean
  errors: string[]
}

export function canCreatePlanningProfileForRow(row: PlanningRowCandidate, existingNames: Iterable<string>): boolean {
  return row.employeeName.length > 0
    && !row.employeeId
    && !row.duplicate
    && row.errors.length === 1
    && row.errors[0] === "Mitarbeiter nicht gefunden"
    && !hasAmbiguousPlanningFirstName(row.employeeName, existingNames)
}

export function safeCsvCell(value: unknown): string {
  const text = String(value ?? "")
  const neutralized = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${neutralized.replace(/"/g, '""')}"`
}
