"use client"

import { useRef, useState } from "react"
import { Check, KeyRound, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

export default function PasswordChange() {
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const repeatRef = useRef<HTMLInputElement>(null)

  async function save() {
    setMessage(null)
    setError(null)
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.")
      passwordRef.current?.focus()
      return
    }
    if (password !== repeat) {
      setError("Die Passwörter stimmen nicht überein.")
      repeatRef.current?.focus()
      return
    }
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
    <form onSubmit={event => { event.preventDefault(); void save() }} aria-busy={busy} className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound aria-hidden="true" className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-gray-900">Passwort ändern</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-gray-500">Neues Passwort</label>
          <input ref={passwordRef} id="new-password" name="new-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? "password-error" : "password-help"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          <p id="password-help" className="mt-1 text-xs text-gray-500">Mindestens 8 Zeichen.</p>
        </div>
        <div>
          <label htmlFor="repeat-password" className="mb-1 block text-xs font-medium text-gray-500">Passwort wiederholen</label>
          <input ref={repeatRef} id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? "password-error" : undefined}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </div>
      </div>
      {error && <p id="password-error" role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {message && <p role="status" aria-live="polite" className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check aria-hidden="true" className="h-3.5 w-3.5" /> {message}</p>}
      <button type="submit" disabled={busy || !password || !repeat} aria-busy={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50">
        {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <KeyRound aria-hidden="true" className="h-4 w-4" />}
        {busy ? "Passwort wird gespeichert…" : "Passwort speichern"}
      </button>
    </form>
  )
}
