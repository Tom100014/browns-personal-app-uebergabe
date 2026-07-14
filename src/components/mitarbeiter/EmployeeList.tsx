"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Pencil, Trash2, X, Check, Phone, Mail, ChevronRight, UserPlus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { formatEuro } from "@/lib/hours"
import type { Employee } from "@/types"
import { cn } from "@/lib/utils"

const COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#ef4444","#ec4899","#06b6d4","#84cc16","#f97316","#6366f1"]
const POSITIONS = ["Service","Theke","Küche","Spüle","Bar","Kasse","Reinigung","Leitung"]
const ROLES: Employee["role"][] = ["employee","manager","admin"]
const ROLE_LABELS: Record<string,string> = { employee: "Mitarbeiter", manager: "Manager", admin: "Admin" }
const EMPLOYMENT = ["Vollzeit","Teilzeit","Minijob","Werkstudent","Aushilfe"]

interface Props { employees: Employee[] }

type FormState = {
  name: string; email: string; phone: string; position: string
  role: Employee["role"]; employment_type: string; hourly_wage: string; color: string
}

const emptyForm: FormState = {
  name: "", email: "", phone: "", position: "Service", role: "employee",
  employment_type: "Teilzeit", hourly_wage: "", color: COLORS[0]
}

export default function EmployeeList({ employees: initial }: Props) {
  const [employees, setEmployees] = useState<Employee[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [accessFor, setAccessFor] = useState<Employee | null>(null)
  const [accessEmail, setAccessEmail] = useState("")
  const [accessPw, setAccessPw] = useState("")
  const [accessBusy, setAccessBusy] = useState(false)

  function openAccess(emp: Employee) {
    setAccessFor(emp); setAccessEmail(emp.email); setAccessPw(""); setInviteMsg(null)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      name: emp.name, email: emp.email, phone: emp.phone ?? "", position: emp.position, role: emp.role,
      employment_type: emp.employment_type ?? "Teilzeit", hourly_wage: emp.hourly_wage?.toString() ?? "", color: emp.color,
    })
    setShowForm(true)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const wage = form.hourly_wage ? Number(form.hourly_wage.replace(",", ".")) : null
    const empPayload = {
      name: form.name, email: form.email, phone: form.phone || null,
      position: form.position, role: form.role,
      employment_type: form.employment_type || null,
      color: form.color,
    }
    let empId: string | null = null
    if (editing) {
      const { data } = await supabase.from("employees").update(empPayload).eq("id", editing.id).select().single()
      empId = editing.id
      if (data) setEmployees(prev => prev.map(e => e.id === editing.id ? { ...(data as Employee), hourly_wage: wage } : e))
    } else {
      const { data } = await supabase.from("employees").insert({ ...empPayload, created_at: new Date().toISOString() }).select().single()
      if (data) { empId = data.id; setEmployees(prev => [...prev, { ...(data as Employee), hourly_wage: wage }]) }
    }
    // Wage is protected: stored in employee_private (management only).
    if (empId) await supabase.from("employee_private").upsert({ employee_id: empId, hourly_wage: wage })
    setSaving(false); setShowForm(false); setEditing(null); setForm(emptyForm)
  }

  async function sendInvite() {
    if (!accessFor || !accessEmail) return
    setAccessBusy(true); setInviteMsg(null)
    try {
      const res = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: accessFor.id, email: accessEmail }),
      })
      const json = await res.json()
      if (res.ok) {
        setInviteMsg(`Einladung an ${accessEmail} gesendet. ${accessFor.name} kann jetzt das Passwort setzen.`)
        setEmployees(prev => prev.map(e => e.id === accessFor.id ? { ...e, email: accessEmail, auth_user_id: "pending" } : e))
        setAccessFor(null)
      } else {
        setInviteMsg(`Fehler: ${json.error ?? "Einladung fehlgeschlagen"}`)
      }
    } catch { setInviteMsg("Einladung fehlgeschlagen.") }
    setAccessBusy(false)
  }

  async function setDirectPassword() {
    if (!accessFor || !accessEmail || accessPw.length < 8) return
    setAccessBusy(true); setInviteMsg(null)
    try {
      const res = await fetch("/api/set-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: accessFor.id, email: accessEmail, password: accessPw }),
      })
      const json = await res.json()
      if (res.ok) {
        setInviteMsg(`Zugang für ${accessFor.name} aktiv: ${accessEmail} kann sich sofort einloggen.`)
        setEmployees(prev => prev.map(e => e.id === accessFor.id ? { ...e, email: accessEmail, auth_user_id: "active" } : e))
        setAccessFor(null)
      } else {
        setInviteMsg(`Fehler: ${json.error ?? "Passwort konnte nicht gesetzt werden"}`)
      }
    } catch { setInviteMsg("Vorgang fehlgeschlagen.") }
    setAccessBusy(false)
  }

  async function remove(id: string) {
    if (!confirm("Mitarbeiter wirklich löschen?")) return
    const supabase = createClient()
    await supabase.from("employees").delete().eq("id", id)
    setEmployees(prev => prev.filter(e => e.id !== id))
  }

  return (
    <>
      {inviteMsg && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm text-brand-900 flex-1">{inviteMsg}</p>
          <button onClick={() => setInviteMsg(null)} className="text-brand-400 hover:text-brand-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
          <Plus className="w-4 h-4" /> Mitarbeiter hinzufügen
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-12 text-gray-400 text-sm">Noch keine Mitarbeiter eingetragen.</div>
      ) : (
      <>
      {/* Mobile: Karten-Layout (Aktionen werden nicht abgeschnitten) */}
      <div className="sm:hidden space-y-2.5">
        {employees.map(emp => (
          <div key={emp.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Link href={`/mitarbeiter/${emp.id}`} className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: emp.color }}>
                {emp.name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/mitarbeiter/${emp.id}`} className="font-medium text-gray-900 block truncate">{emp.name}</Link>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{emp.position}</span>
                  <span className="text-xs text-gray-400">{emp.employment_type ?? "—"}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    emp.role === "admin" ? "bg-amber-50 text-amber-700" : emp.role === "manager" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600")}>
                    {ROLE_LABELS[emp.role]}
                  </span>
                </div>
              </div>
            </div>
            {emp.email && <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 flex-shrink-0" />{emp.email}</p>}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
              <button onClick={() => openAccess(emp)}
                className={cn("inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition",
                  emp.auth_user_id ? "border-emerald-200 text-emerald-700" : "border-brand-200 text-brand-700")}>
                {emp.auth_user_id ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                {emp.auth_user_id ? "Zugang" : "Zugang einrichten"}
              </button>
              <button onClick={() => openEdit(emp)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" title="Bearbeiten"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(emp.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Löschen"><Trash2 className="w-4 h-4" /></button>
              <Link href={`/mitarbeiter/${emp.id}`} className="ml-auto p-2 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600" title="Personalakte"><ChevronRight className="w-5 h-5" /></Link>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Tabelle */}
      <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-gray-100">
              <tr className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-4 py-3">Kontakt</th>
                <th className="text-left px-4 py-3">Position</th>
                <th className="text-left px-4 py-3">Anstellung</th>
                <th className="text-left px-4 py-3">Rolle</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-5 py-3">
                    <Link href={`/mitarbeiter/${emp.id}`} className="flex items-center gap-3 group/name">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: emp.color }}>
                        {emp.name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 group-hover/name:text-brand-700 transition">{emp.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs"><Mail className="w-3 h-3" />{emp.email}</div>
                      {emp.phone && <div className="flex items-center gap-1.5 text-gray-400 text-xs"><Phone className="w-3 h-3" />{emp.phone}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">{emp.position}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-600">{emp.employment_type ?? "—"}</div>
                    {emp.hourly_wage != null && <div className="text-xs text-gray-400">{formatEuro(emp.hourly_wage)}/h</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                      emp.role === "admin" ? "bg-amber-50 text-amber-700" :
                      emp.role === "manager" ? "bg-brand-50 text-brand-700" :
                      "bg-gray-100 text-gray-600")}>
                      {ROLE_LABELS[emp.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end items-center">
                      <button onClick={() => openAccess(emp)}
                        className={cn("inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition mr-1",
                          emp.auth_user_id ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-brand-200 text-brand-700 hover:bg-brand-50")}
                        title="App-Zugang verwalten">
                        {emp.auth_user_id ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        {emp.auth_user_id ? "Zugang" : "Zugang einrichten"}
                      </button>
                      <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition" title="Schnell bearbeiten">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(emp.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Löschen">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Link href={`/mitarbeiter/${emp.id}`} className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition" title="Personalakte öffnen">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
      </>
      )}

      {accessFor && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">App-Zugang · {accessFor.name}</h3>
              <button onClick={() => setAccessFor(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {accessFor.auth_user_id ? "Zugang ist aktiv — hier kannst du das Passwort neu setzen." : "Gib diesem Mitarbeiter Zugang zur Mitarbeiter-App."}
            </p>

            <label className="text-xs text-gray-500 mb-1 block font-medium">E-Mail (Login-Name)</label>
            <input type="email" value={accessEmail} onChange={e => setAccessEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />

            <label className="text-xs text-gray-500 mb-1 block font-medium">Passwort direkt vergeben</label>
            <div className="flex gap-2 mb-1.5">
              <input type="text" value={accessPw} onChange={e => setAccessPw(e.target.value)} placeholder="mind. 8 Zeichen"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              <button onClick={setDirectPassword} disabled={accessBusy || accessPw.length < 8 || !accessEmail}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
                {accessBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Setzen"}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Login sofort möglich mit E-Mail + diesem Passwort — ideal zum Testen oder für Mitarbeiter ohne E-Mail.</p>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-px bg-gray-100" /><span className="text-xs text-gray-400">oder</span><div className="flex-1 h-px bg-gray-100" />
            </div>

            <button onClick={sendInvite} disabled={accessBusy || !accessEmail}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
              <Mail className="w-4 h-4" /> Einladung per E-Mail senden
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">{editing ? "Bearbeiten" : "Neuer Mitarbeiter"}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500 mb-1 block font-medium">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Max Mustermann"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block font-medium">E-Mail *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="max@browns.at"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block font-medium">Telefon</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+43 664 …"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block font-medium">Position</label>
                  <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                    {POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label className="text-xs text-gray-500 mb-1 block font-medium">Rolle</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Employee["role"] }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block font-medium">Anstellungsart</label>
                  <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                    {EMPLOYMENT.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label className="text-xs text-gray-500 mb-1 block font-medium">Stundenlohn €</label>
                  <input type="text" inputMode="decimal" value={form.hourly_wage} onChange={e => setForm(f => ({ ...f, hourly_wage: e.target.value }))}
                    placeholder="14,50" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-2 block font-medium">Farbe</label>
                <div className="flex gap-2 flex-wrap">{COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={cn("w-7 h-7 rounded-full flex items-center justify-center ring-offset-1 transition", form.color === c ? "ring-2" : "ring-0")}
                    style={{ backgroundColor: c }}>
                    {form.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Abbrechen</button>
              <button onClick={save} disabled={saving || !form.name || !form.email}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Speichern…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
