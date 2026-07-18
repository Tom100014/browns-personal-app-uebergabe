import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals"
import { createWebVitalPayload } from "@/lib/monitoring"

const endpoint = process.env.NEXT_PUBLIC_WEB_VITALS_ENDPOINT || "/api/monitoring/web-vitals"

function reportWebVital(metric: Metric) {
  const body = JSON.stringify(createWebVitalPayload(metric, window.location.href))
  const beaconBody = new Blob([body], { type: "application/json" })

  if (navigator.sendBeacon?.(endpoint, beaconBody)) return

  void fetch(endpoint, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined)
}

declare global {
  var __brownsWebVitalsInitialized: boolean | undefined
}

if (!globalThis.__brownsWebVitalsInitialized) {
  globalThis.__brownsWebVitalsInitialized = true
  onCLS(reportWebVital)
  onFCP(reportWebVital)
  onINP(reportWebVital)
  onLCP(reportWebVital)
  onTTFB(reportWebVital)
}
