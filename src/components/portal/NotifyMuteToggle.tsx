"use client"

import { useState } from "react"
import { Bell, BellOff, Loader2, Volume2, VolumeX } from "lucide-react"
import { createClient } from "@/lib/supabase"

export default function NotifyMuteToggle({ employeeId, initial }: { employeeId: string; initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    await createClient().from("employees").update({ notifications_enabled: next }).eq("id", employeeId)
    setSaving(false)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Bell className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-2 rounded-xl bg-gray-100 text-gray-400">
              <BellOff className="w-4 h-4" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">Push &amp; E-Mail Benachrichtigungen</p>
            <p className="text-xs text-gray-500">
              {enabled
                ? "Aktiv (Push-Signale & E-Mails werden direkt auf dein Handy geschickt)."
                : "Stummgeschaltet (Keine Benachrichtigungen außer Notfall-Signalen)."}
            </p>
          </div>
        </div>

        <button onClick={toggle} disabled={saving} aria-pressed={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white mx-auto" />
            : <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition shadow-sm ${enabled ? "translate-x-6" : "translate-x-1"}`} />}
        </button>
      </div>

      {enabled && (
        <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-brand-600" /> : <VolumeX className="w-3.5 h-3.5 text-gray-400" />}
            <span>Benachrichtigungs-Ton für Handy-Sperrbildschirm</span>
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${soundEnabled ? "bg-brand-50 text-brand-700 border border-brand-200" : "bg-gray-200 text-gray-600"}`}
          >
            {soundEnabled ? "Ton An" : "Stumm"}
          </button>
        </div>
      )}
    </div>
  )
}
