"use client"

import { useState, useEffect } from "react"
import { Bot, Send, Loader2, Sparkles, CalendarPlus, Check, X, Megaphone, RefreshCw } from "lucide-react"

const SUGGESTIONS = [
  "Plane mir die kommende Woche nach Stationen.",
  "Wer eignet sich als Vertretung für eine Service-Schicht am Samstag?",
  "Welche Mitarbeiter passen aktuell gut zusammen?",
  "Welche Personal-Risiken soll ich diese Woche prüfen?",
  "Welche Tage werden wegen Wetter/Events besonders voll?",
  "Erstelle einen Arbeitsvertrag für ...",
  "Wie viele Überstunden hat ... diesen Monat?",
  "Erstelle einen Kündigungsentwurf für ...",
]

type Msg = { role: "user" | "assistant" | "system"; text: string }

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [applyFor, setApplyFor] = useState<number | null>(null)
  const [applyDate, setApplyDate] = useState("")
  const [applying, setApplying] = useState(false)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)

  async function loadBriefing() {
    setBriefingLoading(true)
    try {
      const res = await fetch("/api/agent/briefing")
      const data = await res.json()
      if (data.error === "not_configured") setNotConfigured(true)
      else setBriefing(data.briefing || null)
    } catch { /* still usable without briefing */ }
    setBriefingLoading(false)
  }
  // Existing component pattern: initial server briefing is loaded once after mount.
  useEffect(() => { loadBriefing() }, [])

  async function ask(q: string) {
    if (!q.trim() || loading) return
    setMessages(prev => [...prev, { role: "user", text: q }])
    setInput(""); setLoading(true)
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) })
      const data = await res.json()
      if (data.error === "not_configured") { setNotConfigured(true); setMessages(prev => prev.slice(0, -1)) }
      else setMessages(prev => [...prev, { role: "assistant", text: data.answer || data.error || "Keine Antwort." }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Verbindung fehlgeschlagen." }])
    }
    setLoading(false)
  }

  async function learnNow() {
    if (loading) return
    setLoading(true)
    setMessages(prev => [...prev, { role: "user", text: "Analysiere die Personalauslastung und lerne daraus." }])
    try {
      const res = await fetch("/api/agent/learn")
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", text: data.insight || data.error || "Keine Analyse." }])
      if (data.insight) setMessages(prev => [...prev, { role: "system", text: "In Wissensdatenbank gespeichert — der Agent berücksichtigt das künftig." }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Analyse fehlgeschlagen." }])
    }
    setLoading(false)
  }

  async function applyPlan(planText: string) {
    if (!applyDate) return
    setApplying(true)
    try {
      const res = await fetch("/api/agent/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planText, date: applyDate }) })
      const data = await res.json()
      const msg = data.error
        ? `Konnte nicht eintragen: ${data.error}`
        : `✅ ${data.added} Schichten für ${applyDate} eingetragen.${data.unmatched?.length ? ` Nicht zugeordnet: ${data.unmatched.join(", ")}.` : ""} Im Schichtplan sichtbar.`
      setMessages(prev => [...prev, { role: "system", text: msg }])
    } catch {
      setMessages(prev => [...prev, { role: "system", text: "Eintragen fehlgeschlagen." }])
    }
    setApplying(false); setApplyFor(null); setApplyDate("")
  }

  function canApplyAsPlan(text: string) {
    const lower = text.toLowerCase()
    if (lower.includes("arbeitsvertrag") || lower.includes("kündigung") || lower.includes("überstunden")) return false
    return lower.includes("schicht") || lower.includes("dienstplan") || lower.includes(" uhr")
  }

  if (notConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mx-auto mb-3"><Bot className="w-5 h-5 text-brand-600" /></div>
        <h2 className="font-semibold text-gray-900">Browns Agent bereit — Schlüssel fehlt</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Der Agent ist vollständig eingebaut. Um ihn zu aktivieren, hinterlege in Vercel die Variable
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded mx-1">LLM_API_KEY</code> (Anthropic/Claude),
          optional <code className="text-xs bg-gray-100 px-1 py-0.5 rounded mx-1">LLM_MODEL</code>. Danach beantwortet er Planungsfragen
          auf Basis von Team, Wetter, Veranstaltungen und deinen Betriebsregeln.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl flex flex-col h-[calc(100vh-200px)] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {(briefingLoading || briefing) && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Megaphone className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Tagesbriefing</span>
              {!briefingLoading && (
                <button onClick={loadBriefing} title="Aktualisieren" className="ml-auto text-brand-500 hover:text-brand-700">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {briefingLoading
              ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Browns Agent prüft Wetter, Events, Besetzung & Auslastung…</p>
              : <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{briefing}</p>}
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <Sparkles className="w-7 h-7 mx-auto mb-2 text-brand-500" />
            <p className="text-sm font-medium text-gray-600">Browns Agent</p>
            <p className="text-sm">Frag mich zur Planung — ich kenne Team, Wetter, Events &amp; deine Regeln. Einen fertigen Plan trage ich auf Wunsch direkt ins System ein.</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === "system") return (
            <p key={i} className="text-center text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{m.text}</p>
          )
          return (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-2.5"}>
            {m.role === "assistant" && <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-white" /></div>}
            <div className={m.role === "user" ? "max-w-[80%]" : "max-w-[85%]"}>
              <div className={m.role === "user"
                ? "bg-brand-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm whitespace-pre-wrap"
                : "bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed"}>
                {m.text}
              </div>
              {m.role === "assistant" && canApplyAsPlan(m.text) && (
                applyFor === i ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                    <button onClick={() => applyPlan(m.text)} disabled={applying || !applyDate}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition disabled:opacity-50">
                      {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Eintragen
                    </button>
                    <button onClick={() => { setApplyFor(null); setApplyDate("") }} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setApplyFor(i)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
                    <CalendarPlus className="w-3.5 h-3.5" /> Diesen Plan ins System eintragen
                  </button>
                )
              )}
            </div>
          </div>
          )
        })}
        {loading && <div className="flex gap-2.5"><div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div><div className="bg-gray-100 rounded-2xl px-3.5 py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div></div>}
      </div>
      <form onSubmit={e => { e.preventDefault(); ask(input) }} className="border-t border-gray-100 p-3 flex gap-2">
        <button type="button" onClick={learnNow} disabled={loading} title="Auslastung analysieren & lernen"
          className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"><Sparkles className="w-4 h-4" /></button>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Frage zur Planung stellen…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        <button type="submit" disabled={loading || !input.trim()} className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  )
}
