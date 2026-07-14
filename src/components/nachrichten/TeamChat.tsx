"use client"

import { useState, useRef, useEffect } from "react"
import { Send, LifeBuoy, Check, Hand, Trash2, Eraser } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRealtimeRefresh } from "@/lib/realtime"
import type { Employee, Message, CoverageRequest, CoverageOffer } from "@/types"
import { cn } from "@/lib/utils"
import { notifyPush } from "@/lib/push-client"
import { format } from "date-fns"
import { de } from "date-fns/locale"

interface Props {
  messages: Message[]
  employees: Employee[]
  coverageRequests: CoverageRequest[]
  currentEmployeeId?: string
  selfEmployeeId?: string
  isAdmin?: boolean
}

export default function TeamChat({ messages: initial, employees, coverageRequests, currentEmployeeId, selfEmployeeId, isAdmin = false }: Props) {
  const [messages, setMessages] = useState<Message[]>(initial)
  const [content, setContent] = useState("")
  const [selectedEmp, setSelectedEmp] = useState(selfEmployeeId ?? currentEmployeeId ?? employees[0]?.id ?? "")
  const [sending, setSending] = useState(false)

  // Offers keyed by request id (so coverage cards update live)
  const [offers, setOffers] = useState<Record<string, CoverageOffer[]>>(() => {
    const map: Record<string, CoverageOffer[]> = {}
    for (const r of coverageRequests) map[r.id] = r.offers ?? []
    return map
  })
  const requestById = (id?: string) => coverageRequests.find(r => r.id === id)

  // Live-Sync: neue Nachrichten/Zusagen erscheinen auf allen Geräten ohne Neuladen.
  useRealtimeRefresh(["messages", "coverage_offers", "coverage_requests"])
  useEffect(() => { setMessages(initial) }, [initial])
  useEffect(() => {
    const map: Record<string, CoverageOffer[]> = {}
    for (const r of coverageRequests) map[r.id] = r.offers ?? []
    setOffers(map)
  }, [coverageRequests])

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  // Times are timezone-dependent → render only after mount to avoid hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Admin: der gewählte Absender bleibt erhalten (auch nach Reload/Refresh), bis er geändert wird.
  const SENDER_KEY = "browns-chat-sender"
  useEffect(() => {
    if (selfEmployeeId) return
    try {
      const saved = localStorage.getItem(SENDER_KEY)
      if (saved && employees.some(e => e.id === saved)) setSelectedEmp(saved)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function chooseSender(id: string) {
    setSelectedEmp(id)
    try { localStorage.setItem(SENDER_KEY, id) } catch { /* ignore */ }
  }

  const empById = (id?: string | null) => employees.find(e => e.id === id)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || !selectedEmp) return
    setSending(true)
    const supabase = createClient()
    const text = content.trim()
    const { data } = await supabase.from("messages")
      .insert({ employee_id: selectedEmp, content: text, type: "chat", created_at: new Date().toISOString() })
      .select("*, employee:employees(*)").single()
    if (data) setMessages(prev => [...prev, data as Message])
    setContent("")
    setSending(false)
    // Notify everyone except the sender.
    const others = employees.filter(e => e.id !== selectedEmp).map(e => e.id)
    if (others.length) {
      notifyPush({
        employeeIds: others,
        title: `💬 ${empById(selectedEmp)?.name ?? "Team"}`,
        body: text.length > 120 ? text.slice(0, 117) + "…" : text,
        url: "/",
        tag: "chat",
      })
    }
  }

  async function deleteMessage(id: string) {
    // Optimistisch entfernen; bei Fehler erscheint die Nachricht beim nächsten Refresh wieder.
    setMessages(prev => prev.filter(m => m.id !== id))
    await createClient().from("messages").delete().eq("id", id)
  }

  async function clearChat() {
    const chatIds = messages.filter(m => m.type === "chat").map(m => m.id)
    if (chatIds.length === 0) return
    if (!window.confirm(`Wirklich alle ${chatIds.length} Chat-Nachrichten löschen? Vertretungs-Karten bleiben erhalten.`)) return
    setMessages(prev => prev.filter(m => m.type !== "chat"))
    await createClient().from("messages").delete().in("id", chatIds)
  }

  async function offerToCover(requestId: string) {
    if (!selectedEmp) return
    const supabase = createClient()
    const { data: offer } = await supabase.from("coverage_offers")
      .insert({ request_id: requestId, employee_id: selectedEmp, created_at: new Date().toISOString() })
      .select("*, employee:employees(*)").single()
    if (!offer) return // duplicate or error
    setOffers(prev => ({ ...prev, [requestId]: [...(prev[requestId] ?? []), offer as CoverageOffer] }))
    const emp = empById(selectedEmp)
    const { data: msg } = await supabase.from("messages")
      .insert({
        employee_id: selectedEmp,
        content: `✋ ${emp?.name ?? "Jemand"} kann diese Schicht übernehmen.`,
        type: "coverage_offer",
        meta: { request_id: requestId },
        created_at: new Date().toISOString(),
      })
      .select("*, employee:employees(*)").single()
    if (msg) setMessages(prev => [...prev, msg as Message])
  }

  function renderCoverageCard(msg: Message) {
    const req = requestById(msg.meta?.request_id)
    const reqOffers = req ? offers[req.id] ?? [] : []
    const alreadyOffered = reqOffers.some(o => o.employee_id === selectedEmp)
    const suggested = empById(msg.meta?.suggested_id)
    const filled = req?.status === "filled"
    const filledBy = empById(req?.filled_by)

    return (
      <div className="my-3 rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3.5 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2 mb-1.5">
          <LifeBuoy className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-orange-700">Ersatz gesucht</span>
        </div>
        <p className="text-sm text-gray-800 leading-relaxed">{msg.content}</p>

        {suggested && !filled && (
          <p className="text-xs text-gray-500 mt-1.5">
            💡 Bester Vorschlag: <span className="font-medium text-gray-700">{suggested.name}</span>
          </p>
        )}

        {reqOffers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-xs text-gray-500">Zusagen:</span>
            {reqOffers.map(o => {
              const e = empById(o.employee_id)
              return (
                <span key={o.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                    style={{ backgroundColor: e?.color ?? "#6366f1" }}>
                    {e?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                  </span>
                  {e?.name ?? "—"}
                </span>
              )
            })}
          </div>
        )}

        {filled ? (
          <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <Check className="w-4 h-4" /> Übernommen von {filledBy?.name ?? "—"}
          </div>
        ) : (
          <button
            onClick={() => req && offerToCover(req.id)}
            disabled={!req || alreadyOffered}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition",
              alreadyOffered
                ? "bg-emerald-100 text-emerald-700 cursor-default"
                : "bg-orange-600 hover:bg-orange-700 text-white",
            )}
          >
            <Hand className="w-4 h-4" />
            {alreadyOffered ? "Du hast zugesagt" : "Ich kann übernehmen"}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden h-[calc(100vh-160px)] sm:h-[calc(100vh-180px)]">
      <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900 text-sm">Team-Chat</h2>
        <div className="flex items-center gap-2">
          {isAdmin && messages.some(m => m.type === "chat") && (
            <button onClick={clearChat} title="Alle Chat-Nachrichten löschen"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
              <Eraser className="w-3.5 h-3.5" /> Chat leeren
            </button>
          )}
          {selfEmployeeId ? (
            <span className="text-xs text-gray-400">Angemeldet als {empById(selfEmployeeId)?.name ?? "—"}</span>
          ) : (
            <select value={selectedEmp} onChange={e => chooseSender(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 max-w-[45%]">
              {employees.map(e => <option key={e.id} value={e.id}>Als: {e.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">Noch keine Nachrichten. Schreib etwas!</div>
        )}
        {messages.map((msg, i) => {
          if (msg.type === "coverage_request") return <div key={msg.id}>{renderCoverageCard(msg)}</div>
          if (msg.type === "coverage_offer" || msg.type === "coverage_filled") {
            return (
              <p key={msg.id} className={cn("group text-center text-xs font-medium inline-flex items-center justify-center gap-1.5 w-full",
                msg.type === "coverage_filled" ? "text-emerald-600" : "text-gray-400")}>
                {msg.content}
                {isAdmin && (
                  <button onClick={() => deleteMessage(msg.id)} title="Löschen"
                    className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </p>
            )
          }

          const emp = empById(msg.employee_id)
          const isMe = msg.employee_id === selectedEmp
          const prev = messages[i - 1]
          const showName = i === 0 || prev?.employee_id !== msg.employee_id || prev?.type !== "chat"
          return (
            <div key={msg.id} className={cn("group flex gap-2.5", isMe && "flex-row-reverse")}>
              {showName ? (
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: emp?.color ?? "#6366f1" }}>
                  {emp?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                </div>
              ) : <div className="w-8 flex-shrink-0" />}
              <div className={cn("max-w-[78%] sm:max-w-xs flex flex-col gap-0.5", isMe && "items-end")}>
                {showName && <p className="text-xs text-gray-400 font-medium px-1">{emp?.name}</p>}
                <div className={cn("flex items-center gap-1.5", isMe && "flex-row-reverse")}>
                  <div className={cn("px-3.5 py-2 rounded-2xl text-sm leading-relaxed",
                    isMe ? "bg-brand-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm")}>
                    {msg.content}
                  </div>
                  {isAdmin && (
                    <button onClick={() => deleteMessage(msg.id)} title="Nachricht löschen"
                      className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 px-1" suppressHydrationWarning>
                  {mounted ? format(new Date(msg.created_at), "HH:mm", { locale: de }) : ""}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="px-3 sm:px-4 py-3 border-t border-gray-100 flex gap-2">
        <input
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Nachricht schreiben…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        />
        <button type="submit" disabled={sending || !content.trim()}
          className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
