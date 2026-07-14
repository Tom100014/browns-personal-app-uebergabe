"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, KeyRound } from "lucide-react"
import { createClient } from "@/lib/supabase"
import Logo from "@/components/brand/Logo"

export default function WillkommenPage() {
  const router = useRouter()
  const [ready, setReady] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true)
    })
    // After a short grace period, if no session arrived, the link is invalid/expired.
    const t = setTimeout(() => setReady(prev => (prev === null ? false : prev)), 4000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("Das Passwort muss mindestens 8 Zeichen haben."); return }
    if (password !== confirm) { setError("Die Passwörter stimmen nicht überein."); return }
    setSaving(true)
    const supabase = createClient()
    const { error: upErr } = await supabase.auth.updateUser({ password })
    if (upErr) { setError(upErr.message); setSaving(false); return }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-7">
      <div className="flex flex-col items-center text-center mb-6">
        <Logo variant="light" subtitle="MITARBEITER" />
        <h1 className="font-bold text-gray-900 text-lg mt-4">Willkommen im Team</h1>
        <p className="text-gray-500 text-sm mt-1">Lege jetzt dein persönliches Passwort fest.</p>
      </div>

      {ready === null && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Einladung wird geprüft…
        </div>
      )}

      {ready === false && (
        <div className="text-center text-sm text-gray-600 py-6">
          <p>Dieser Einladungslink ist ungültig oder abgelaufen.</p>
          <p className="text-gray-400 mt-2">Bitte fordere bei der Leitung eine neue Einladung an.</p>
        </div>
      )}

      {ready === true && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">Neues Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mindestens 8 Zeichen" autoComplete="new-password"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">Passwort wiederholen</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Passwort speichern &amp; starten
          </button>
        </form>
      )}
    </div>
  )
}
