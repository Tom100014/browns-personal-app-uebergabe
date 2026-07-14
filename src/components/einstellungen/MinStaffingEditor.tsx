"use client"

import { useState, useEffect } from "react"
import { Save, Check, Minus, Plus, Users } from "lucide-react"
import { createClient } from "@/lib/supabase"

// Stationen identisch zu den Positionen im Schichtplan (ShiftCalendar).
const STATIONS = ["Service", "Theke", "Küche", "Spüle", "Bar", "Kasse", "Reinigung", "Leitung"] as const
const MAX_PER_STATION = 12

export default function MinStaffingEditor() {
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    createClient().from("settings").select("value").eq("key", "min_staffing").maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return
        try { setValues(JSON.parse(data.value) as Record<string, number>) } catch { /* ignore */ }
      })
  }, [])

  function set(station: string, n: number) {
    const clamped = Math.max(0, Math.min(MAX_PER_STATION, n))
    setValues(prev => {
      const next = { ...prev }
      if (clamped === 0) delete next[station]
      else next[station] = clamped
      return next
    })
  }

  async function save() {
    setSaving(true)
    await createClient().from("settings").upsert({ key: "min_staffing", value: JSON.stringify(values) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Users className="w-4.5 h-4.5 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Mindestbesetzung pro Station</h2>
          <p className="text-gray-500 text-xs mt-1">
            Wie viele Personen müssen pro Station und Tag mindestens eingeplant sein? Der Schichtplan
            warnt rot, sobald eine Station unter dieser Zahl liegt. 0 = keine Vorgabe.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {STATIONS.map(station => {
          const n = values[station] ?? 0
          return (
            <div key={station} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <span className="text-sm font-medium text-gray-700">{station}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => set(station, n - 1)} disabled={n <= 0}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition disabled:opacity-30">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums text-gray-900">{n}</span>
                <button type="button" onClick={() => set(station, n + 1)} disabled={n >= MAX_PER_STATION}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition disabled:opacity-30">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={save} disabled={saving}
        className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
        {saved ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Mindestbesetzung speichern</>}
      </button>
    </div>
  )
}
