import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Native Node strip-types tests require the explicit TypeScript extension.
import * as security from "../../lib/security-core.ts"

const {
  canManageAccessTarget,
  consumeRateLimit,
  findDifferentEmployeeIdentity,
  getTrustedClientIp,
  isAdminActor,
  isPrivilegedEmployeeRole,
  isProtectedOwnerTarget,
  isSameOriginMutation,
  normalizeEmployeeIds,
  resetSecurityRateLimitsForTests,
  toSameOriginPath,
} = security

const manager = {
  userId: "manager-user",
  email: "manager@browns.at",
  employee: { id: "manager", role: "manager", email: "manager@browns.at" },
  isManager: true,
}
const admin = {
  userId: "admin-user",
  email: "admin2@browns.at",
  employee: { id: "admin", role: "admin", email: "admin2@browns.at" },
  isManager: true,
}

test("access routes allow managers only for non-privileged employees", () => {
  assert.equal(canManageAccessTarget(manager, { id: "employee", role: "employee" }), true)
  assert.equal(canManageAccessTarget(manager, { id: "admin", role: "admin" }), false)
  assert.equal(canManageAccessTarget(manager, { id: "primary", role: "manager" }, "primary"), false)
  assert.equal(canManageAccessTarget(admin, { id: "admin", role: "admin" }), true)
})

test("owner and primary-admin identities remain protected from revoke", () => {
  assert.equal(isProtectedOwnerTarget({ id: "primary", role: "admin" }, "primary"), true)
  assert.equal(isProtectedOwnerTarget({ id: "owner", email: "ADMIN@BROWNS.AT" }), true)
  assert.equal(isProtectedOwnerTarget({ id: "secondary", role: "admin" }, "primary"), false)
  assert.equal(isAdminActor({ ...manager, email: "admin@browns.at" }), true)
})

test("set-access and invite detect an auth identity owned by another employee", () => {
  const rows = [
    { id: "target", auth_user_id: "auth-a" },
    { id: "different", auth_user_id: "auth-a" },
  ]
  assert.deepEqual(findDifferentEmployeeIdentity(rows, "target"), rows[1])
  assert.equal(findDifferentEmployeeIdentity([rows[0]], "target"), null)
})

test("push routes restrict manager broadcasts and external navigation", () => {
  assert.equal(isPrivilegedEmployeeRole("admin"), true)
  assert.equal(isPrivilegedEmployeeRole("owner"), true)
  assert.equal(isPrivilegedEmployeeRole("manager"), false)
  assert.equal(toSameOriginPath("/portal/chat?from=push", "https://perso.browns.at"), "/portal/chat?from=push")
  assert.equal(toSameOriginPath("https://evil.example/phish", "https://perso.browns.at"), "/")
  assert.equal(toSameOriginPath("//evil.example/phish", "https://perso.browns.at"), "/")
})

test("clock-in derives client IP from trusted proxy headers", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.8",
    "x-forwarded-for": "198.51.100.4",
  })
  assert.equal(getTrustedClientIp(headers), "203.0.113.8")
  assert.equal(getTrustedClientIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" })), "198.51.100.4")
  assert.equal(getTrustedClientIp(new Headers({ "x-forwarded-for": "not-an-ip" })), null)
})

test("mutation routes reject an explicit cross-origin request", () => {
  const sameOrigin = {
    url: "https://perso.browns.at/api/invite",
    headers: new Headers({ origin: "https://perso.browns.at", "sec-fetch-site": "same-origin" }),
  }
  const crossOrigin = {
    url: sameOrigin.url,
    headers: new Headers({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
  }
  assert.equal(isSameOriginMutation(sameOrigin), true)
  assert.equal(isSameOriginMutation(crossOrigin), false)
})

test("sensitive route rate limits enforce their configured window", () => {
  resetSecurityRateLimitsForTests()
  assert.equal(consumeRateLimit("invite:test", 2, 60_000, 1_000).allowed, true)
  assert.equal(consumeRateLimit("invite:test", 2, 60_000, 1_001).allowed, true)
  assert.equal(consumeRateLimit("invite:test", 2, 60_000, 1_002).allowed, false)
  assert.equal(consumeRateLimit("invite:test", 2, 60_000, 61_001).allowed, true)
})

test("push employee IDs are unique, bounded UUIDs", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000"
  assert.deepEqual(normalizeEmployeeIds([id, id]), [id])
  assert.equal(normalizeEmployeeIds(["not-a-uuid"]), null)
})
