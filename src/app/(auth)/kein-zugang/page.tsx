"use client"

import { useRouter } from "next/navigation"
import { LogOut, UserX } from "lucide-react"
import { createClient } from "@/lib/supabase"
import Logo from "@/components/brand/Logo"

export default function KeinZugangPage() {
  const router = useRouter()
  async function logout() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }
  return (
    <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-7 text-center">
      <div className="flex justify-center mb-4"><Logo variant="light" subtitle="PERSO" /></div>
      <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <UserX className="w-5 h-5 text-gray-500" />
      </div>
      <h1 className="font-bold text-gray-900 text-lg">Kein Profil verknüpft</h1>
      <p className="text-gray-500 text-sm mt-1 mb-5">
        Dieser Zugang ist mit keinem Mitarbeiter-Profil verbunden. Bitte wende dich an die Leitung.
      </p>
      <button onClick={logout}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
        <LogOut className="w-4 h-4" /> Abmelden
      </button>
    </div>
  )
}
