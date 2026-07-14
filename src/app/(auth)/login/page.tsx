"use client"

import { useState } from "react"
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError("E-Mail oder Passwort falsch."); setLoading(false); return }
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
          <p className="text-gray-500 text-sm mt-1 text-center">Personalplanung für Browns Coffee Lounge</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="name@browns.at"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition text-sm pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition disabled:opacity-50">
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
      <p className="text-center text-xs text-white/60 mt-5">{DEVELOPER_LINE}</p>
    </div>
  )
}
