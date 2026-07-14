"use client"

import { useState, useEffect } from "react"
import { Mail, CheckCircle2, AlertCircle } from "lucide-react"

export default function EmailStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/email/status").then(r => r.json()).then(d => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false))
  }, [])

  if (configured === null) return null

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">E-Mail-Benachrichtigungen</span>
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
        <p className="text-xs text-gray-500 mt-2">Wichtige Hinweise gehen zusätzlich zur Push-Nachricht auch per E-Mail raus (Vertretung, Anträge, Plan-Veröffentlichung).</p>
      ) : (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Zum Aktivieren in Vercel zwei Variablen hinterlegen:
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">RESEND_API_KEY</code> (Konto auf resend.com, kostenlos bis 3.000 Mails/Monat) und
          <code className="mx-1 bg-gray-100 px-1 py-0.5 rounded">RESEND_FROM</code> (z.&nbsp;B. <span className="font-mono">Browns Perso &lt;no-reply@deine-domain.de&gt;</span>, Absender-Domain muss verifiziert sein). Danach ist E-Mail sofort aktiv.
        </p>
      )}
    </div>
  )
}
