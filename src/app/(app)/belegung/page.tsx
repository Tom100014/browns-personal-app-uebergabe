import OccupancyForecast from "@/components/belegung/OccupancyForecast"
import { Brain, CalendarDays, Sparkles } from "lucide-react"

export default function BelegungPage() {
  return (
    <div className="space-y-6">
      <div className="soft-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-700 shadow-card">
              <Sparkles className="h-3.5 w-3.5" />
              Browns Forecast
            </div>
            <h1 className="text-3xl leading-tight text-slate-950 sm:text-5xl">Belegung & Prognose</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              7-Tage-Vorschau aus Wetter, Wochentag und Events. Markiere Veranstaltungen als nennenswert oder nicht relevant, damit die Prognose für Browns präziser wird.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
            <div className="rounded-3xl bg-white p-4 shadow-card">
              <CalendarDays className="mb-4 h-5 w-5 text-brand-500" />
              <p className="stat-number text-3xl text-slate-950">7</p>
              <p className="text-xs font-semibold text-slate-400">Tage Forecast</p>
            </div>
            <div className="rounded-3xl bg-white p-4 shadow-card">
              <Brain className="mb-4 h-5 w-5 text-brand-500" />
              <p className="stat-number text-3xl text-slate-950">KI</p>
              <p className="text-xs font-semibold text-slate-400">lernt Eventwirkung</p>
            </div>
          </div>
        </div>
      </div>
      <OccupancyForecast />
    </div>
  )
}
