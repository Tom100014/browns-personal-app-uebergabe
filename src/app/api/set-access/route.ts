import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { createClient as createServer } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const { employeeId, email, password } = await request.json().catch(() => ({}))
  if (!employeeId || !email || !password) {
    return NextResponse.json({ error: "employeeId, email und password erforderlich" }, { status: 400 })
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "Passwort muss mindestens 8 Zeichen haben" }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Server nicht konfiguriert" }, { status: 500 })
  }

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } })

  // Create the auth user with a password, or update the password if it exists.
  let userId: string | undefined
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers()
    const existing = list?.users.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
    if (!existing) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    await admin.auth.admin.updateUserById(existing.id, { password })
    userId = existing.id
  } else {
    userId = data.user?.id
  }

  if (userId) {
    const supabase = await createServer()
    await supabase.from("employees").update({ auth_user_id: userId, email }).eq("id", employeeId)
  }

  return NextResponse.json({ ok: true })
}
