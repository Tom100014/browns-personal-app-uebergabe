"use client"

import { useState, useEffect } from "react"
import { Mail, CheckCircle2, AlertCircle, Send, Loader2 } from "lucide-react"

export default function EmailStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [fromAddress, setFromAddress] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null)

  useEffect(() => {
    fetch("/api/email/status")
      .then(r => r.json())
      .then(d => {
        setConfigured(Boolean(d.configured))
        setFromAddress(d.from || null)
      })
      .catch(() => setConfigured(false))
  }, [])

  async function sendTestEmail() {
    setSending(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/email/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({ success: true, message: `Test-E-Mail erfolgreich an ${data.recipient} gesendet!` })
      } else {
        setTestResult({ success: false, message: data.error || "Senden fehlgeschlagen." })
      }
    } catch {
      setTestResult({ success: false, message: "Fehler beim Verbinden mit dem Server." })
    }
    setSending(false)
  }

  if (configured === null) return null

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">E-Mail-Benachrichtigungen (Resend)</span>
        {configured ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Aktiv
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            <AlertCircle className="w-3.5 h-3.5" /> Nicht konfiguriert
          </span>
        )}
      </div>

      {configured ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">
            Absender: <span className="font-mono text-gray-700">{fromAddress || "Nicht angegeben"}</span>
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={sendTestEmail}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black transition disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Test-E-Mail senden
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 p-2.5 rounded-lg text-xs border ${testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {testResult.message}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Zum Aktivieren in Vercel zwei Variablen hinterlegen:
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">RESEND_API_KEY</code> und
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">RESEND_FROM</code> (z.&nbsp;B. <span className="font-mono">Browns Perso &lt;no-reply@deine-domain.de&gt;</span>).
        </p>
      )}
    </div>
  )
}
