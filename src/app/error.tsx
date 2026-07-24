"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-red-100 rounded-full">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oops, etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-gray-600 text-sm">
            Es gab einen unerwarteten Fehler beim Laden dieser Seite. Bitte versuche es erneut.
          </p>
          {error.message && (
            <p className="mt-3 text-xs text-gray-500 font-mono bg-gray-100 rounded p-3 overflow-auto max-h-24">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-xl transition">
            Erneut versuchen
          </button>
          <Link href="/" className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-4 rounded-xl transition text-center inline-block">
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  )
}
