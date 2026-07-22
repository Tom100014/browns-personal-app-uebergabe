"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Eye, EyeOff } from "lucide-react"
import Logo from "@/components/brand/Logo"
import { DEVELOPER_LINE } from "@/lib/app-info"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError("E-Mail oder Passwort falsch.")
      setLoading(false)
      requestAnimationFrame(() => passwordRef.current?.focus())
      return
    }
    const userId = data.user?.id
    const { data: employee } = userId
      ? await supabase.from("employees").select("role").eq("auth_user_id", userId).maybeSingle()
      : { data: null }
    const isOwner = data.user?.email === "admin@browns.at"
    const isManager = isOwner || employee?.role === "admin" || employee?.role === "manager"
    router.push(isManager ? "/dashboard" : "/portal")
    router.refresh()
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetEmail) return
    setResetLoading(true)
    setResetMsg(null)
    setResetError(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/portal/profil`
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo })

    if (error) {
      setResetError("Anforderung fehlgeschlagen: " + error.message)
    } else {
      setResetMsg("Ein Link zum Zurücksetzen deines Passworts wurde an deine E-Mail gesendet.")
      setResetEmail("")
    }
    setResetLoading(false)
  }

  return (
    <div className="w-full max-w-sm px-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo variant="light" subtitle="PERSONALPLANUNG" />
          <h1 className="sr-only">Bei Browns Personalplanung anmelden</h1>
          <p id="login-description" className="text-gray-500 text-sm mt-1 text-center">Personalplanung für Browns Coffee Lounge</p>
        </div>

        <form onSubmit={handleLogin} aria-describedby="login-description" aria-busy={loading} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">E-Mail</label>
            <input id="login-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
              aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined}
              placeholder="name@browns.at"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition text-sm" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Passwort</label>
              <button
                type="button"
                onClick={() => { setResetModalOpen(true); setResetMsg(null); setResetError(null) }}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
              >
                Passwort vergessen?
              </button>
            </div>
            <div className="relative">
              <input ref={passwordRef} id="login-password" name="password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                autoComplete="current-password" aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition text-sm pr-12" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? "Passwort ausblenden" : "Passwort anzeigen"} aria-pressed={showPw}
                aria-controls="login-password"
                className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700">
                {showPw ? <EyeOff aria-hidden="true" className="w-4 h-4" /> : <Eye aria-hidden="true" className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p id="login-error" role="alert" className="text-red-700 text-sm bg-red-50 border border-red-300 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} aria-busy={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition disabled:opacity-50">
            <span aria-live="polite">{loading ? "Anmeldung läuft…" : "Anmelden"}</span>
          </button>
        </form>

        {/* Passwort vergessen Modal */}
        {resetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Passwort zurücksetzen</h2>
              <p className="text-xs text-gray-500 mb-4">
                Gib deine E-Mail-Adresse ein. Du erhältst einen Link, um dein Passwort neu festzulegen.
              </p>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-semibold text-gray-700 mb-1">E-Mail-Adresse</label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    placeholder="deine-email@browns.at"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                {resetError && <p className="text-xs text-red-700 bg-red-50 p-2 rounded">{resetError}</p>}
                {resetMsg && <p className="text-xs text-emerald-800 bg-emerald-50 p-2 rounded">{resetMsg}</p>}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="flex-1 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {resetLoading ? "Senden…" : "Link anfordern"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-white/90 mt-5">{DEVELOPER_LINE}</p>
    </div>
  )
}
