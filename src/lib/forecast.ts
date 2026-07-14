// Belegungs-Prognose (Occupancy forecast) — transparent, rule-based.
// Combines weekday baseline + weather + events (Messen, Feiertage, Baustellen).

export type EventRow = { id: string; date: string; end_date?: string | null; title: string; type: string; impact: number; note?: string | null }

// Event-Typen mit Standard-Wirkung auf die Belegung (−/+ Punkte).
export const EVENT_TYPES: { value: string; label: string; impact: number }[] = [
  { value: "messe", label: "Messe / Großevent", impact: 30 },
  { value: "event", label: "Event / Konzert / Stadtfest", impact: 15 },
  { value: "feiertag", label: "Feiertag / Brückentag", impact: 12 },
  { value: "ferien", label: "Ferien / Tourismus", impact: 8 },
  { value: "baustelle", label: "Baustelle / Sperrung", impact: -20 },
  { value: "stoerung", label: "Störung / Schlechtwetter-Lage", impact: -25 },
  { value: "sonstiges", label: "Sonstiges", impact: 0 },
]

const WEEKDAY_BASE = [60, 40, 42, 46, 55, 72, 86] // So..Sa (getDay index)

export function eventsOnDate(events: EventRow[], date: string): EventRow[] {
  return events.filter(e => {
    const start = e.date
    const end = e.end_date || e.date
    return date >= start && date <= end
  })
}

export function defaultImpactFor(type: string): number {
  return EVENT_TYPES.find(t => t.value === type)?.impact ?? 0
}

export function eventLearningLabel(e: EventRow): "relevant" | "neutral" | "bremsend" {
  if (Number(e.impact) > 0) return "relevant"
  if (Number(e.impact) < 0) return "bremsend"
  return "neutral"
}

export function occupancyScore(opts: { date: string; tmax?: number | null; rain?: number | null; eventImpact: number }): number {
  const wd = new Date(opts.date + "T12:00:00").getDay()
  const base = WEEKDAY_BASE[wd] ?? 50
  let w = 0
  const { tmax, rain } = opts
  if (tmax != null && rain != null) {
    if (tmax >= 22 && rain < 40) w = 20
    else if (tmax >= 18 && rain < 40) w = 8
    else if (rain >= 60) w = -15
    else if (tmax < 12) w = -10
  }
  return Math.max(0, Math.min(100, Math.round(base + w + opts.eventImpact)))
}

export type Level = { key: "ruhig" | "normal" | "hoch" | "sehr_hoch"; label: string; classes: string }

export function levelFor(score: number): Level {
  if (score >= 80) return { key: "sehr_hoch", label: "Sehr hoch", classes: "bg-red-50 text-red-700 border-red-200" }
  if (score >= 60) return { key: "hoch", label: "Hoch", classes: "bg-amber-50 text-amber-700 border-amber-200" }
  if (score >= 40) return { key: "normal", label: "Normal", classes: "bg-gray-100 text-gray-600 border-gray-200" }
  return { key: "ruhig", label: "Ruhig", classes: "bg-sky-50 text-sky-700 border-sky-200" }
}

export function staffingHint(level: Level["key"]): string {
  switch (level) {
    case "sehr_hoch": return "Volle Besetzung — Service & Theke verstärken, Außenbereich + Spüle einplanen."
    case "hoch": return "Erhöhte Besetzung — Service/Theke verstärken."
    case "ruhig": return "Ruhig — reduzierte Besetzung möglich."
    default: return "Normale Besetzung."
  }
}
