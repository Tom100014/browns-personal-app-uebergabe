import { NextRequest } from "next/server"
import readXlsxFile, { type CellValue } from "read-excel-file/node"
import { getCurrentStaff } from "@/lib/staff"
import { enforceRateLimit, jsonNoStore, rejectCrossOriginMutation } from "@/lib/security"
import { validateUpload } from "@/lib/security-upload"

export const runtime = "nodejs"

const MAX_FILE_SIZE = 4 * 1024 * 1024
const MAX_ROWS = 1000
const MAX_COLUMNS = 40

type ImportCell = string | number | boolean | null

function excelDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function cellValue(value: CellValue | null): ImportCell {
  if (value == null) return null
  if (value instanceof Date) return excelDate(value)
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  return String(value)
}

function parseDelimited(text: string, delimiter: string): ImportCell[][] {
  const rows: ImportCell[][] = []
  let row: ImportCell[] = []
  let value = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      row.push(value.trim())
      value = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(value.trim())
      if (row.some(cell => String(cell).trim())) rows.push(row.slice(0, MAX_COLUMNS))
      row = []
      value = ""
      if (rows.length >= MAX_ROWS) break
    } else {
      value += char
    }
  }

  if (rows.length < MAX_ROWS && (value || row.length)) {
    row.push(value.trim())
    if (row.some(cell => String(cell).trim())) rows.push(row.slice(0, MAX_COLUMNS))
  }
  return rows
}

function detectDelimiter(text: string, extension: string): string {
  if (extension === "tsv") return "\t"
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const counts = [";", ",", "\t"].map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length }))
  return counts.sort((a, b) => b.count - a.count)[0].delimiter
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOriginMutation(request)
  if (crossOrigin) return crossOrigin
  const staff = await getCurrentStaff()
  if (!staff) return jsonNoStore({ error: "Nicht angemeldet" }, { status: 401 })
  if (!staff.isManager) return jsonNoStore({ error: "Nicht berechtigt" }, { status: 403 })
  const limited = await enforceRateLimit(request, "shift-import-parse", 12, 10 * 60_000, staff.userId)
  if (limited) return limited

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const requestedSheet = Math.max(0, Number(form?.get("sheetIndex") ?? 0) || 0)
  if (!(file instanceof File)) return jsonNoStore({ error: "Datei fehlt" }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return jsonNoStore({ error: "Die Datei darf höchstens 4 MB groß sein." }, { status: 400 })

  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!["xlsx", "csv", "tsv"].includes(extension)) {
    return jsonNoStore({ error: "Unterstützt werden Excel (.xlsx), CSV und TSV." }, { status: 400 })
  }

  try {
    await validateUpload(file, "knowledge")
    if (extension === "csv" || extension === "tsv") {
      const text = (await file.text()).replace(/^\uFEFF/, "")
      const rows = parseDelimited(text, detectDelimiter(text, extension))
      return jsonNoStore({ rows, sheetName: extension.toUpperCase(), sheetNames: [extension.toUpperCase()], truncated: rows.length >= MAX_ROWS })
    }

    const workbook = await readXlsxFile(Buffer.from(await file.arrayBuffer()))
    const sheet = workbook[Math.min(requestedSheet, Math.max(0, workbook.length - 1))]
    if (!sheet) return jsonNoStore({ error: "Die Excel-Datei enthält kein Tabellenblatt." }, { status: 400 })

    const rows = sheet.data
      .slice(0, MAX_ROWS)
      .map(row => row.slice(0, MAX_COLUMNS).map(cellValue))
      .filter(row => row.some(value => String(value ?? "").trim()))

    return jsonNoStore({
      rows,
      sheetName: sheet.sheet,
      sheetNames: workbook.map(item => item.sheet),
      sheetCount: workbook.length,
      truncated: sheet.data.length > MAX_ROWS || sheet.data.some(row => row.length > MAX_COLUMNS),
    })
  } catch {
    return jsonNoStore({ error: "Die Datei konnte nicht gelesen werden. Bitte als .xlsx oder CSV speichern." }, { status: 400 })
  }
}
