import { NextResponse } from "next/server"
import { getCurrentStaff } from "@/lib/staff"
import { isEmailConfigured } from "@/lib/email"

export const runtime = "nodejs"

export async function GET() {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  return NextResponse.json({ configured: isEmailConfigured() })
}
