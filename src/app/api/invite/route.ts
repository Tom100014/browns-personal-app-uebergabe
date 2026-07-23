import { NextRequest } from "next/server"
import { createClient as createAdminClient, type User } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import {
  canManageAccessTarget,
  getTrustedAppOrigin,
  isProtectedOwnerTarget,
  isUuid,
  isValidEmail,
  normalizeEmail,
  OWNER_EMAIL,
} from "@/lib/security-core"
import { findAuthUserByEmail, findEmployeeIdentityConflict } from "@/lib/security-access"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff?.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const limited = await enforceRateLimit(request, "invite", 50, 10 * 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const employeeId = body?.employeeId
  const email = normalizeEmail(body?.email)
  if (!isUuid(employeeId) || !isValidEmail(email)) {
    return jsonNoStore({ error: "Gültige employeeId und email erforderlich" }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) return jsonNoStore({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: employee, error: employeeLookupError }, { data: primaryAdmin, error: settingsError }] = await Promise.all([
    admin.from("employees").select("id,name,email,role,auth_user_id").eq("id", employeeId).maybeSingle(),
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
  if (!await writeSecurityAudit(staff, "Einladung angefordert", { targetEmployeeId: employee.id })) {
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

  // E-Mail-Aenderung bei bestehendem Login: denselben Auth-User umbenennen,
  // statt die Einladung an die neue Adresse zu blockieren.
  if (employee.auth_user_id && authUser && authUser.id !== employee.auth_user_id) {
    return jsonNoStore({ error: "Dieser Mitarbeiter ist bereits mit einem anderen Login verknüpft." }, { status: 409 })
  }
  if (employee.auth_user_id && !authUser) {
    const { error: renameError } = await admin.auth.admin.updateUserById(employee.auth_user_id, { email })
    if (renameError) return jsonNoStore({ error: "E-Mail konnte nicht geändert werden" }, { status: 400 })
    authUser = { id: employee.auth_user_id } as User
  }

  let reinvited = false
  let createdUser = false
  const redirectTo = `${getTrustedAppOrigin(request.nextUrl.origin)}/willkommen`

  if (!authUser) {
    const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (invited.error) {
      try {
        authUser = await findAuthUserByEmail(admin, email)
      } catch {
        return jsonNoStore({ error: "Zugang konnte nicht sicher geprüft werden" }, { status: 500 })
      }
      if (!authUser) return jsonNoStore({ error: "Einladung konnte nicht gesendet werden" }, { status: 400 })
      reinvited = true
    } else {
      authUser = invited.data.user
      createdUser = true
    }
  } else {
    reinvited = true
  }

  if (!authUser) return jsonNoStore({ error: "Einladung konnte nicht erstellt werden" }, { status: 500 })

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

  if (reinvited) {
    const { error: unbanError } = await admin.auth.admin.updateUserById(authUser.id, { ban_duration: "none" })
    if (unbanError) return jsonNoStore({ error: "Einladung konnte nicht erneuert werden" }, { status: 400 })
    const { error: recoveryError } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
    if (recoveryError) return jsonNoStore({ error: "Einladung konnte nicht erneuert werden" }, { status: 400 })
  }

  const { error: linkError } = await admin.from("employees")
    .update({ auth_user_id: authUser.id, email })
    .eq("id", employee.id)
  if (linkError) {
    if (createdUser) await admin.auth.admin.deleteUser(authUser.id)
    return jsonNoStore({ error: "Einladung konnte nicht mit dem Mitarbeiter verknüpft werden" }, { status: 500 })
  }

  // Sende ausführliche E-Mail-Einleitung an den Mitarbeiter per Resend
  const inviteText = `Hallo ${employee.name || "Mitarbeiter"},\n\nhier ist dein Zugang zur Browns Personal App:\n${redirectTo}\n\nE-Mail (Login): ${email}\n\nAnleitung zum Einrichten:\n1. Öffne die App auf deinem Smartphone\n2. Auf iPhone: Teilen -> "Zum Home-Bildschirm"\n3. Auf Android: Menü -> "App installieren"\n4. Erlaube Push-Benachrichtigungen für Schicht-Erinnerungen.\n5. Passwort kannst du in der App unter "Mein Profil" oder auf der Login-Seite über "Passwort vergessen?" jederzeit verwalten.`

  const emailResult = await sendEmail([email], "Willkommen bei Browns Personal App — Dein Zugang", inviteText, redirectTo)

  await writeSecurityAudit(staff, "Einladung verarbeitet", { targetEmployeeId: employee.id, reinvited })
  return jsonNoStore({ ok: true, reinvited, emailSent: emailResult.success, emailError: emailResult.error })
}
