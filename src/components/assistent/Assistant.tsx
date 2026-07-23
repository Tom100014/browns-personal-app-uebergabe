"use client"

import { useState, useEffect } from "react"
import { Bot, Send, Loader2, Sparkles, CalendarPlus, Check, X, Megaphone, RefreshCw, Download } from "lucide-react"

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

function formatInlineFormatting(str: string) {
  const parts = str.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-gray-950">{part.slice(2, -2)}</strong>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const [, label, href] = linkMatch
      return (
        <a key={i} href={href} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-1 rounded-lg transition shadow-xs mx-1 my-0.5">
          <span>{label}</span>
        </a>
      )
    }
    return part
  })
}

function RichAgentMessage({ text }: { text: string }) {
  const blocks = text.split("\n\n").filter(Boolean)
  return (
    <div className="space-y-3 text-sm text-gray-800 leading-relaxed">
      {blocks.map((block, idx) => {
        const trimmed = block.trim()
        if (trimmed.startsWith("###") || trimmed.startsWith("##") || trimmed.startsWith("#")) {
          const title = trimmed.replace(/^#+\s*/, "")
          return (
            <h4 key={idx} className="font-bold text-gray-950 text-sm border-b border-gray-200/80 pb-1.5 mt-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600 inline-block" />
              {title}
            </h4>
          )
        }
        if (trimmed.split("\n").some(line => line.trim().startsWith("- ") || line.trim().startsWith("* ") || line.trim().startsWith("• "))) {
          const items = trimmed.split("\n").map(line => line.replace(/^[\-\*\•]\s*/, "").trim()).filter(Boolean)
          return (
            <ul key={idx} className="space-y-1.5 my-2 pl-0.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-800 bg-white/60 p-1.5 rounded-lg border border-gray-100">
                  <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                  <span className="flex-1">{formatInlineFormatting(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={idx} className="leading-relaxed">
            {formatInlineFormatting(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

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
      if (res.ok) {
        const data = await res.json()
        setBriefing(data.briefing ?? null)
      }
    } catch {
      // quiet
    }
    setBriefingLoading(false)
  }

  useEffect(() => {
    loadBriefing()
  }, [])

  async function ask(q: string) {
    if (!q.trim() || loading) return
    const userMsg: Msg = { role: "user", text: q }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)
    setNotConfigured(false)
    try {
      const history = newMessages.slice(-10)
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, history }),
      })
      const data = await res.json()
      if (res.status === 503) {
        setNotConfigured(true)
      } else if (data.text) {
        setMessages([...newMessages, { role: "assistant", text: data.text }])
      } else {
        setMessages([...newMessages, { role: "assistant", text: data.error || "Unerwarteter Fehler." }])
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", text: "Netzwerkfehler." }])
    }
    setLoading(false)
  }

  async function learnNow() {
    setLoading(true)
    try {
      const res = await fetch("/api/agent/learn", { method: "POST" })
      const data = await res.json()
      setMessages(m => [...m, { role: "system", text: data.message || "Lernen abgeschlossen!" }])
    } catch {
      setMessages(m => [...m, { role: "system", text: "Fehler beim Lernen." }])
    }
    setLoading(false)
  }

  function canApplyAsPlan(text: string): boolean {
    return text.includes("Montag") || text.includes("Dienstag") || text.includes("Mittwoch") || text.includes("Donnerstag") || text.includes("Freitag") || text.includes("Samstag") || text.includes("Sonntag")
  }

  async function applyPlan(text: string) {
    if (!applyDate) return
    setApplying(true)
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planText: text, startDate: applyDate }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages(m => [...m, { role: "system", text: `Plan erfolgreich für Woche ab ${applyDate} eingetragen (${data.count} Schichten)!` }])
        setApplyFor(null)
        setApplyDate("")
      } else {
        alert("Fehler: " + (data.error || "Plan konnte nicht eingetragen werden."))
      }
    } catch {
      alert("Netzwerkfehler beim Eintragen.")
    }
    setApplying(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[700px]">
      <div className="bg-gradient-to-r from-brand-700 to-brand-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-xs">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">Browns Agent (Gemini Pro)</h2>
            <p className="text-xs text-brand-200">Autonomer Betriebs- &amp; Personal-Assistent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadBriefing} disabled={briefingLoading} title="Tages-Briefing aktualisieren"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${briefingLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {notConfigured && (
        <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-900">
          <strong>Kein LLM-API-Schlüssel konfiguriert!</strong> Trage <code>GEMINI_API_KEY</code> oder <code>LLM_API_KEY</code> in den Vercel-Umgebungsvariablen ein.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tages-Briefing Card */}
        {(briefing || briefingLoading) && (
          <div className="bg-brand-50/70 border border-brand-200/80 rounded-2xl p-4 mb-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h3 className="text-xs font-bold text-brand-900 uppercase tracking-wider">Browns Tages-Briefing &amp; Lagebericht</h3>
            </div>
            {briefingLoading
              ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Browns Agent prüft Wetter, Events, Besetzung &amp; Auslastung…</p>
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
              {m.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={m.role === "user" ? "max-w-[80%]" : "max-w-[85%]"}>
                <div className={m.role === "user"
                  ? "bg-brand-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm whitespace-pre-wrap"
                  : "bg-gray-100/90 border border-gray-200/60 text-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-xs"}>
                  {m.role === "assistant" ? <RichAgentMessage text={m.text} /> : m.text}
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

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl px-3.5 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span className="text-xs text-gray-500">Browns Agent analysiert &amp; generiert Antwort…</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); ask(input) }} className="border-t border-gray-100 p-3 flex gap-2 items-center">
        <button type="button" onClick={learnNow} disabled={loading} title="Auslastung analysieren & proaktiv lernen"
          className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 flex items-center gap-1 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="hidden sm:inline">Proaktiv Lernen</span>
        </button>
        <a href="/api/knowledge/export" target="_blank" rel="noopener noreferrer" title="Wissensdatenbank herunterladen (JSON-Backup auf PC)"
          className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1 text-xs font-semibold">
          <Download className="w-4 h-4 text-brand-600" />
          <span className="hidden sm:inline">Wissen Exportieren</span>
        </a>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Frage zur Planung stellen…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        <button type="submit" disabled={loading || !input.trim()} className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
