export const WEB_VITAL_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const

export type WebVitalName = (typeof WEB_VITAL_NAMES)[number]
export type WebVitalRating = "good" | "needs-improvement" | "poor"

export type WebVitalInput = {
  id: string
  name: string
  value: number
  delta: number
  rating: string
  navigationType?: string
}

export type WebVitalPayload = {
  id: string
  name: WebVitalName
  value: number
  delta: number
  rating: WebVitalRating
  navigationType: string
  path: string
  timestamp: number
}

export function sanitizeMonitoringPath(value: string): string {
  try {
    return new URL(value, "https://monitoring.local").pathname.slice(0, 2048) || "/"
  } catch {
    return "/"
  }
}

export function createWebVitalPayload(metric: WebVitalInput, path: string, timestamp = Date.now()): WebVitalPayload {
  return {
    id: metric.id.slice(0, 128),
    name: metric.name as WebVitalName,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating as WebVitalRating,
    navigationType: (metric.navigationType ?? "unknown").slice(0, 64),
    path: sanitizeMonitoringPath(path),
    timestamp,
  }
}

export function isWebVitalPayload(value: unknown): value is WebVitalPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.id === "string" && payload.id.length > 0 && payload.id.length <= 128 &&
    WEB_VITAL_NAMES.includes(payload.name as WebVitalName) &&
    typeof payload.value === "number" && Number.isFinite(payload.value) && payload.value >= 0 &&
    typeof payload.delta === "number" && Number.isFinite(payload.delta) &&
    (payload.rating === "good" || payload.rating === "needs-improvement" || payload.rating === "poor") &&
    typeof payload.navigationType === "string" && payload.navigationType.length <= 64 &&
    typeof payload.path === "string" && payload.path.startsWith("/") && payload.path.length <= 2048 &&
    typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp) && payload.timestamp > 0
  )
}
