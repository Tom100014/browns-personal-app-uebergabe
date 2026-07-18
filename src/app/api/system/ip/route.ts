import { NextRequest } from "next/server"
import { getCurrentStaff } from "@/lib/staff"
import { getTrustedClientIp } from "@/lib/security-core"
import { enforceRateLimit, jsonNoStore } from "@/lib/security"

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })
  if (!staff.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })

  const limited = await enforceRateLimit(request, "system-ip", 20, 10 * 60_000, staff.userId)
  if (limited) return limited
  return jsonNoStore({ ip: getTrustedClientIp(request.headers) })
}
