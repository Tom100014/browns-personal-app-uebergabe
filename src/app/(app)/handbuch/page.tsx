import {
  Rocket, KeyRound, LayoutDashboard, Users, Calendar, Clock, CalendarOff,
  LifeBuoy, TrendingUp, Bot, BarChart3, MessageSquare, CheckSquare, Settings,
  Smartphone, Bell, RefreshCw, ShieldCheck, type LucideIcon,
} from "lucide-react"
import handbook from "@/lib/handbook.json"

const ICONS: Record<string, LucideIcon> = {
  Rocket, KeyRound, LayoutDashboard, Users, Calendar, Clock, CalendarOff,
  LifeBuoy, TrendingUp, Bot, BarChart3, MessageSquare, CheckSquare, Settings,
  Smartphone, Bell, RefreshCw, ShieldCheck,
}

type Block = { heading?: string; steps?: string[]; tips?: string[] }
type Section = { id: string; icon: string; title: string; intro?: string; blocks: Block[] }

export default function HandbuchPage() {
  const sections = handbook.sections as Section[]

  return (
    <div className="w-full min-w-0 max-w-7xl p-4 sm:p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">{handbook.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{handbook.subtitle}</p>
        <p className="text-gray-400 text-xs mt-0.5">Version {handbook.version}</p>
      </div>

      {/* Inhaltsverzeichnis */}
      <nav className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Inhalt</h2>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {sections.map(s => {
            const Icon = ICONS[s.icon] ?? Bot
            return (
              <li key={s.id}>
                <a href={`#${s.id}`} className="group flex items-center gap-2.5 text-sm text-gray-600 hover:text-brand-700 transition">
                  <span className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-brand-50 flex items-center justify-center flex-shrink-0 transition">
                    <Icon className="w-3.5 h-3.5 text-gray-500 group-hover:text-brand-600" />
                  </span>
                  {s.title}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="space-y-5">
        {sections.map(s => {
          const Icon = ICONS[s.icon] ?? Bot
          return (
            <section key={s.id} id={s.id} className="scroll-mt-6 bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{s.title}</h2>
              </div>
              {s.intro && <p className="text-sm text-gray-500 leading-relaxed mb-4">{s.intro}</p>}

              <div className="space-y-4">
                {s.blocks.map((b, bi) => (
                  <div key={bi}>
                    {b.heading && <h3 className="text-sm font-semibold text-gray-800 mb-2">{b.heading}</h3>}
                    {b.steps && (
                      <ol className="space-y-1.5">
                        {b.steps.map((step, i) => (
                          <li key={i} className="text-sm text-gray-700 leading-relaxed flex gap-2.5">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {b.tips && b.tips.length > 0 && (
                      <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-100 px-3.5 py-2.5">
                        <ul className="space-y-1">
                          {b.tips.map((tip, i) => (
                            <li key={i} className="text-xs text-amber-900 leading-relaxed flex gap-2">
                              <span className="text-amber-500">💡</span><span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-6 text-center space-y-1">
        <p className="text-xs text-gray-400">
          Browns Perso · {handbook.title} · Version {handbook.version} — diese Anleitung gibt es auch als PDF auf dem Desktop.
        </p>
        <p className="text-xs text-gray-400">{handbook.developer}</p>
      </div>
    </div>
  )
}
