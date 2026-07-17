import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { createClient as createServer } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })

  const { employeeId } = await request.json().catch(() => ({}))
  if (!employeeId) return NextResponse.json({ error: "employeeId erforderlich" }, { status: 400 })

  const supabase = await createServer()
  const [{ data: employee }, { data: primaryAdmin }] = await Promise.all([
    supabase.from("employees").select("id,name,role,auth_user_id").eq("id", employeeId).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "primary_admin_employee_id").maybeSingle(),
  ])
  if (!employee) return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 })
  if (primaryAdmin?.value === employee.id) return NextResponse.json({ error: "Der Zugang der Hauptberechtigten kann nicht storniert werden." }, { status: 400 })
  if (employee.auth_user_id === staff.userId) return NextResponse.json({ error: "Der eigene Zugang kann nicht storniert werden." }, { status: 400 })
  if (employee.role === "admin" && staff.employee && staff.employee.role !== "admin") {
    return NextResponse.json({ error: "Nur ein Admin darf einen anderen Admin-Zugang stornieren." }, { status: 403 })
  }
  if (!employee.auth_user_id) return NextResponse.json({ ok: true })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) return NextResponse.json({ error: "Server nicht konfiguriert" }, { status: 500 })

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } })
  const { error: authError } = await admin.auth.admin.updateUserById(employee.auth_user_id, { ban_duration: "876000h" })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const { error: employeeError } = await supabase.from("employees").update({ auth_user_id: null }).eq("id", employee.id)
  if (employeeError) return NextResponse.json({ error: employeeError.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
