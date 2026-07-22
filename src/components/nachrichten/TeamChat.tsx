"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Send, LifeBuoy, Check, Clock, Hand, Trash2, Eraser, MessageSquare, Users, Wifi, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase"
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

const MAX_CHAT_ITEMS = 140

function messageTime(message: Message) {
  const parsed = Date.parse(message.created_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

function orderMessages(messages: Message[]) {
  return [...messages]
    .sort((a, b) => messageTime(a) - messageTime(b))
    .slice(-MAX_CHAT_ITEMS)
}

function mergeMessage(prev: Message[], next: Message) {
  const exists = prev.some(message => message.id === next.id)
  if (exists) return orderMessages(prev.map(message => message.id === next.id ? next : message))
  return orderMessages([...prev, next])
}

export default function TeamChat({ messages: initial, employees, coverageRequests, currentEmployeeId, selfEmployeeId, isAdmin = false }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => orderMessages(initial))
  const [coverageItems, setCoverageItems] = useState<CoverageRequest[]>(coverageRequests)
  const [content, setContent] = useState("")
  // Admin-Standard: Zeynep Kara (Leitung) ist immer der voreingestellte Absender,
  // andere Namen bleiben waehlbar.
  const zeynepId = employees.find(e => e.name.trim().toLowerCase() === "zeynep kara")?.id
  const [selectedEmp, setSelectedEmp] = useState(selfEmployeeId ?? zeynepId ?? currentEmployeeId ?? employees[0]?.id ?? "")
  const [sending, setSending] = useState(false)
  const [liveState, setLiveState] = useState<"connecting" | "connected" | "offline">("connecting")

  // Offers keyed by request id (so coverage cards update live)
  const [offers, setOffers] = useState<Record<string, CoverageOffer[]>>(() => {
    const map: Record<string, CoverageOffer[]> = {}
    for (const r of coverageRequests) map[r.id] = r.offers ?? []
    return map
  })

  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees])
  const empById = useCallback((id?: string | null) => id ? employeeById.get(id) : undefined, [employeeById])
  const withEmployee = useCallback((message: Message): Message => ({
    ...message,
    employee: message.employee ?? empById(message.employee_id),
  }), [empById])
  const requestById = useCallback((id?: string) => coverageItems.find(r => r.id === id), [coverageItems])

  useEffect(() => { setMessages(orderMessages(initial.map(withEmployee))) }, [initial, withEmployee])
  useEffect(() => { setCoverageItems(coverageRequests) }, [coverageRequests])
  useEffect(() => {
    const map: Record<string, CoverageOffer[]> = {}
    for (const r of coverageRequests) map[r.id] = r.offers ?? []
    setOffers(map)
  }, [coverageRequests])

  const refreshCoverage = useCallback(async () => {
    const { data } = await createClient()
      .from("coverage_requests")
      .select("*, offers:coverage_offers(*)")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(40)

    if (!data) return
    const nextCoverage = data as CoverageRequest[]
    const nextOffers: Record<string, CoverageOffer[]> = {}
    for (const request of nextCoverage) nextOffers[request.id] = request.offers ?? []
    setCoverageItems(nextCoverage)
    setOffers(nextOffers)
  }, [])

  // Chat-Realtime bleibt lokal in dieser Komponente. So schreibt/empfängt man ohne
  // kompletten Server-Refresh, der die Mitarbeiter-App spürbar langsam gemacht hat.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`team-chat-local-${selfEmployeeId ?? "admin"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        setMessages(prev => mergeMessage(prev, withEmployee(payload.new as Message)))
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, payload => {
        setMessages(prev => mergeMessage(prev, withEmployee(payload.new as Message)))
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, payload => {
        const id = (payload.old as Pick<Message, "id"> | null)?.id
        if (id) setMessages(prev => prev.filter(message => message.id !== id))
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "coverage_offers" }, () => {
        void refreshCoverage()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "coverage_requests" }, () => {
        void refreshCoverage()
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") setLiveState("connected")
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveState("offline")
        else setLiveState("connecting")
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refreshCoverage, selfEmployeeId, withEmployee])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const hasPositionedScrollRef = useRef(false)
  const previousMessageCountRef = useRef(messages.length)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = scrollRef.current
    if (!node) return
    isNearBottomRef.current = true
    setHasNewMessages(false)
    node.scrollTo({ top: node.scrollHeight, behavior })
  }, [])
  const updateScrollPosition = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 96
    isNearBottomRef.current = nearBottom
    if (nearBottom) setHasNewMessages(false)
  }, [])
  useEffect(() => {
    const previousCount = previousMessageCountRef.current
    const receivedNewMessage = messages.length > previousCount
    previousMessageCountRef.current = messages.length

    if (!hasPositionedScrollRef.current || isNearBottomRef.current) {
      const behavior: ScrollBehavior = hasPositionedScrollRef.current ? "smooth" : "auto"
      const frame = window.requestAnimationFrame(() => {
        scrollToLatest(behavior)
        hasPositionedScrollRef.current = true
      })
      return () => window.cancelAnimationFrame(frame)
    }

    if (receivedNewMessage) setHasNewMessages(true)
  }, [messages.length, scrollToLatest])

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

  async function sendMessage() {
    if (!content.trim() || !selectedEmp) return
    setSending(true)
    const text = content.trim()
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("messages")
        .insert({ employee_id: selectedEmp, content: text, type: "chat", created_at: new Date().toISOString() })
        .select("*, employee:employees(id,name,color,position,role)").single()
      if (error || !data) return
      setMessages(prev => mergeMessage(prev, withEmployee(data as Message)))
      setContent("")
      isNearBottomRef.current = true
      setHasNewMessages(false)
      // Notify everyone except the sender.
      const others = employees.filter(e => e.id !== selectedEmp).map(e => e.id)
      if (others.length) {
        notifyPush({
          employeeIds: others,
          title: `Team-Chat: ${empById(selectedEmp)?.name ?? "Team"}`,
          body: text.length > 120 ? text.slice(0, 117) + "..." : text,
          url: "/portal/chat",
          tag: "chat",
          chatMessageId: data.id,
        })
      }
    } finally {
      setSending(false)
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    await sendMessage()
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
    if (msg) setMessages(prev => mergeMessage(prev, withEmployee(msg as Message)))
  }

  function renderCoverageCard(msg: Message) {
    const req = requestById(msg.meta?.request_id)
    const reqOffers = req ? offers[req.id] ?? [] : []
    const alreadyOffered = reqOffers.some(o => o.employee_id === selectedEmp)
    const suggested = empById(msg.meta?.suggested_id)
    const filled = req?.status === "filled"
    const filledBy = empById(req?.filled_by)
    // Die Schicht ist vorbei — "Ich kann übernehmen" bleibt sonst dauerhaft anklickbar.
    const expired = !filled && req ? req.date < format(new Date(), "yyyy-MM-dd") : false

    return (
      <div className="my-3 mx-auto w-full max-w-lg rounded-2xl border border-brand-200/80 bg-white px-4 py-3.5 shadow-card">
        <div className="flex items-center gap-2 mb-1.5">
          <LifeBuoy className="w-4 h-4 text-brand-600 flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Ersatz gesucht</span>
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
        ) : expired ? (
          <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-gray-400">
            <Clock className="w-4 h-4" /> Zeitraum abgelaufen
          </div>
        ) : (
          <button
            onClick={() => req && offerToCover(req.id)}
            disabled={!req || alreadyOffered}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition",
              alreadyOffered
                ? "bg-emerald-100 text-emerald-700 cursor-default"
                : "bg-brand-600 hover:bg-brand-700 text-white",
            )}
          >
            <Hand className="w-4 h-4" />
            {alreadyOffered ? "Du hast zugesagt" : "Ich kann übernehmen"}
          </button>
        )}
      </div>
    )
  }

  const signedInName = empById(selfEmployeeId ?? selectedEmp)?.name ?? "Team"

  return (
    <section
      className={cn(
        "relative mx-auto flex w-full max-w-4xl min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-border bg-white shadow-card-lg",
        isAdmin
          ? "h-[calc(100dvh-9rem)] min-h-[28rem] max-h-[44rem]"
          : "h-[calc(100dvh-15rem)] min-h-[24rem] max-h-[44rem] lg:h-[calc(100dvh-7rem)] lg:min-h-[32rem]",
      )}
    >
      <div className="shrink-0 border-b border-brand-100 bg-gradient-to-r from-brand-50 via-white to-citrus/15 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-card">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-charcoal">Team-Chat</h2>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {employees.length} Teammitglieder
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  liveState === "connected" && "bg-emerald-50 text-emerald-700",
                  liveState === "connecting" && "bg-brand-50 text-brand-700",
                  liveState === "offline" && "bg-red-50 text-red-700",
                )}>
                  <Wifi className="h-3.5 w-3.5" />
                  {liveState === "connected" ? "Live" : liveState === "connecting" ? "Verbinden" : "Offline"}
                </span>
              </div>
            </div>
          </div>
          <div className={cn("flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0", selfEmployeeId && "hidden sm:flex")}>
          {isAdmin && messages.some(m => m.type === "chat") && (
            <button onClick={clearChat} title="Alle Chat-Nachrichten löschen"
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
              <Eraser className="w-3.5 h-3.5" /> Chat leeren
            </button>
          )}
          {selfEmployeeId ? (
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">Angemeldet als {signedInName}</span>
          ) : (
            <select value={selectedEmp} onChange={e => chooseSender(e.target.value)}
              aria-label="Absender auswählen"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:max-w-[12rem] sm:flex-none">
              {employees.map(e => <option key={e.id} value={e.id}>Als: {e.name}</option>)}
            </select>
          )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollPosition}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_46%,#faf8f4_100%)] px-3 py-4 sm:px-5"
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-dashed border-brand-200 bg-white/80 px-5 py-6 text-center shadow-card">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-charcoal">Noch keine Team-Nachrichten</p>
            <p className="mt-1 text-xs text-muted-foreground">Neue Nachrichten erscheinen hier sofort live.</p>
          </div>
        )}
        <div className="space-y-3">
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
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-card"
                    style={{ backgroundColor: emp?.color ?? "#6366f1" }}>
                    {emp?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                  </div>
                ) : <div className="w-8 flex-shrink-0" />}
                <div className={cn("max-w-[78%] sm:max-w-xs flex flex-col gap-0.5", isMe && "items-end")}>
                  {showName && <p className="text-xs text-gray-400 font-medium px-1">{emp?.name}</p>}
                  <div className={cn("flex items-center gap-1.5", isMe && "flex-row-reverse")}>
                    <div className={cn("whitespace-pre-wrap break-words px-3.5 py-2 rounded-2xl text-sm leading-relaxed shadow-sm",
                      isMe ? "bg-brand-600 text-white rounded-tr-sm" : "bg-white text-gray-800 rounded-tl-sm border border-gray-100")}>
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
        </div>
      </div>

      {hasNewMessages && (
        <button
          type="button"
          onClick={() => scrollToLatest("smooth")}
          className="absolute bottom-[4.75rem] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-700 shadow-card transition hover:bg-brand-50"
        >
          Neue Nachrichten <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      <form onSubmit={send} className="shrink-0 border-t border-brand-100 bg-white px-3 py-3 sm:px-4">
        <div className="flex items-end gap-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void sendMessage()
              }
            }}
            rows={1}
            placeholder="Nachricht schreiben..."
            className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-5 placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <button type="submit" disabled={sending || !content.trim()}
            aria-label="Nachricht senden"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card transition hover:bg-brand-700 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </section>
  )
}
