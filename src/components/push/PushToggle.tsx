"use client"

import { useEffect, useState } from "react"
import { Bell, BellRing, BellOff, Loader2, Smartphone } from "lucide-react"
import { subscribePush, getPushStatus, type PushStatus } from "@/lib/push-client"
import { cn } from "@/lib/utils"

export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<PushStatus>("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { getPushStatus().then(setStatus) }, [])

  async function enable() {
    setBusy(true); setError(null)
    const res = await subscribePush()
    if (res.ok) setStatus("subscribed")
    else { setError(res.error ?? "Fehler"); setStatus(await getPushStatus()) }
    setBusy(false)
  }

  if (status === "subscribed") {
    return (
      <div className={cn("inline-flex items-center gap-2 text-sm font-medium text-emerald-700", !compact && "px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200")}>
        <BellRing className="w-4 h-4" /> Benachrichtigungen aktiv
      </div>
    )
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-gray-500 flex items-start gap-1.5">
        <Smartphone className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        Auf dem iPhone: über &quot;Teilen → Zum Home-Bildschirm&quot; installieren, dann sind Benachrichtigungen verfügbar.
      </p>
    )
  }

  if (status === "denied") {
    return (
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <BellOff className="w-3.5 h-3.5" /> Benachrichtigungen sind im Browser blockiert — bitte in den Browser-Einstellungen erlauben.
      </p>
    )
  }

  return (
    <div>
      <button onClick={enable} disabled={busy || status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
        Benachrichtigungen aktivieren
      </button>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
