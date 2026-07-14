"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

export default function NotifyMuteToggle({ employeeId, initial }: { employeeId: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    await createClient().from("employees").update({ notifications_enabled: next }).eq("id", employeeId)
    setSaving(false)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-800">Benachrichtigungen aktiv</p>
        <p className="text-xs text-gray-500">Aus = du erhältst keine Push/E-Mail/WhatsApp mehr (außer im Notfall).</p>
      </div>
      <button onClick={toggle} disabled={saving} aria-pressed={enabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white mx-auto" />
          : <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${enabled ? "translate-x-6" : "translate-x-1"}`} />}
      </button>
    </div>
  )
}
