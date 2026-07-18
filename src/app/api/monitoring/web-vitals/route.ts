import { NextRequest } from "next/server"
import { isWebVitalPayload } from "@/lib/monitoring"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"

const MAX_BODY_BYTES = 4096

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin
  const limited = await enforceRateLimit(request, "web-vitals", 120, 10 * 60_000)
  if (limited) return limited

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonNoStore({ error: "Payload too large" }, { status: 413 })
  }

  const body = await request.text()
  if (body.length > MAX_BODY_BYTES) {
    return jsonNoStore({ error: "Payload too large" }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return jsonNoStore({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!isWebVitalPayload(payload)) {
    return jsonNoStore({ error: "Invalid metric" }, { status: 400 })
  }

  console.info("[monitoring:web-vital]", JSON.stringify(payload))
  return new Response(null, { status: 204 })
}
