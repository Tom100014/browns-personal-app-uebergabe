"use client"

import { useState, useEffect, useRef } from "react"
import { FileSignature, Printer, Save, Check, Loader2, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { buildContract, type ContractData } from "@/lib/contract"
import type { Employee } from "@/types"
import DateInput from "@/components/ui/DateInput"

const EMPLOYMENT = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Aushilfe"]

export default function ContractGenerator({ employee }: { employee: Employee }) {
  const [form, setForm] = useState<ContractData>({
    contractKind: "standard",
    employerName: "Browns Coffee Lounge",
    employerAddress: "",
    employeeName: employee.name,
    employeeAddress: employee.address ?? "",
    birthDate: employee.birth_date ?? "",
    position: employee.position,
    employmentType: (employee.employment_type as string) ?? "Teilzeit",
    wage: employee.hourly_wage != null ? String(employee.hourly_wage).replace(".", ",") : "",
    weeklyHours: employee.weekly_hours != null ? String(employee.weekly_hours) : "",
    startDate: employee.start_date ?? "",
    probationMonths: "6",
    vacationDays: "25",
    noticePeriod: "4 Wochen",
    extra: "",
    workLocation: "",
    collectiveAgreement: "",
  })
  const [html, setHtml] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const previewRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // Prefill employer address from café settings if available.
    (async () => {
      const supabase = createClient()
      const { data } = await supabase.from("settings").select("value").eq("key", "cafe_info").maybeSingle()
      if (data?.value) {
        try {
          const c = JSON.parse(data.value)
          setForm(f => ({ ...f, employerName: c.name || f.employerName, employerAddress: c.address || f.employerAddress }))
        } catch { /* ignore */ }
      }
    })()
  }, [])

  function set<K extends keyof ContractData>(k: K, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function generate() { setHtml(buildContract(form).html) }

  function printContract() {
    previewRef.current?.contentWindow?.print()
  }

  async function saveToFile() {
    setSaving(true)
    const { title, html: out } = buildContract(form)
    const supabase = createClient()
    const fileName = `Arbeitsvertrag_${employee.name.replace(/[^\w]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.html`
    const path = `${employee.id}/${Date.now()}-${fileName}`
    const blob = new Blob([out], { type: "text/html" })
    const { error } = await supabase.storage.from("documents").upload(path, blob)
    if (!error) {
      await supabase.from("documents").insert({
        employee_id: employee.id, name: title, category: "Arbeitsvertrag", file_path: path, size_bytes: blob.size,
      })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
  const labelCls = "text-xs text-gray-500 mb-1 block font-medium"

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileSignature className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-900">Arbeitsvertrag erstellen</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">Felder aus den Stammdaten vorausgefüllt — anpassen, Vorschau erstellen, drucken oder im Personalakt speichern.</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Anstellungsart</label>
          <select className={inputCls} value={form.employmentType} onChange={e => set("employmentType", e.target.value)}>
            {EMPLOYMENT.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Position</label><input className={inputCls} value={form.position} onChange={e => set("position", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Stundenlohn €</label><input className={inputCls} value={form.wage} onChange={e => set("wage", e.target.value)} /></div>
          <div><label className={labelCls}>Wochenstd.</label><input className={inputCls} value={form.weeklyHours} onChange={e => set("weeklyHours", e.target.value)} /></div>
        </div>
        <div><label className={labelCls}>Eintrittsdatum</label><DateInput className={inputCls} value={form.startDate} onChange={v => set("startDate", v)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Probezeit (Monate)</label><input className={inputCls} value={form.probationMonths} onChange={e => set("probationMonths", e.target.value)} /></div>
          <div><label className={labelCls}>Urlaubstage</label><input className={inputCls} value={form.vacationDays} onChange={e => set("vacationDays", e.target.value)} /></div>
        </div>
        <div><label className={labelCls}>Kündigungsfrist</label><input className={inputCls} value={form.noticePeriod} onChange={e => set("noticePeriod", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Arbeitgeber (Name, Adresse)</label>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} value={form.employerName} onChange={e => set("employerName", e.target.value)} />
            <input className={inputCls} placeholder="Adresse" value={form.employerAddress} onChange={e => set("employerAddress", e.target.value)} />
          </div>
        </div>
        <div className="sm:col-span-2"><label className={labelCls}>Arbeitsort / Betriebsstätte</label>
          <input className={inputCls} placeholder="z.B. Browns Café, Adresse oder wechselnde Betriebsstätte" value={form.workLocation ?? ""} onChange={e => set("workLocation", e.target.value)} />
        </div>
        <div className="sm:col-span-2"><label className={labelCls}>Tarif / Kollektivvertrag / gesetzliche Grundlage</label>
          <textarea rows={2} className={inputCls} value={form.collectiveAgreement ?? ""} onChange={e => set("collectiveAgreement", e.target.value)}
            placeholder="Leer lassen = allgemeine Standardformulierung; bei Bedarf konkrete Regelung eintragen." />
        </div>
        <div className="sm:col-span-2"><label className={labelCls}>Sonstige Vereinbarungen (optional)</label>
          <textarea rows={2} className={inputCls} value={form.extra} onChange={e => set("extra", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={generate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
          <FileSignature className="w-4 h-4" /> Vorschau erstellen
        </button>
        {html && (
          <>
            <button onClick={printContract} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
              <Printer className="w-4 h-4" /> Drucken / PDF
            </button>
            <button onClick={saveToFile} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
              {saved ? "Im Personalakt" : "In Personalakte speichern"}
            </button>
          </>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">Automatische <strong>Vorlage</strong>, keine Rechtsberatung. Vor Verwendung von Steuerberater/in oder Anwalt/Anwältin prüfen lassen (Geringfügigkeitsgrenze, Mindestlohn, Kündigungsfristen, Tarif-/Kollektivvertrag).</p>
      </div>

      {html && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
          <iframe ref={previewRef} title="Vertragsvorschau" srcDoc={html} sandbox="allow-modals allow-same-origin" className="w-full h-[520px] bg-white" />
        </div>
      )}
    </div>
  )
}
