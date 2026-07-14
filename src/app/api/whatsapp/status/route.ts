import { NextResponse } from "next/server"
import { getCurrentStaff } from "@/lib/staff"
import { isWhatsAppConfigured } from "@/lib/whatsapp"

export const runtime = "nodejs"

export async function GET() {
  const staff = await getCurrentStaff()
  if (!staff?.isManager) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 })
  return NextResponse.json({ configured: isWhatsAppConfigured() })
}
