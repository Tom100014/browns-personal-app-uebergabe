"use client"

import { useState } from "react"
import { BellRing, Loader2 } from "lucide-react"

export default function PushTestButton() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function testPush() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "self",
          title: "Browns Push-Test",
          body: "Wenn du diese Meldung siehst, funktionieren Push-Benachrichtigungen auf diesem Gerät.",
          url: "/nachrichten",
          tag: "push-test",
          important: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setMessage(data.error || "Push-Test fehlgeschlagen.")
      else setMessage(`${data.sent ?? 0} Test-Benachrichtigung(en) gesendet.`)
    } catch {
      setMessage("Push-Test fehlgeschlagen.")
    }
    setBusy(false)
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button onClick={testPush} disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
        Push testen
      </button>
      {message && <p className="text-xs font-medium text-gray-500">{message}</p>}
    </div>
  )
}
