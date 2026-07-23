"use client"

import { useRef, useState } from "react"
import { Check, KeyRound, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { PasswordInput } from "@/components/ui/PasswordInput"

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
      setMessage("Passwort wurde erfolgreich geändert.")
      setPassword("")
      setRepeat("")
    }
    setBusy(false)
  }

  return (
    <form onSubmit={event => { event.preventDefault(); void save() }} aria-busy={busy} className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Passwort ändern</h2>
        </div>
        <span className="text-[11px] font-medium text-gray-400">Sicherheitsbereich</span>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          ref={passwordRef}
          id="new-password"
          name="new-password"
          label="Neues Passwort"
          placeholder="Neues Passwort eingeben"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          showStrength={true}
        />
        <PasswordInput
          ref={repeatRef}
          id="repeat-password"
          name="repeat-password"
          label="Passwort wiederholen"
          placeholder="Passwort erneut eingeben"
          autoComplete="new-password"
          value={repeat}
          onChange={e => setRepeat(e.target.value)}
        />
      </div>

      {error && <p id="password-error" role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      {message && <p role="status" aria-live="polite" className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check aria-hidden="true" className="h-3.5 w-3.5" /> {message}</p>}
      
      <button type="submit" disabled={busy || !password || !repeat} aria-busy={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50">
        {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <KeyRound aria-hidden="true" className="h-4 w-4" />}
        {busy ? "Passwort wird gespeichert…" : "Passwort jetzt speichern"}
      </button>
    </form>
  )
}
