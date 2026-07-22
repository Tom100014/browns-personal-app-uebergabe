import { NextResponse } from "next/server"
import { getCurrentStaff } from "@/lib/staff"
import { isEmailConfigured, sendEmail } from "@/lib/email"

export const runtime = "nodejs"

export async function GET() {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  return NextResponse.json({
    configured: isEmailConfigured(),
    from: process.env.RESEND_FROM || null,
  })
}

export async function POST(req: Request) {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })

  try {
    const { to } = await req.json()
    const recipient = to || staff.employee?.email
    if (!recipient) return NextResponse.json({ error: "Keine Ziel-E-Mail-Adresse angegeben." }, { status: 400 })

    const result = await sendEmail([recipient], "Test-E-Mail von Browns Perso", "Dies ist eine Test-E-Mail zur Überprüfung deines Resend-Setups.")
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true, recipient })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Fehler beim Testen."
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
