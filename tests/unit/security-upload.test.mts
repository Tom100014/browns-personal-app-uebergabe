import assert from "node:assert/strict"
import test from "node:test"
// @ts-expect-error Native Node strip-types tests require the explicit TypeScript extension.
import { MAX_UPLOAD_BYTES, safeUploadName, validateUpload } from "../../src/lib/security-upload.ts"

test("upload names cannot escape their storage folder", () => {
  assert.equal(safeUploadName("../../Personalakte Thomas.pdf"), "Personalakte_Thomas.pdf")
  assert.equal(safeUploadName(".hidden"), "hidden")
})

test("valid PDF signatures are accepted", async () => {
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], "nachweis.pdf", {
    type: "application/pdf",
  })
  const result = await validateUpload(file, "sicknote")
  assert.deepEqual(result, {
    extension: "pdf",
    contentType: "application/pdf",
    safeName: "nachweis.pdf",
  })
})

test("renamed executable content is rejected", async () => {
  const file = new File(["<script>alert(1)</script>"], "nachweis.pdf", { type: "application/pdf" })
  await assert.rejects(validateUpload(file, "document"), /Dateiinhalt und Dateiendung/)
})

test("scope size limits are enforced before upload", async () => {
  const oversized = new File([new Uint8Array(MAX_UPLOAD_BYTES.sicknote + 1)], "nachweis.pdf", {
    type: "application/pdf",
  })
  await assert.rejects(validateUpload(oversized, "sicknote"), /maximal 4 MB/)
})
