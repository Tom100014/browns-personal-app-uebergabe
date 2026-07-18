import { NextRequest } from "next/server"
import { createClient as createAdminClient, type User } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import {
  canManageAccessTarget,
  isProtectedOwnerTarget,
  isUuid,
  isValidEmail,
  normalizeEmail,
  OWNER_EMAIL,
} from "@/lib/security-core"
import { findAuthUserByEmail, findEmployeeIdentityConflict } from "@/lib/security-access"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff?.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const limited = await enforceRateLimit(request, "set-access", 6, 10 * 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const employeeId = body?.employeeId
  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === "string" ? body.password : ""
  if (!isUuid(employeeId) || !isValidEmail(email) || password.length < 8 || password.length > 128) {
    return jsonNoStore({ error: "Gültige employeeId, email und ein Passwort mit 8 bis 128 Zeichen erforderlich" }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: employee, error: employeeLookupError }, { data: primaryAdmin, error: settingsError }] = await Promise.all([
    admin.from("employees").select("id,email,role,auth_user_id").eq("id", employeeId).maybeSingle(),
    admin.from("settings").select("value").eq("key", "primary_admin_employee_id").maybeSingle(),
  ])
  if (employeeLookupError || settingsError) return jsonNoStore({ error: "Zugang konnte nicht geprüft werden" }, { status: 500 })
  if (!employee) return jsonNoStore({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
  if (!canManageAccessTarget(staff, employee, primaryAdmin?.value)) {
    return jsonNoStore({ error: "Nur ein Admin darf Admin- oder Inhaberzugänge verwalten." }, { status: 403 })
  }
  if (isProtectedOwnerTarget(employee, primaryAdmin?.value)) {
    return jsonNoStore({ error: "Der Inhaber- oder Hauptadminzugang kann über diese Funktion nicht neu zugeordnet werden." }, { status: 403 })
  }
  if (email === OWNER_EMAIL && normalizeEmail(employee.email) !== OWNER_EMAIL) {
    return jsonNoStore({ error: "Der Inhaberzugang kann keinem anderen Mitarbeiter zugeordnet werden." }, { status: 403 })
  }
  if (!await writeSecurityAudit(staff, "Zugangsänderung angefordert", { targetEmployeeId: employee.id })) {
    return jsonNoStore({ error: "Sicherheitsprotokoll nicht verfügbar" }, { status: 503 })
  }

  let authUser: User | null
  try {
    const emailConflict = await findEmployeeIdentityConflict(admin, employee.id, email)
    if (emailConflict) {
      return jsonNoStore({ error: "Diese E-Mail-Adresse gehört bereits zu einem anderen Mitarbeiter." }, { status: 409 })
    }
    authUser = await findAuthUserByEmail(admin, email)
  } catch {
    return jsonNoStore({ error: "Zugang konnte nicht sicher geprüft werden" }, { status: 500 })
  }

  if (employee.auth_user_id && authUser?.id !== employee.auth_user_id) {
    return jsonNoStore({ error: "Dieser Mitarbeiter ist bereits mit einem anderen Login verknüpft." }, { status: 409 })
  }

  let createdUser = false
  if (!authUser) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) {
      try {
        authUser = await findAuthUserByEmail(admin, email)
      } catch {
        return jsonNoStore({ error: "Zugang konnte nicht sicher geprüft werden" }, { status: 500 })
      }
      if (!authUser) return jsonNoStore({ error: "Zugang konnte nicht erstellt werden" }, { status: 400 })
    } else {
      authUser = created.data.user
      createdUser = true
    }
  }

  if (!authUser) return jsonNoStore({ error: "Zugang konnte nicht erstellt werden" }, { status: 500 })

  try {
    const conflict = await findEmployeeIdentityConflict(admin, employee.id, email, authUser.id)
    if (conflict) {
      if (createdUser) await admin.auth.admin.deleteUser(authUser.id)
      return jsonNoStore({ error: "Dieser Login gehört bereits zu einem anderen Mitarbeiter." }, { status: 409 })
    }
  } catch {
    if (createdUser) await admin.auth.admin.deleteUser(authUser.id)
    return jsonNoStore({ error: "Zugang konnte nicht sicher geprüft werden" }, { status: 500 })
  }

  if (!createdUser) {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, { password, ban_duration: "none" })
    if (error) return jsonNoStore({ error: "Passwort konnte nicht gesetzt werden" }, { status: 400 })
  }

  const { error: linkError } = await admin.from("employees")
    .update({ auth_user_id: authUser.id, email })
    .eq("id", employee.id)
  if (linkError) {
    if (createdUser) await admin.auth.admin.deleteUser(authUser.id)
    return jsonNoStore({ error: "Zugang konnte nicht mit dem Mitarbeiter verknüpft werden" }, { status: 500 })
  }

  await writeSecurityAudit(staff, "Zugang verknüpft", { targetEmployeeId: employee.id })
  return jsonNoStore({ ok: true })
}
