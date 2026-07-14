import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getCurrentStaff } from "@/lib/staff"
import { createClient as createServer } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  // Only management may invite staff.
  const staff = await getCurrentStaff()
  if (!staff?.isManager) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  }

  const { employeeId, email } = await request.json().catch(() => ({}))
  if (!employeeId || !email) {
    return NextResponse.json({ error: "employeeId und email erforderlich" }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Server nicht konfiguriert (Service-Key fehlt)" }, { status: 500 })
  }

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } })
  const origin = request.nextUrl.origin
  const redirectTo = `${origin}/willkommen`

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (error) {
    // If the user already exists, send a fresh invite/recovery link instead.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    })
    if (linkErr) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const userId = linkData.user?.id
    if (userId) {
      const supabase = await createServer()
      await supabase.from("employees").update({ auth_user_id: userId }).eq("id", employeeId)
    }
    return NextResponse.json({ ok: true, reinvited: true })
  }

  // Link the freshly created auth user to the employee record.
  const userId = data.user?.id
  if (userId) {
    const supabase = await createServer()
    await supabase.from("employees").update({ auth_user_id: userId }).eq("id", employeeId)
  }

  return NextResponse.json({ ok: true })
}
