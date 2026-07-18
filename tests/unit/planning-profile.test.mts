import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Native Node strip-types tests require the explicit TypeScript extension.
import * as planning from "../../src/lib/planning-profile.ts"

test("planning names are normalized and unsafe markup is rejected", () => {
  assert.equal(planning.normalizePlanningName("  Zeynep   Kara  "), "Zeynep Kara")
  assert.equal(planning.planningNameKey("Zéynep Kara"), "zeynep kara")
  assert.equal(planning.isValidPlanningName("Ela"), true)
  assert.equal(planning.isValidPlanningName("<script>"), false)
  assert.equal(planning.isValidPlanningName("=HYPERLINK(\"https://example.invalid\")"), false)
  assert.notEqual(planning.planningNameKey("张伟"), planning.planningNameKey("李娜"))
  assert.notEqual(planning.planningNameKey("Weiß"), planning.planningNameKey("Wei"))
})

test("CSV cells neutralize spreadsheet formulas", () => {
  assert.equal(planning.safeCsvCell("=2+2"), "\"'=2+2\"")
  assert.equal(planning.safeCsvCell("Max \"Muster\""), "\"Max \"\"Muster\"\"\"")
})

test("planning profile emails are stable and collision safe", () => {
  assert.equal(planning.planningEmailLocalPart("Jörg Weiß"), "jorg.weiss")
  assert.equal(planning.nextPlanningEmail("Jörg Weiß", []), "jorg.weiss.plan@browns.local")
  assert.equal(
    planning.nextPlanningEmail("Jörg Weiß", ["jorg.weiss.plan@browns.local", "jorg.weiss.2.plan@browns.local"]),
    "jorg.weiss.3.plan@browns.local",
  )
  assert.equal(planning.isPlanningProfileEmail("JORG.WEISS.PLAN@BROWNS.LOCAL"), true)
})

test("unknown imported positions fall back to Service", () => {
  assert.equal(planning.normalizePlanningPosition("theke"), "Theke")
  assert.equal(planning.normalizePlanningPosition("Unbekannt"), "Service")
})

test("an ambiguous first name requires a manual assignment", () => {
  assert.equal(planning.hasAmbiguousPlanningFirstName("Anna", ["Anna Müller", "Anna Schmidt"]), true)
  assert.equal(planning.hasAmbiguousPlanningFirstName("Anna Müller", ["Anna Schmidt"]), false)
  assert.equal(planning.hasAmbiguousPlanningFirstName("Yusuf", ["Zeynep Kara"]), false)
})

test("only complete and unambiguous unmatched rows create planning profiles", () => {
  const candidate = {
    employeeName: "Yusuf Demir",
    employeeId: null,
    duplicate: false,
    errors: ["Mitarbeiter nicht gefunden"],
  }
  assert.equal(planning.canCreatePlanningProfileForRow(candidate, ["Zeynep Kara"]), true)
  assert.equal(planning.canCreatePlanningProfileForRow({ ...candidate, errors: [...candidate.errors, "Zeit ungültig"] }, []), false)
  assert.equal(planning.canCreatePlanningProfileForRow({ ...candidate, employeeName: "Anna" }, ["Anna Müller"]), false)
})
