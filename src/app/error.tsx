"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Seite konnte nicht geladen werden</h1>
        <p className="text-sm text-gray-500 mt-1.5">
          Die Verbindung zum Server hat zu lange gedauert oder ist fehlgeschlagen. Bitte versuche es erneut.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <button onClick={reset} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
            <RotateCcw className="w-4 h-4" /> Erneut versuchen
          </button>
          <Link href="/login" className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    </div>
  )
}
