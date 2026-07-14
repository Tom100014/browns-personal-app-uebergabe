"use client"

import { useState, useEffect } from "react"
import { MessageCircle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

export default function WhatsAppSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/whatsapp/status").then(r => r.json()).then(d => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false))
    createClient().from("settings").select("value").eq("key", "whatsapp_enabled").maybeSingle()
      .then(({ data }) => setEnabled(data?.value === "true"))
  }, [])

  async function toggle() {
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    await createClient().from("settings").upsert({ key: "whatsapp_enabled", value: next ? "true" : "false" })
    setSaving(false)
  }

  if (configured === null) return null

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">WhatsApp-Benachrichtigungen</span>
        {configured ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verbunden
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            <AlertCircle className="w-3.5 h-3.5" /> Nicht konfiguriert
          </span>
        )}
      </div>

      {configured ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3.5 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-800">WhatsApp aktiv senden</p>
            <p className="text-xs text-gray-500">Wichtige Meldungen zusätzlich per WhatsApp an die Mitarbeiter-Nummern.</p>
          </div>
          <button onClick={toggle} disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white mx-auto" />
              : <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${enabled ? "translate-x-6" : "translate-x-1"}`} />}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Zum Aktivieren in Vercel hinterlegen:
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">WHATSAPP_TOKEN</code> und
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">WHATSAPP_PHONE_NUMBER_ID</code> (aus dem Meta-Business-/WhatsApp-Cloud-API-Konto oder von einem Anbieter wie Twilio / 360dialog).
          Danach erscheint hier der Schalter zum Ein-/Ausschalten. Mitarbeiter-Telefonnummern werden im Profil gepflegt; Meta erfordert vorab freigegebene Vorlagen für proaktive Nachrichten.
        </p>
      )}
    </div>
  )
}
