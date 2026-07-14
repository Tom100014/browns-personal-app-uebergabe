import Link from "next/link"
import { Compass, ArrowRight } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <Compass className="w-6 h-6 text-brand-600" />
        </div>
        <p className="text-5xl font-bold text-gray-900">404</p>
        <h1 className="text-lg font-semibold text-gray-900 mt-2">Seite nicht gefunden</h1>
        <p className="text-sm text-gray-500 mt-1.5">
          Diese Seite gibt es nicht (mehr). Vielleicht hat sich die Adresse geändert.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition">
            Zum Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/portal" className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition">
            Zur Mitarbeiter-App
          </Link>
        </div>
      </div>
    </div>
  )
}
