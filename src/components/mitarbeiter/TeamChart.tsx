import { AlertTriangle, Brain, Clock3, KeyRound, ShieldCheck, Sparkles, Users } from "lucide-react"
import type { Employee } from "@/types"
import type { EmployeeIntelligence } from "@/lib/employee-intelligence"

const ROLE_LABELS: Record<string, string> = { employee: "Mitarbeiter", manager: "Manager", admin: "Admin" }

function percent(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function hours(value: number) {
  return `${value.toFixed(1).replace(".", ",")} h`
}

function riskScore(row: EmployeeIntelligence) {
  return row.riskSignals * 3 + row.pendingAbsences * 2 + row.shiftsWithoutEntry + Math.min(row.sickDays, 5)
}

export default function TeamChart({ employees, intelligence = [] }: { employees: Employee[]; intelligence?: EmployeeIntelligence[] }) {
  const total = employees.length
  const activeAccess = employees.filter(e => !!e.auth_user_id).length
  const roles = ["employee", "manager", "admin"].map(role => ({
    role,
    label: ROLE_LABELS[role],
    count: employees.filter(e => e.role === role).length,
  }))
  const positions = [...new Set(employees.map(e => e.position).filter(Boolean))]
    .map(position => ({ position, count: employees.filter(e => e.position === position).length }))
    .sort((a, b) => b.count - a.count)

  const reviewRows = intelligence.filter(row => riskScore(row) > 0)
  const positiveRows = intelligence.filter(row => row.positiveSignals > 0 || row.pairHints.some(p => p.label === "eingespielt"))
  const sickDays = intelligence.reduce((sum, row) => sum + row.sickDays, 0)
  const missingEntries = intelligence.reduce((sum, row) => sum + row.shiftsWithoutEntry, 0)
  const topRows = [...intelligence]
    .sort((a, b) => (riskScore(b) + b.positiveSignals) - (riskScore(a) + a.positiveSignals))
    .slice(0, 6)

  return (
    <div className="mb-5 space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-card p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <Users className="h-4 w-4 text-brand-600" /> Team-Chart
              </h2>
              <p className="mt-1 text-xs text-slate-500">Stationen, Rollen und App-Zugänge für die tägliche Planung.</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{total} Personen</span>
          </div>

          <div className="space-y-3">
            {positions.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Noch keine Stationen vorhanden.</p>
            ) : positions.map(({ position, count }) => (
              <div key={position}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">{position}</span>
                  <span className="font-bold text-slate-950">{count}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(8, percent(count, total))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-950">App-Zugänge</h2>
            </div>
            <p className="stat-number text-4xl text-slate-950">{activeAccess}/{total}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Mitarbeiter mit Login</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent(activeAccess, total)}%` }} />
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-950">Rollen</h2>
            </div>
            <div className="space-y-2">
              {roles.map(({ role, label, count }) => (
                <div key={role} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-600">{label}</span>
                  <span className="stat-number text-lg text-slate-950">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="floating-card overflow-hidden">
        <div className="brand-topbar px-5 py-4 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-black">
                <Brain className="h-5 w-5" /> Team Intelligence
              </h2>
              <p className="mt-1 text-xs font-semibold text-white/80">RAG-Signale aus Wissen, Abwesenheiten, Zeitdaten und gemeinsamen Schichten.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/18 px-3 py-1 text-xs font-bold">{positiveRows.length} positive Signale</span>
              <span className="rounded-full bg-white/18 px-3 py-1 text-xs font-bold">{reviewRows.length} Prüf-Signale</span>
            </div>
          </div>
        </div>

        <div className="grid gap-0 border-b border-gray-100 bg-white md:grid-cols-4">
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate-500">Wissensprofile</p>
            <p className="stat-number mt-1 text-3xl text-slate-950">{intelligence.filter(r => r.knowledgeCount > 0).length}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate-500">Kranktage im Fenster</p>
            <p className="stat-number mt-1 text-3xl text-slate-950">{sickDays}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate-500">Zeitprüfung</p>
            <p className="stat-number mt-1 text-3xl text-slate-950">{missingEntries}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-bold text-slate-500">Gelernte Kombinationen</p>
            <p className="stat-number mt-1 text-3xl text-slate-950">{intelligence.reduce((sum, r) => sum + r.pairHints.filter(p => p.label === "eingespielt").length, 0)}</p>
          </div>
        </div>

        <div className="grid gap-3 bg-white p-4 lg:grid-cols-2">
          {topRows.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400 lg:col-span-2">Noch keine Intelligence-Daten vorhanden. Einmal unter Einstellungen “Heute lernen” starten.</p>
          ) : topRows.map(row => {
            const score = riskScore(row)
            return (
              <div key={row.employeeId} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{row.name}</h3>
                    <p className="text-xs font-semibold text-slate-500">{row.position} · {row.employmentType}</p>
                  </div>
                  {score > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> prüfen
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5" /> stabil
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="font-bold text-slate-400">Ist</p>
                    <p className="stat-number text-sm text-slate-950">{hours(row.workedHours)}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="font-bold text-slate-400">Plan</p>
                    <p className="stat-number text-sm text-slate-950">{hours(row.plannedHours)}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="font-bold text-slate-400">Wissen</p>
                    <p className="stat-number text-sm text-slate-950">+{row.positiveSignals}/!{row.riskSignals}</p>
                  </div>
                </div>

                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-600" />
                  {row.recommendation}
                </p>

                {row.pairHints.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.pairHints.map(pair => (
                      <span key={pair.employeeId} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                        {pair.label === "eingespielt" ? "passt mit" : "prüfen mit"} {pair.name}
                      </span>
                    ))}
                  </div>
                )}

                {row.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.tags.slice(0, 5).map(tag => (
                      <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
