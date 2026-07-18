import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Native Node strip-types tests require the explicit TypeScript extension.
import { parseShiftImport } from "../../src/lib/shift-import.ts"

function employee(id: string, name: string) {
  return {
    id,
    name,
    email: `${id}@example.invalid`,
    role: "employee" as const,
    position: "Service",
    color: "#2563EB",
    created_at: "2026-07-18T00:00:00.000Z",
  }
}

test("international employee names remain distinct during schedule matching", () => {
  const result = parseShiftImport([
    ["Datum", "Mitarbeiter", "Von", "Bis", "Position"],
    ["2026-07-20", "张伟", "08:00", "12:00", "Service"],
    ["2026-07-20", "李娜", "12:00", "16:00", "Service"],
  ], [employee("employee-zhang", "张伟"), employee("employee-li", "李娜")], [])

  assert.deepEqual(result.rows.map(row => row.employeeId), ["employee-zhang", "employee-li"])
  assert.deepEqual(result.rows.map(row => row.errors), [[], []])
})
