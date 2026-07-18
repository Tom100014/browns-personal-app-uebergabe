import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import {
  hasAmbiguousPlanningFirstName,
  isValidPlanningName,
  nextPlanningEmail,
  normalizePlanningName,
  normalizePlanningPosition,
  planningNameKey,
  planningProfileColor,
} from "@/lib/planning-profile"
import { isUuid } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

export const runtime = "nodejs"

const MAX_IMPORT_ROWS = 1_000

type ImportRowInput = {
  employeeId?: unknown
  employeeName?: unknown
  date?: unknown
  start?: unknown
  end?: unknown
  position?: unknown
  note?: unknown
}

type ExistingEmployee = {
  id: string
  name: string
  email: string
  position: string
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff?.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const limited = await enforceRateLimit(request, "shift-import", 10, 10 * 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const importId = typeof body?.importId === "string" ? body.importId : ""
  const rawRows = Array.isArray(body?.rows) ? body.rows as ImportRowInput[] : []
  if (!isUuid(importId) || rawRows.length === 0 || rawRows.length > MAX_IMPORT_ROWS) {
    return jsonNoStore({ error: `Gültige Import-ID und 1 bis ${MAX_IMPORT_ROWS} Schichten erforderlich` }, { status: 400 })
  }

  const rows: {
    employeeId: string | null
    employeeName: string
    date: string
    start: string
    end: string
    position: string
    note: string | null
  }[] = []

  for (const row of rawRows) {
    const employeeId = typeof row.employeeId === "string" && row.employeeId ? row.employeeId : null
    const employeeName = normalizePlanningName(row.employeeName)
    const note = typeof row.note === "string" ? row.note.trim().slice(0, 500) : ""
    if ((employeeId && !isUuid(employeeId)) || (!employeeId && !isValidPlanningName(employeeName)) || !validDate(row.date) || !validTime(row.start) || !validTime(row.end)) {
      return jsonNoStore({ error: "Mindestens eine Schicht enthält ungültige Mitarbeiter-, Datums- oder Zeitangaben" }, { status: 400 })
    }
    rows.push({
      employeeId,
      employeeName,
      date: row.date,
      start: row.start,
      end: row.end,
      position: normalizePlanningPosition(row.position),
      note: note || null,
    })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: employeeData, error: lookupError } = await admin.from("employees").select("id,name,email,position")
  if (lookupError) return jsonNoStore({ error: "Mitarbeiter konnten nicht geprüft werden" }, { status: 500 })

  const existing = (employeeData ?? []) as ExistingEmployee[]
  const existingById = new Map(existing.map(employee => [employee.id, employee]))
  const employeesByName = new Map<string, ExistingEmployee[]>()
  existing.forEach(employee => {
    const key = planningNameKey(employee.name)
    employeesByName.set(key, [...(employeesByName.get(key) ?? []), employee])
  })

  const requestedProfiles = new Map<string, { name: string; position: string }>()
  rows.filter(row => !row.employeeId).forEach(row => {
    const key = planningNameKey(row.employeeName)
    if (!requestedProfiles.has(key)) requestedProfiles.set(key, { name: row.employeeName, position: row.position })
  })

  const allKnownNames = [...existing.map(employee => employee.name), ...Array.from(requestedProfiles.values(), profile => profile.name)]
  for (const [key, profile] of requestedProfiles) {
    if ((employeesByName.get(key)?.length ?? 0) > 1 || hasAmbiguousPlanningFirstName(profile.name, allKnownNames)) {
      return jsonNoStore({ error: `Der Name „${profile.name}“ ist nicht eindeutig. Bitte im Import einen vorhandenen Mitarbeiter auswählen oder den vollständigen Namen eintragen.` }, { status: 409 })
    }
  }

  for (const row of rows) {
    if (row.employeeId && !existingById.has(row.employeeId)) {
      return jsonNoStore({ error: "Ein zugeordneter Mitarbeiter ist nicht mehr vorhanden. Bitte die Datei erneut prüfen." }, { status: 409 })
    }
  }

  const usedEmails = new Set(existing.map(employee => String(employee.email ?? "").toLocaleLowerCase("de-DE")))
  const profiles = Array.from(requestedProfiles.entries())
    .filter(([key]) => !employeesByName.has(key))
    .map(([key, profile]) => {
      const email = nextPlanningEmail(profile.name, usedEmails)
      usedEmails.add(email)
      const employee: ExistingEmployee = {
        id: randomUUID(),
        name: profile.name,
        email,
        position: profile.position,
      }
      employeesByName.set(key, [employee])
      return {
        ...employee,
        role: "employee",
        employmentType: "Aushilfe",
        color: planningProfileColor(profile.name),
      }
    })

  const preparedShifts: {
    id: string
    employeeId: string
    date: string
    start: string
    end: string
    position: string
    note: string | null
  }[] = []
  for (const row of rows) {
    const employee = row.employeeId ? existingById.get(row.employeeId) : employeesByName.get(planningNameKey(row.employeeName))?.[0]
    if (!employee) return jsonNoStore({ error: "Mitarbeiter konnte nicht eindeutig aufgelöst werden" }, { status: 409 })
    preparedShifts.push({
      id: randomUUID(),
      employeeId: employee.id,
      date: row.date,
      start: row.start,
      end: row.end,
      position: row.position,
      note: row.note,
    })
  }

  const { data: importResult, error: importError } = await admin.rpc("import_shifts_with_profiles", {
    p_import_id: importId,
    p_actor: staff.email || staff.userId,
    p_actor_user_id: staff.userId,
    p_profiles: profiles,
    p_shifts: preparedShifts,
  })
  if (importError) return jsonNoStore({ error: "Der Dienstplanimport konnte nicht vollständig gespeichert werden" }, { status: 500 })

  const result = Array.isArray(importResult) ? importResult[0] : importResult
  const shiftIds = Array.isArray(result?.shift_ids) ? result.shift_ids as string[] : []
  const employeeIds = Array.isArray(result?.created_employee_ids) ? result.created_employee_ids as string[] : []
  const duplicateCount = Number(result?.duplicate_count ?? 0)
  const { data: insertedShifts, error: shiftLookupError } = shiftIds.length > 0
    ? await admin.from("shifts").select("*, employee:employees(id,name,role,position,color,avatar,employment_type)").in("id", shiftIds)
    : { data: [], error: null }
  if (shiftLookupError) return jsonNoStore({ error: "Import wurde gespeichert, konnte aber nicht neu geladen werden" }, { status: 500 })

  return jsonNoStore({
    shifts: insertedShifts ?? [],
    createdCount: employeeIds.length,
    duplicateCount,
    reused: result?.reused === true,
  })
}
