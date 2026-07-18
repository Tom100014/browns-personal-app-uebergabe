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
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">Passwort</label>
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
      </div>
      <p className="text-center text-xs text-white/90 mt-5">{DEVELOPER_LINE}</p>
    </div>
  )
}
