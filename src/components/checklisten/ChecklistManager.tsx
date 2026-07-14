"use client"

import { useState } from "react"
import { Plus, Check, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Employee } from "@/types"

export type ChecklistItem = { id: string; checklist_id: string; label: string; done: boolean; done_by?: string; done_at?: string }
export type Checklist = { id: string; title: string; shift_id?: string; created_at: string; items?: ChecklistItem[] }

interface Props { checklists: Checklist[]; employees: Employee[]; canManage?: boolean; selfEmployeeId?: string }

export default function ChecklistManager({ checklists: initial, employees, canManage = true, selfEmployeeId }: Props) {
  const [checklists, setChecklists] = useState<Checklist[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newItems, setNewItems] = useState([""])
  const [saving, setSaving] = useState(false)
  const [activeEmployee, setActiveEmployee] = useState(selfEmployeeId ?? employees[0]?.id ?? "")

  async function createChecklist() {
    if (!newTitle.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: cl } = await supabase.from("checklists").insert({ title: newTitle }).select().single()
    if (cl) {
      const items = newItems.filter(i => i.trim()).map(label => ({ checklist_id: cl.id, label, done: false }))
      if (items.length) await supabase.from("checklist_items").insert(items)
      const { data: itemsData } = await supabase.from("checklist_items").select("*").eq("checklist_id", cl.id)
      setChecklists(prev => [...prev, { ...cl, items: itemsData ?? [] }])
    }
    setSaving(false); setShowForm(false)
    setNewTitle(""); setNewItems([""])
  }

  async function toggleItem(checklistId: string, itemId: string, done: boolean) {
    const supabase = createClient()
    const update = done
      ? { done: true, done_by: activeEmployee, done_at: new Date().toISOString() }
      : { done: false, done_by: undefined, done_at: undefined }
    await supabase.from("checklist_items").update(update).eq("id", itemId)
    setChecklists(prev => prev.map(cl => cl.id === checklistId
      ? { ...cl, items: cl.items?.map(i => i.id === itemId ? { ...i, ...update } : i) }
      : cl))
  }

  async function deleteChecklist(id: string) {
    const supabase = createClient()
    await supabase.from("checklists").delete().eq("id", id)
    setChecklists(prev => prev.filter(cl => cl.id !== id))
  }

  return (
    <>
      {canManage && (
        <div className="flex items-center justify-between mb-4">
          <select value={activeEmployee} onChange={e => setActiveEmployee(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            {employees.map(e => <option key={e.id} value={e.id}>Als: {e.name}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
            <Plus className="w-4 h-4" /> Neue Checkliste
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {checklists.map(cl => {
          const doneCount = cl.items?.filter(i => i.done).length ?? 0
          const totalCount = cl.items?.length ?? 0
          const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
          return (
            <div key={cl.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{cl.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{doneCount}/{totalCount} erledigt</p>
                </div>
                {canManage && (
                  <button onClick={() => deleteChecklist(cl.id)} className="text-gray-300 hover:text-red-400 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {totalCount > 0 && (
                <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="space-y-1.5">
                {cl.items?.map(item => {
                  const doneEmp = item.done_by ? employees.find(e => e.id === item.done_by) : undefined
                  return (
                    <button key={item.id} onClick={() => toggleItem(cl.id, item.id, !item.done)}
                      className="flex items-center gap-2.5 w-full text-left group">
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition ${
                        item.done ? "bg-brand-600 border-brand-600" : "border-gray-300 group-hover:border-brand-400"}`}>
                        {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={`text-sm transition flex-1 ${item.done ? "text-gray-400 line-through" : "text-gray-700"}`}>
                        {item.label}
                      </span>
                      {item.done && doneEmp && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0" title={`Erledigt von ${doneEmp.name}${item.done_at ? " um " + item.done_at.slice(11, 16) : ""}`}>
                          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ backgroundColor: doneEmp.color }}>
                            {doneEmp.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </span>
                        </span>
                      )}
                    </button>
                  )
                })}
                {totalCount === 0 && <p className="text-xs text-gray-400">Keine Aufgaben.</p>}
              </div>
            </div>
          )
        })}
        {checklists.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400 text-sm">
            Noch keine Checklisten. Erstelle deine erste!
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Neue Checkliste</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Titel</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="z.B. Morgenroutine"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-2 block font-medium">Aufgaben</label>
                <div className="space-y-2">
                  {newItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={item} onChange={e => {
                        const next = [...newItems]; next[i] = e.target.value; setNewItems(next)
                      }} placeholder={`Aufgabe ${i+1}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                      {newItems.length > 1 && (
                        <button onClick={() => setNewItems(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setNewItems(prev => [...prev, ""])}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Aufgabe hinzufügen</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">Abbrechen</button>
              <button onClick={createChecklist} disabled={saving || !newTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm transition disabled:opacity-50">
                {saving ? "Erstellen…" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
