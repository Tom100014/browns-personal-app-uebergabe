"use client"

import { useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Database, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { logAudit } from "@/lib/audit"
import { encodeKnowledgeNote } from "@/lib/knowledge"
import { guessWeekStart, parseShiftImport, type ImportMatrix } from "@/lib/shift-import"
import type { Employee, Shift } from "@/types"
import { cn } from "@/lib/utils"

interface Props {
  employees: Employee[]
  shifts: Shift[]
  onClose: () => void
  onImported: (shifts: Shift[]) => void
}

type ParseResponse = {
  rows?: ImportMatrix
  sheetName?: string
  sheetNames?: string[]
  sheetCount?: number
  truncated?: boolean
  error?: string
}

export default function ShiftImportDialog({ employees, shifts, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [matrix, setMatrix] = useState<ImportMatrix>([])
  const [sheetName, setSheetName] = useState("")
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [weekStart, setWeekStart] = useState("")
  const [truncated, setTruncated] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState<number | null>(null)

  const parsed = useMemo(
    () => parseShiftImport(matrix, employees, shifts, overrides, weekStart),
    [employees, matrix, overrides, shifts, weekStart],
  )
  const validRows = parsed.rows.filter(row => row.errors.length === 0 && !row.duplicate && row.employeeId)
  const duplicateCount = parsed.rows.filter(row => row.duplicate).length
  const errorCount = parsed.rows.filter(row => row.errors.length > 0).length

  async function chooseFile(selected: File | null, sheetIndex = 0) {
    if (!selected) return
    const newFile = selected !== file
    setFile(selected)
    setMatrix([])
    setOverrides({})
    setSelectedSheet(sheetIndex)
    if (newFile) setWeekStart(guessWeekStart(selected.name))
    setError(null)
    setWarning(null)
    setSuccess(null)
    setParsing(true)
    try {
      const form = new FormData()
      form.append("file", selected)
      form.append("sheetIndex", String(sheetIndex))
      const response = await fetch("/api/shifts/parse-import", { method: "POST", body: form })
      const data = await response.json() as ParseResponse
      if (!response.ok || data.error) throw new Error(data.error || "Datei konnte nicht gelesen werden.")
      setMatrix(data.rows ?? [])
      setSheetName(data.sheetName ?? "")
      setSheetNames(data.sheetNames ?? [])
      setTruncated(Boolean(data.truncated))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Datei konnte nicht gelesen werden.")
    }
    setParsing(false)
  }

  function downloadTemplate() {
    const example = employees[0]?.name ?? "Max Mustermann"
    const csv = [
      ["Datum", "Mitarbeiter", "Von", "Bis", "Position", "Notiz"],
      ["2026-07-20", example, "08:00", "16:00", employees[0]?.position ?? "Service", "Frühschicht"],
    ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "Browns_Dienstplan_Import_Vorlage.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function archiveSource(importedCount: number): Promise<boolean> {
    if (!file) return true
    const names = [...new Set(validRows.map(row => row.employeeName))]
    const note = encodeKnowledgeNote(
      `${importedCount} Schichten aus ${file.name} in den Dienstplan übernommen. Originaldatei als Nachweis archiviert.`,
      {
        category: "dienstplan",
        signal: "neutral",
        tags: ["dienstplan", "import", file.name.split(".").pop()?.toLowerCase() ?? "datei"],
        employeeIds: [...new Set(validRows.map(row => row.employeeId).filter(Boolean))] as string[],
        employeeNames: names,
        sourceDate: new Date().toISOString().slice(0, 10),
        scope: "team",
      },
    )
    const payload = new FormData()
    payload.append("scope", "knowledge")
    payload.append("title", `Dienstplan-Import: ${file.name}`)
    payload.append("note", note)
    payload.append("file", file)
    const response = await fetch("/api/agent/upload", { method: "POST", body: payload })
    return response.ok
  }

  async function importRows() {
    if (!file || validRows.length === 0) return
    setSaving(true)
    setError(null)
    setWarning(null)
    const supabase = createClient()
    const payload = validRows.map(row => ({
      employee_id: row.employeeId!,
      date: row.date,
      start_time: row.start,
      end_time: row.end,
      position: row.position,
      note: row.note || null,
      status: "scheduled" as const,
    }))
    const { data, error: insertError } = await supabase
      .from("shifts")
      .insert(payload)
      .select("*, employee:employees(*)")

    if (insertError) {
      setError(`Import fehlgeschlagen: ${insertError.message}`)
      setSaving(false)
      return
    }

    const imported = (data ?? []) as Shift[]
    onImported(imported)
    const archived = await archiveSource(imported.length)
    if (!archived) setWarning("Die Schichten wurden übernommen, aber die Originaldatei konnte nicht in der Wissensdatenbank archiviert werden.")
    await logAudit("Dienstplan importiert", `${file.name}: ${imported.length} Schichten`)
    setSuccess(imported.length)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-charcoal/45 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-float">
        <div className="brand-topbar flex items-start justify-between gap-4 px-5 py-4 text-white sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/18">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-white/70">Dienstplan</p>
              <h2 className="text-lg font-black">Excel oder CSV importieren</h2>
              <p className="mt-0.5 text-xs text-white/80">Datei prüfen, Mitarbeiter zuordnen und erst dann Schichten übernehmen.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/75 transition hover:bg-white/15 hover:text-white" title="Schließen">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-24 items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 px-4 py-5 text-left transition hover:border-brand-400 hover:bg-brand-50"
            >
              {parsing ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> : <Upload className="h-6 w-6 text-brand-600" />}
              <span>
                <span className="block text-sm font-black text-gray-900">{file?.name ?? "Excel- oder CSV-Datei auswählen"}</span>
                <span className="mt-1 block text-xs text-gray-500">.xlsx, .csv oder .tsv · maximal 4 MB</span>
              </span>
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.csv,.tsv" className="hidden" onChange={event => chooseFile(event.target.files?.[0] ?? null)} />
            <button type="button" onClick={downloadTemplate}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 lg:self-center">
              <Download className="h-4 w-4" /> Vorlage herunterladen
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-900">
            <strong>Erkannte Formate:</strong> Liste mit Datum, Mitarbeiter, Von und Bis sowie Browns-Wochenmatrix mit Name und Montag bis Sonntag. Eine gemeinsame Zeitspalte wie 08:00–16:00 wird ebenfalls erkannt. Alte .xls-Dateien bitte als .xlsx speichern.
          </div>

          {matrix.length > 0 && (sheetNames.length > 1 || parsed.mode === "matrix") && (
            <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:grid-cols-2">
              {sheetNames.length > 1 && (
                <label className="text-xs font-bold text-gray-700">Tabellenblatt
                  <select value={selectedSheet} onChange={event => file && chooseFile(file, Number(event.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500/30">
                    {sheetNames.map((name, index) => <option key={`${name}-${index}`} value={index}>{name}</option>)}
                  </select>
                </label>
              )}
              {parsed.mode === "matrix" && (
                <label className="text-xs font-bold text-gray-700">Montag dieser Planwoche
                  <input type="date" value={weekStart} onChange={event => setWeekStart(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500/30" />
                  <span className="mt-1 block font-normal text-gray-400">Bei Dateinamen wie „11.05 bis 17.05“ wird das Datum vorausgefüllt. Bitte Jahr prüfen.</span>
                </label>
              )}
            </div>
          )}

          {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
          {warning && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{warning}</div>}
          {success != null && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div><p className="text-sm font-black">{success} Schichten übernommen</p><p className="text-xs">Der Dienstplan ist aktualisiert und die Originaldatei wurde in der Wissensdatenbank dokumentiert.</p></div>
            </div>
          )}

          {matrix.length > 0 && !success && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{validRows.length} bereit</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{duplicateCount} doppelt, wird übersprungen</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{errorCount} zu prüfen</span>
                {sheetName && <span className="ml-auto text-xs text-gray-400">Tabelle: {sheetName}</span>}
              </div>
              {truncated && <p className="mt-2 text-xs font-semibold text-amber-700">Die Vorschau wurde auf 1.000 Zeilen und 40 Spalten begrenzt.</p>}
              {parsed.error ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">{parsed.error}</div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="bg-gray-50 text-[11px] font-bold uppercase text-gray-500">
                      <tr><th className="px-3 py-2">Zeile</th><th className="px-3 py-2">Mitarbeiter</th><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Zeit</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Prüfung</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parsed.rows.slice(0, 150).map(row => (
                        <tr key={row.sourceRow} className={cn(row.errors.length > 0 && "bg-red-50/60", row.duplicate && "bg-amber-50/60")}>
                          <td className="px-3 py-2 text-gray-400">{row.sourceRow}</td>
                          <td className="px-3 py-2">
                            <select
                              value={row.employeeId ?? ""}
                              onChange={event => setOverrides(current => ({ ...current, [row.sourceRow]: event.target.value }))}
                              className={cn("w-full min-w-44 rounded-lg border px-2 py-1.5 outline-none", row.employeeId ? "border-gray-200 bg-white" : "border-red-300 bg-red-50")}
                            >
                              <option value="">Bitte zuordnen</option>
                              {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-gray-700">{row.date || "—"}</td>
                          <td className="px-3 py-2 tabular-nums text-gray-700">{row.start && row.end ? `${row.start}–${row.end}` : "—"}</td>
                          <td className="px-3 py-2 text-gray-700">{row.position}</td>
                          <td className="px-3 py-2">
                            {row.duplicate ? <span className="font-bold text-amber-700">Bereits vorhanden</span>
                              : row.errors.length > 0 ? <span className="font-bold text-red-700">{row.errors.join(" · ")}</span>
                              : <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Bereit</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 150 && <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">Weitere {parsed.rows.length - 150} Zeilen werden beim Import ebenfalls berücksichtigt.</p>}
                </div>
              )}
            </>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 text-xs text-gray-500">
              <Database className="h-4 w-4 text-brand-600" /> Originaldatei wird nach erfolgreichem Import in der Admin-Wissensdatenbank archiviert.
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
              {success != null ? "Fertig" : "Abbrechen"}
            </button>
            {success == null && (
              <button type="button" onClick={importRows} disabled={saving || validRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : validRows.length === 0 ? <AlertTriangle className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                {saving ? "Wird importiert..." : `${validRows.length} Schichten übernehmen`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
