import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Native Node strip-types tests require the explicit TypeScript extension.
import * as monitoring from "../../src/lib/monitoring.ts"

const { createWebVitalPayload, isWebVitalPayload, sanitizeMonitoringPath } = monitoring

test("monitoring paths never retain query parameters or fragments", () => {
  assert.equal(sanitizeMonitoringPath("https://perso.browns.at/portal?employee=secret#hours"), "/portal")
  assert.equal(sanitizeMonitoringPath("/dashboard?token=secret"), "/dashboard")
  assert.equal(sanitizeMonitoringPath("not a valid URL"), "/not%20a%20valid%20URL")
})

test("web vital payloads retain useful diagnostics without URL details", () => {
  const payload = createWebVitalPayload({
    id: "v5-123",
    name: "LCP",
    value: 1234.5,
    delta: 1234.5,
    rating: "good",
    navigationType: "navigate",
  }, "/auswertungen?month=2026-07", 1_721_260_800_000)

  assert.deepEqual(payload, {
    id: "v5-123",
    name: "LCP",
    value: 1234.5,
    delta: 1234.5,
    rating: "good",
    navigationType: "navigate",
    path: "/auswertungen",
    timestamp: 1_721_260_800_000,
  })
  assert.equal(isWebVitalPayload(payload), true)
})

test("web vital validation rejects malformed or unsupported metrics", () => {
  const base = createWebVitalPayload({
    id: "v5-456",
    name: "INP",
    value: 180,
    delta: 40,
    rating: "good",
  }, "/portal", 1_721_260_800_000)

  assert.equal(isWebVitalPayload({ ...base, name: "CUSTOM" }), false)
  assert.equal(isWebVitalPayload({ ...base, value: Number.POSITIVE_INFINITY }), false)
  assert.equal(isWebVitalPayload({ ...base, path: "https://example.com/private" }), false)
  assert.equal(isWebVitalPayload({ ...base, rating: "unknown" }), false)
})
