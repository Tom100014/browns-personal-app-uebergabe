import { NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import {
  canManageAccessTarget,
  isProtectedOwnerTarget,
  isUuid,
  normalizeEmail,
  OWNER_EMAIL,
} from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation, writeSecurityAudit } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin

  const staff = await getCurrentStaff()
  if (!staff?.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const limited = await enforceRateLimit(request, "revoke-access", 6, 10 * 60_000, staff.userId)
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const employeeId = body?.employeeId
  if (!isUuid(employeeId)) return jsonNoStore({ error: "Gültige employeeId erforderlich" }, { status: 400 })

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
    return jsonNoStore({ error: "Der Inhaber- oder Hauptadminzugang kann nicht storniert werden." }, { status: 403 })
  }
  if (employee.auth_user_id === staff.userId) {
    return jsonNoStore({ error: "Der eigene Zugang kann nicht storniert werden." }, { status: 400 })
  }
  if (!employee.auth_user_id) return jsonNoStore({ ok: true })
  if (!await writeSecurityAudit(staff, "Zugangssperre angefordert", { targetEmployeeId: employee.id })) {
    return jsonNoStore({ error: "Sicherheitsprotokoll nicht verfügbar" }, { status: 503 })
  }

  const { data: authLookup, error: authLookupError } = await admin.auth.admin.getUserById(employee.auth_user_id)
  if (authLookupError) return jsonNoStore({ error: "Zugang konnte nicht geprüft werden" }, { status: 500 })
  if (normalizeEmail(authLookup.user?.email) === OWNER_EMAIL) {
    return jsonNoStore({ error: "Der Inhaberzugang kann nicht storniert werden." }, { status: 403 })
  }

  const { data: linkedEmployees, error: linkLookupError } = await admin.from("employees")
    .select("id")
    .eq("auth_user_id", employee.auth_user_id)
  if (linkLookupError) return jsonNoStore({ error: "Zugang konnte nicht geprüft werden" }, { status: 500 })
  if ((linkedEmployees ?? []).some(linked => linked.id !== employee.id)) {
    return jsonNoStore({ error: "Der Login ist mit mehreren Mitarbeitern verknüpft und wurde nicht gesperrt." }, { status: 409 })
  }

  const { error: authError } = await admin.auth.admin.updateUserById(employee.auth_user_id, { ban_duration: "876000h" })
  if (authError) return jsonNoStore({ error: "Zugang konnte nicht gesperrt werden" }, { status: 400 })

  const { error: employeeError } = await admin.from("employees").update({ auth_user_id: null }).eq("id", employee.id)
  if (employeeError) {
    await admin.auth.admin.updateUserById(employee.auth_user_id, { ban_duration: "none" })
    return jsonNoStore({ error: "Zugang konnte nicht storniert werden" }, { status: 500 })
  }
  await writeSecurityAudit(staff, "Zugang gesperrt", { targetEmployeeId: employee.id })
  return jsonNoStore({ ok: true })
}
