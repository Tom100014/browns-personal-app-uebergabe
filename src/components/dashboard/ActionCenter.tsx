import Link from "next/link"
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  LifeBuoy,
  UserRoundCog,
  UserX,
  UsersRound,
} from "lucide-react"

export type DashboardActionItem = {
  id: string
  href: string
  title: string
  detail: string
  count: number
  kind: "drafts" | "planning-profiles" | "absences" | "coverage" | "unfilled" | "knowledge"
  severity: "critical" | "warning" | "info"
  status: string
}

const ICONS = {
  drafts: CalendarClock,
  "planning-profiles": UserRoundCog,
  absences: UserX,
  coverage: LifeBuoy,
  unfilled: UsersRound,
  knowledge: FileSearch,
}

const SEVERITY = {
  critical: {
    label: "Kritisch",
    badge: "bg-red-50 text-red-700 ring-red-200",
    icon: "bg-red-50 text-red-600",
  },
  warning: {
    label: "Wichtig",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    icon: "bg-amber-50 text-amber-700",
  },
  info: {
    label: "Hinweis",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
    icon: "bg-sky-50 text-sky-700",
  },
}

export default function ActionCenter({ items }: { items: DashboardActionItem[] }) {
  return (
    <section aria-labelledby="action-center-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="action-center-heading" className="text-base font-bold text-slate-950">Aufgaben &amp; Hinweise</h2>
          <p className="mt-0.5 text-xs text-slate-500">Offene Punkte, die eine Entscheidung oder Bearbeitung brauchen.</p>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-semibold tabular-nums text-slate-500">
            {items.length} {items.length === 1 ? "Thema" : "Themen"}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-950">Alles im grünen Bereich</p>
            <p className="mt-0.5 text-xs text-emerald-800">Aktuell gibt es keine offenen Aufgaben oder Hinweise.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
          <div className="divide-y divide-slate-100">
            {items.map(item => {
              const Icon = ICONS[item.kind]
              const severity = SEVERITY[item.severity]

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:gap-4 sm:px-5"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${severity.icon}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${severity.badge}`}>
                        {severity.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">{item.status}</span>
                    </span>
                    <span className="mt-1 block text-sm font-bold text-slate-950">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.detail}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="stat-number min-w-7 text-right text-lg font-bold tabular-nums text-slate-700">
                      {item.count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
