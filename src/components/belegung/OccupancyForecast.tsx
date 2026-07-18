"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CalendarDays, Plus, Trash2, ArrowRight, TriangleAlert, Sparkles, ThumbsUp, EyeOff, Brain, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { EVENT_TYPES, eventsOnDate, occupancyScore, levelFor, staffingHint, defaultImpactFor, eventLearningLabel, type EventRow } from "@/lib/forecast"

type Wx = { date: string; code: number; tmax: number; rain: number }
type EventFilter = "all" | "impact" | "neutral"

const EVENTS_PER_DAY = 4

function wxIcon(code: number) {
  if (code === 0) return { Icon: Sun, color: "text-amber-500" }
  if (code <= 3) return { Icon: CloudSun, color: "text-amber-400" }
  if (code === 45 || code === 48) return { Icon: CloudFog, color: "text-gray-400" }
  if (code >= 51 && code <= 67) return { Icon: CloudRain, color: "text-sky-500" }
  if (code >= 71 && code <= 77) return { Icon: CloudSnow, color: "text-sky-300" }
  if (code >= 80 && code <= 82) return { Icon: CloudRain, color: "text-sky-600" }
  if (code >= 95) return { Icon: CloudLightning, color: "text-violet-500" }
  return { Icon: Cloud, color: "text-gray-400" }
}
const dayName = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" })
const dayShort = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
const dayLong = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })
const addDays = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("en-CA")
}

export default function OccupancyForecast({ compact = false }: { compact?: boolean }) {
  const [city, setCity] = useState<string | null>(null)
  const [place, setPlace] = useState("")
  const [wx, setWx] = useState<Wx[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ date: "", end_date: "", type: "messe", title: "", note: "" })
  const [learningId, setLearningId] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<EventFilter>("all")
  const [expandedEventDays, setExpandedEventDays] = useState<string[]>([])

  const loadWeather = useCallback(async (c: string) => {
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=de&format=json`).then(r => r.json())
      const g = geo?.results?.[0]
      if (!g) return
      setPlace(`${g.name}${g.country_code ? ", " + g.country_code : ""}`)
      const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&daily=weather_code,temperature_2m_max,precipitation_probability_max&forecast_days=7&timezone=auto`).then(r => r.json())
      setWx((f?.daily?.time ?? []).map((t: string, i: number) => ({ date: t, code: f.daily.weather_code[i], tmax: Math.round(f.daily.temperature_2m_max[i]), rain: f.daily.precipitation_probability_max?.[i] ?? 0 })))
    } catch { /* ignore */ }
  }, [])

  const loadEvents = useCallback(async () => {
    const today = new Date().toLocaleDateString("en-CA")
    const until = addDays(today, 6)
    const { data } = await createClient().from("events").select("*").lte("date", until).order("date")
    setEvents(((data ?? []) as EventRow[]).filter(e => (e.end_date || e.date) >= today && e.date <= until))
  }, [])

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await createClient().from("settings").select("value").eq("key", "weather_city").maybeSingle()
      const c = data?.value || ""
      setCity(c || null)
      await Promise.all([c ? loadWeather(c) : Promise.resolve(), loadEvents()])
      setLoading(false)
    })()
  }, [loadWeather, loadEvents])

  async function addEvent() {
    if (!form.date || !form.title) return
    const t = EVENT_TYPES.find(x => x.value === form.type)
    await createClient().from("events").insert({
      date: form.date, end_date: form.end_date || null, title: form.title, type: form.type, impact: t?.impact ?? 0, note: form.note || null,
    })
    setForm({ date: "", end_date: "", type: "messe", title: "", note: "" })
    loadEvents()
  }
  async function delEvent(id: string) {
    await createClient().from("events").delete().eq("id", id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  async function markEvent(event: EventRow, relevant: boolean) {
    setLearningId(event.id)
    const fallback = defaultImpactFor(event.type)
    const nextImpact = relevant ? (fallback === 0 ? 10 : fallback) : 0
    const cleanNote = (event.note || "").replace(/\n?KI-Lernen:[\s\S]*$/, "").trim()
    const note = `${cleanNote}${cleanNote ? "\n" : ""}KI-Lernen: ${relevant ? "für Browns Café relevant" : "für Browns Café nicht nennenswert"}`
    await createClient().from("events").update({ impact: nextImpact, note }).eq("id", event.id)
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, impact: nextImpact, note } : e))
    setLearningId(null)
  }

  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  async function refreshEvents() {
    setRefreshing(true); setRefreshMsg(null)
    try {
      const res = await fetch("/api/events/refresh", { method: "POST" })
      const data = await res.json()
      if (data.note) setRefreshMsg(data.note)
      else if (typeof data.added === "number") setRefreshMsg(`${data.added} neue Veranstaltung(en) gefunden.`)
      else setRefreshMsg(data.error || "Aktualisiert.")
      loadEvents()
    } catch { setRefreshMsg("Aktualisierung fehlgeschlagen.") }
    setRefreshing(false)
  }

  // Build forecast for the next N days
  const today = new Date().toLocaleDateString("en-CA")
  const N = compact ? 3 : 7
  const days = Array.from({ length: N }, (_, i) => {
    const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() + i)
    const date = d.toLocaleDateString("en-CA")
    const w = wx.find(x => x.date === date)
    const evs = eventsOnDate(events, date)
    const eventImpact = evs.reduce((s, e) => s + Number(e.impact), 0)
    const score = occupancyScore({ date, tmax: w?.tmax, rain: w?.rain, eventImpact })
    return { date, w, evs, score, level: levelFor(score) }
  })
  const todayF = days[0]
  const notableEvents = events.filter(e => Number(e.impact) !== 0)
  const neutralEvents = events.filter(e => Number(e.impact) === 0)
  const filteredEvents = events.filter(e => {
    if (eventFilter === "impact") return Number(e.impact) !== 0
    if (eventFilter === "neutral") return Number(e.impact) === 0
    return true
  })
  const eventGroups = days
    .map(day => ({
      date: day.date,
      events: filteredEvents.filter(event => (event.date < today ? today : event.date) === day.date),
    }))
    .filter(group => group.events.length > 0)
  const todayEventSummary = todayF?.evs.length
    ? `${todayF.evs.slice(0, 3).map(e => e.title).join(", ")}${todayF.evs.length > 3 ? ` +${todayF.evs.length - 3} weitere` : ""}`
    : ""

  if (loading) return <div className="surface-card mb-4 p-5 text-sm text-slate-400 animate-pulse">Belegungsprognose wird geladen...</div>

  return (
    <div className="mb-4 space-y-4">
      {todayF && (
        <div className={cn("rounded-[1.25rem] border px-4 py-3.5 shadow-card", todayF.level.classes)}>
          <div className="flex items-center gap-2 mb-1">
            <TriangleAlert className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm font-semibold">Heute: Belegung <strong>{todayF.level.label}</strong> {todayF.w ? `· ${todayF.w.tmax}°` : ""}</p>
          </div>
          <p className="text-xs leading-relaxed">
            {staffingHint(todayF.level.key)}
            {todayEventSummary && <> · <strong>{todayEventSummary}</strong></>}
          </p>
        </div>
      )}

      <div className="surface-card p-5 transition-all duration-300 hover:shadow-card-lg">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Sparkles className="h-4 w-4 text-brand-600" /> 7-Tage-Belegungsprognose {place && <span className="font-normal text-slate-400">· {place}</span>}
            </h2>
            {!compact && <p className="mt-1 text-xs text-slate-400">Wetter, Wochentag und nur Veranstaltungen der nächsten 7 Tage fließen ein.</p>}
          </div>
          {compact && <Link href="/belegung" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Volle Prognose & Events <ArrowRight className="h-3.5 w-3.5" /></Link>}
        </div>

        {!city ? (
          <p className="text-sm text-slate-400">Standort in den Einstellungen/Dashboard (Wetter) setzen, um die Prognose zu sehen.</p>
        ) : (
          <div className={cn("grid gap-3", compact ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-7")}>
            {days.map(d => {
              const { Icon, color } = d.w ? wxIcon(d.w.code) : { Icon: Cloud, color: "text-slate-300" }
              const relevant = d.evs.filter(e => Number(e.impact) !== 0)
              return (
                <div key={d.date} className={cn("min-h-[150px] rounded-3xl border p-4", d.level.classes)}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold capitalize">{dayName(d.date)}</span>
                    <span className="text-xs opacity-70">{dayShort(d.date)}</span>
                  </div>
                  <div className="my-3 flex items-center gap-2">
                    <Icon className={cn("h-6 w-6", color)} />
                    {d.w && <span className="stat-number text-2xl">{d.w.tmax}°</span>}
                  </div>
                  <p className="text-xs font-bold uppercase">{d.level.label}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/55">
                    <div className="h-full rounded-full bg-current opacity-70" style={{ width: `${d.score}%` }} />
                  </div>
                  {d.evs.length > 0 && (
                    <p className="mt-3 line-clamp-2 text-[11px]" title={d.evs.map(e => e.title).join(", ")}>
                      {relevant.length > 0 ? relevant.map(e => e.title).join(", ") : "Events vorhanden, noch nicht bewertet"}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Veranstaltungen verwalten (nur volle Ansicht) */}
      {!compact && (
        <div className="surface-card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-950">Events der nächsten 7 Tage</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">Markiere, ob ein Event für Browns Café wirklich nennenswert ist. Die Prognose lernt direkt über den Einflusswert.</p>
            </div>
            <button onClick={refreshEvents} disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
              <Sparkles className="w-3.5 h-3.5" /> {refreshing ? "Suche..." : "Automatisch aktualisieren"}
            </button>
          </div>
          {refreshMsg && <p className="text-xs text-gray-500 mb-3">{refreshMsg}</p>}
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} title="Bis (optional)"
              className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Titel (z.B. Spielwarenmesse)"
              className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 lg:col-span-2" />
            <button onClick={addEvent} disabled={!form.date || !form.title}
              className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
              <Plus className="w-4 h-4" /> Eintragen
            </button>
          </div>
          {events.length > 0 && (
            <div className="mb-4 grid min-w-0 grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Veranstaltungen filtern">
              {([
                ["all", `Alle ${events.length}`],
                ["impact", `Einfluss ${notableEvents.length}`],
                ["neutral", `Neutral ${neutralEvents.length}`],
              ] as [EventFilter, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEventFilter(value)}
                  aria-pressed={eventFilter === value}
                  className={cn(
                    "min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-bold transition sm:px-3 sm:text-xs",
                    eventFilter === value ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {events.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Keine Events in den nächsten 7 Tagen. Trage Messen, Stadtfeste, Ferien, Baustellen oder Wetterlagen ein.</p>
          ) : eventGroups.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Keine Events entsprechen diesem Filter.</p>
          ) : (
            <div className="space-y-2.5">
              {eventGroups.map(group => {
                const expanded = expandedEventDays.includes(group.date)
                const visibleEvents = expanded ? group.events : group.events.slice(0, EVENTS_PER_DAY)
                const impactCount = group.events.filter(event => Number(event.impact) !== 0).length
                return (
                  <details key={group.date} className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 marker:content-none sm:px-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold capitalize text-slate-900">{dayLong(group.date)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {group.events.length} {group.events.length === 1 ? "Event" : "Events"} · {impactCount} mit Einfluss
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
                      <div className="grid gap-3 lg:grid-cols-2">
                        {visibleEvents.map(e => {
                          const t = EVENT_TYPES.find(x => x.value === e.type)
                          const learning = eventLearningLabel(e)
                          return (
                            <div key={e.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                              <div className="mb-3 flex min-w-0 items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                                  <span className="text-[10px] font-bold uppercase">{dayName(e.date)}</span>
                                  <span className="stat-number text-lg leading-none">{dayShort(e.date).slice(0, 2)}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-bold text-slate-950">{e.title}</p>
                                  <p className="mt-1 text-xs text-slate-400">{t?.label ?? e.type}{e.end_date && e.end_date !== e.date ? ` · bis ${dayShort(e.end_date)}` : ""}</p>
                                </div>
                                <button onClick={() => delEvent(e.id)} className="shrink-0 rounded-full p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500" aria-label="Event löschen">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                                  learning === "relevant" ? "bg-emerald-50 text-emerald-700" :
                                  learning === "bremsend" ? "bg-red-50 text-red-700" :
                                  "bg-slate-100 text-slate-500")}>
                                  <Brain className="h-3.5 w-3.5" />
                                  {learning === "relevant" ? "nennenswert" : learning === "bremsend" ? "negativer Einfluss" : "ohne Einfluss"}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                                  Einfluss {e.impact > 0 ? `+${e.impact}` : e.impact}
                                </span>
                              </div>
                              <div className="grid min-w-0 grid-cols-2 gap-2">
                                <button onClick={() => markEvent(e, true)} disabled={learningId === e.id}
                                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-2 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-60 sm:px-3">
                                  <ThumbsUp className="h-3.5 w-3.5 shrink-0" /> Nennenswert
                                </button>
                                <button onClick={() => markEvent(e, false)} disabled={learningId === e.id}
                                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:px-3">
                                  <EyeOff className="h-3.5 w-3.5 shrink-0" /> Nicht relevant
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {group.events.length > EVENTS_PER_DAY && (
                        <button
                          type="button"
                          onClick={() => setExpandedEventDays(current => expanded
                            ? current.filter(date => date !== group.date)
                            : [...current, group.date])}
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          {expanded ? "Weniger anzeigen" : `${group.events.length - EVENTS_PER_DAY} weitere an diesem Tag`}
                        </button>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          )}
          {neutralEvents.length > 0 && notableEvents.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">{notableEvents.length} Event(s) wirken aktuell auf die Prognose, {neutralEvents.length} sind als neutral/nicht relevant markiert.</p>
          )}
        </div>
      )}
    </div>
  )
}
