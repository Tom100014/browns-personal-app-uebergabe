"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  Database,
  Download,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  ScanText,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  Users,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_SIGNALS,
  categoryLabel,
  encodeKnowledgeNote,
  knowledgeMetaLine,
  normalizeTags,
  parseKnowledgeNote,
  signalLabel,
  type KnowledgeCategory,
  type KnowledgeSignal,
} from "@/lib/knowledge"

type Doc = {
  id: string
  title: string
  note: string | null
  file_path: string | null
  kind: string
  extracted?: string | null
  created_at?: string | null
}

type EmployeeOption = { id: string; name: string; position?: string | null }

const DEFAULT_CATEGORY: KnowledgeCategory = "arbeitsliste"
const DEFAULT_SIGNAL: KnowledgeSignal = "neutral"

function fileKindLabel(kind: string) {
  if (kind === "bild") return "Bild"
  if (kind === "datei") return "Datei"
  return "Notiz"
}

export default function KnowledgeUpload() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [category, setCategory] = useState<KnowledgeCategory>(DEFAULT_CATEGORY)
  const [signal, setSignal] = useState<KnowledgeSignal>(DEFAULT_SIGNAL)
  const [tags, setTags] = useState("")
  const [sourceDate, setSourceDate] = useState("")
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [learning, setLearning] = useState(false)
  const [learnText, setLearnText] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>("all")
  const [query, setQuery] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  function mark(id: string, on: boolean) {
    setAnalyzing(prev => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function analyze(id: string) {
    mark(id, true)
    try {
      const res = await fetch("/api/knowledge/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.ok && data.extracted) {
        setDocs(prev => prev.map(d => d.id === id ? { ...d, extracted: data.extracted } : d))
      }
    } catch {
      // Dokument bleibt gespeichert; nur die automatische Analyse ist fehlgeschlagen.
    }
    mark(id, false)
  }

  function load() {
    const supabase = createClient()
    Promise.all([
      supabase.from("knowledge_docs").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("id,name,position").order("name"),
    ]).then(([docsRes, employeesRes]) => {
      setDocs((docsRes.data ?? []) as Doc[])
      setEmployees((employeesRes.data ?? []) as EmployeeOption[])
    })
  }

  useEffect(load, [])

  const selectedNames = useMemo(
    () => employees.filter(e => employeeIds.includes(e.id)).map(e => e.name),
    [employees, employeeIds],
  )

  const parsedDocs = useMemo(() => docs.map(doc => {
    const parsed = parseKnowledgeNote(doc.note)
    return { ...doc, parsed }
  }), [docs])

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return parsedDocs.filter(doc => {
      if (filter !== "all" && doc.parsed.meta.category !== filter) return false
      if (!q) return true
      const haystack = `${doc.title} ${doc.parsed.body} ${doc.extracted ?? ""} ${(doc.parsed.meta.tags ?? []).join(" ")} ${(doc.parsed.meta.employeeNames ?? []).join(" ")}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [filter, parsedDocs, query])

  function toggleEmployee(id: string) {
    setEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function add() {
    if (!title.trim()) return
    setBusy(true)
    const supabase = createClient()
    const file = fileRef.current?.files?.[0]

    const encodedNote = encodeKnowledgeNote(note, {
      category,
      signal,
      tags: normalizeTags(tags),
      employeeIds,
      employeeNames: selectedNames,
      sourceDate,
      scope: employeeIds.length > 0 ? "employee" : "team",
      trust: "manager_verified",
    })

    let data: unknown = null
    let saveError = ""
    if (file) {
      const payload = new FormData()
      payload.set("scope", "knowledge")
      payload.set("title", title.trim())
      payload.set("note", encodedNote)
      payload.set("file", file)
      const response = await fetch("/api/agent/upload", { method: "POST", body: payload })
      const result = await response.json().catch(() => ({}))
      data = result.record ?? null
      saveError = response.ok ? "" : (result.error || "Upload fehlgeschlagen")
    } else {
      const result = await supabase.from("knowledge_docs")
        .insert({ title: title.trim(), note: encodedNote, file_path: null, kind: "notiz" })
        .select().single()
      data = result.data
      saveError = result.error?.message ?? ""
    }

    if (saveError) {
      setBusy(false)
      alert("Speichern fehlgeschlagen: " + saveError)
      return
    }

    if (data) {
      const saved = data as Doc
      setDocs(prev => [saved, ...prev])
      if (saved.file_path && (saved.kind === "bild" || /\.(txt|csv|tsv|md|xlsx)$/i.test(saved.file_path))) analyze(saved.id)
    }

    setTitle("")
    setNote("")
    setTags("")
    setSourceDate("")
    setEmployeeIds([])
    setSignal(DEFAULT_SIGNAL)
    setCategory(DEFAULT_CATEGORY)
    if (fileRef.current) fileRef.current.value = ""
    setBusy(false)
  }

  async function learnNow() {
    if (learning) return
    setLearning(true)
    setLearnText(null)
    try {
      const res = await fetch("/api/agent/learn", { method: "POST" })
      const data = await res.json()
      setLearnText(data.insight || data.error || "Keine Analyse erhalten.")
      load()
    } catch {
      setLearnText("Automatisches Lernen fehlgeschlagen.")
    }
    setLearning(false)
  }

  async function view(d: Doc) {
    if (!d.file_path) return
    const { data } = await createClient().storage.from("knowledge").createSignedUrl(d.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

  async function remove(d: Doc) {
    if (!confirm(`„${d.title}" löschen?`)) return
    const supabase = createClient()
    if (d.file_path) await supabase.storage.from("knowledge").remove([d.file_path])
    await supabase.from("knowledge_docs").delete().eq("id", d.id)
    setDocs(prev => prev.filter(x => x.id !== d.id))
  }

  return (
    <div className="mt-5 min-w-0 max-w-full border-t border-gray-100 pt-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-bold text-gray-950">Admin-Wissensdatenbank</h3>
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
            Belege, Arbeitslisten, Dienstpläne, Notizen und Mitarbeiter-Signale werden mit Tags gespeichert. Browns Agent und Team-Chart ziehen daraus Kontext für Planung, Verträge, Vertretung und Personalentscheidungen.
          </p>
        </div>
        <button
          type="button"
          onClick={learnNow}
          disabled={learning}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-xs font-bold text-white shadow-card transition hover:bg-charcoal-light disabled:opacity-50"
        >
          {learning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Heute lernen
        </button>
      </div>

      {learnText && (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
          <span className="font-bold">Gespeichert: </span>{learnText}
        </div>
      )}

      <div className="mb-4 grid gap-3 border-y border-gray-100 py-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 px-1">
          <Database className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" />
          <div>
            <p className="text-xs font-black text-gray-900">Dateien und Wissen hier speichern</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">Belege, Bilder, PDFs, Word, Excel und andere Dateien werden hier archiviert und dem Team oder einzelnen Mitarbeitern zugeordnet.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 border-gray-100 px-1 sm:border-l sm:pl-4">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="text-xs font-black text-gray-900">Arbeitsplan wirklich übernehmen</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">Excel- oder CSV-Dienstpläne werden unter Dienstplan mit Vorschau in echte Schichten umgewandelt.</p>
            <Link href="/dienstplan" className="mt-2 inline-flex text-xs font-black text-brand-700 hover:text-brand-800">Zum Dienstplan-Import</Link>
          </div>
        </div>
      </div>

      <div className="min-w-0 max-w-full rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px]">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel, z.B. Arbeitsliste Montag, Krankmeldung, Beleg Spülmaschine"
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value as KnowledgeCategory)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {KNOWLEDGE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            value={signal}
            onChange={e => setSignal(e.target.value as KnowledgeSignal)}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {KNOWLEDGE_SIGNALS.map(item => <option key={item.value} value={item.value}>Signal: {item.label}</option>)}
          </select>
        </div>

        <textarea
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Kurze Notiz: Was ist wichtig? Betrifft es bestimmte Mitarbeiter, einen Fehler, gute Leistung, eine Arbeitsliste oder einen Beleg?"
          className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_170px]">
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs text-gray-600">
            <Tags className="h-4 w-4 text-brand-600" />
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="Tags, z.B. service, pünktlich, fehler, beleg"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs text-gray-600">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            <input
              type="date"
              value={sourceDate}
              onChange={e => setSourceDate(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        {employees.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-gray-700">
              <Users className="h-4 w-4 text-brand-600" />
              Mitarbeiterbezug
            </div>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/60 p-2">
              {employees.map(employee => {
                const selected = employeeIds.includes(employee.id)
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => toggleEmployee(employee.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      selected ? "bg-brand-600 text-white shadow-card" : "bg-white text-gray-600 hover:bg-brand-50 hover:text-brand-700"
                    }`}
                  >
                    {employee.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.md,.csv,.tsv"
            className="min-w-0 max-w-full text-xs text-gray-600 file:mr-2 file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-brand-700"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !title.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-card transition hover:bg-brand-700 disabled:opacity-50 sm:ml-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Speichern
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">PDF, Bild, DOCX, XLSX und Textdateien bis 4 MB. Bilder, Text, CSV und Excel werden nach Freigabe zusätzlich ausgelesen.</p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Wissen suchen..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="all">Alle Kategorien</option>
          {KNOWLEDGE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div className="mt-3 grid gap-2">
        {filteredDocs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
            Noch kein passendes Wissen gespeichert.
          </div>
        ) : filteredDocs.map(doc => {
          const isAnalyzing = analyzing.has(doc.id)
          const canAnalyze = Boolean(doc.file_path) && (doc.kind === "bild" || /\.(txt|csv|tsv|md|xlsx)$/i.test(doc.file_path ?? ""))
          const meta = doc.parsed.meta
          const metaLine = knowledgeMetaLine(meta)
          const isRisk = meta.signal && ["problem", "krankheit", "fehler"].includes(meta.signal)
          return (
            <div key={doc.id} className="min-w-0 max-w-full rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-card">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isRisk ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"}`}>
                  {doc.kind === "bild" ? <ImageIcon className="h-4 w-4" /> : doc.kind === "datei" ? <FileText className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-gray-900">{doc.title}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">{categoryLabel(meta.category)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isRisk ? "bg-red-50 text-red-700" : meta.signal === "positiv" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>
                      {isRisk && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {signalLabel(meta.signal)}
                    </span>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">{fileKindLabel(doc.kind)}</span>
                  </div>
                  {metaLine && <p className="mt-1 break-words text-xs text-gray-500">{metaLine}</p>}
                  {doc.parsed.body && <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{doc.parsed.body}</p>}
                  {doc.extracted && (
                    <p className="mt-2 line-clamp-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500 whitespace-pre-wrap">{doc.extracted}</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {isAnalyzing ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> liest</span>
                  ) : !doc.extracted && canAnalyze ? (
                    <button type="button" onClick={() => analyze(doc.id)} className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600" title="Inhalt auslesen">
                      <ScanText className="h-4 w-4" />
                    </button>
                  ) : doc.extracted ? (
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                  ) : null}
                  {doc.file_path && (
                    <button type="button" onClick={() => view(doc)} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-brand-600" title="Öffnen">
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(doc)} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600" title="Löschen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
