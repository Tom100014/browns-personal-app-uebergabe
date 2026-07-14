"use client"

import { useState } from "react"
import { Check, KeyRound, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

export default function PasswordChange() {
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setMessage(null)
    setError(null)
    if (password.length < 8) { setError("Das Passwort muss mindestens 8 Zeichen haben."); return }
    if (password !== repeat) { setError("Die Passwörter stimmen nicht überein."); return }
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else {
      setMessage("Passwort wurde geändert.")
      setPassword("")
      setRepeat("")
    }
    setBusy(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-gray-900">Passwort ändern</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Neues Passwort"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <input type="password" value={repeat} onChange={e => setRepeat(e.target.value)}
          placeholder="Passwort wiederholen"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      {message && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> {message}</p>}
      <button onClick={save} disabled={busy || !password || !repeat}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Passwort speichern
      </button>
    </div>
  )
}
