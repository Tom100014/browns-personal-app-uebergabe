"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Send, LifeBuoy, Check, Clock, Hand, Trash2, Eraser, MessageSquare, Users, Wifi, ChevronDown, Edit3, Ban,
  Paperclip, FileText, Image as ImageIcon, X, Lock, Globe, Download
} from "lucide-react"
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
const SENDER_KEY = "browns_chat_sender_emp_id"

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

type AttachmentInfo = {
  url: string
  name: string
  type: string
}

export default function TeamChat({ messages: initial, employees, coverageRequests, currentEmployeeId, selfEmployeeId, isAdmin = false }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => orderMessages(initial))
  const [coverageItems, setCoverageItems] = useState<CoverageRequest[]>(coverageRequests)
  const [content, setContent] = useState("")
  
  // 1:1 Direktnachricht Empfänger ("" = Öffentlich an alle im Team)
  const [recipientId, setRecipientId] = useState<string>("")
  
  // Datei-Attachment State
  const [attachment, setAttachment] = useState<AttachmentInfo | null>(null)
  const [uploading, setUploading] = useState(false)

  const zeynepId = employees.find(e => e.name.trim().toLowerCase() === "zeynep kara")?.id
  const [selectedEmp, setSelectedEmp] = useState(selfEmployeeId ?? zeynepId ?? currentEmployeeId ?? employees[0]?.id ?? "")
  const [sending, setSending] = useState(false)
  const [liveState, setLiveState] = useState<"connecting" | "connected" | "offline">("connecting")

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

  useEffect(() => { setMessages(orderMessages(initial.map(withEmployee))) }, [initial, withEmployee])
  useEffect(() => { setCoverageItems(coverageRequests) }, [coverageRequests])
  useEffect(() => {
    const map: Record<string, CoverageOffer[]> = {}
    for (const r of coverageRequests) map[r.id] = r.offers ?? []
    setOffers(map)
  }, [coverageRequests])

  const [editingReqId, setEditingReqId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ date: "", startTime: "", endTime: "", position: "", reason: "" })
  const [manageBusy, setManageBusy] = useState<string | null>(null)

  const refreshCoverage = useCallback(async () => {
    const { data } = await createClient()
      .from("coverage_requests")
      .select("*, offers:coverage_offers(*)")
      .order("created_at", { ascending: false })
      .limit(40)

    if (!data) return
    const nextCoverage = data as CoverageRequest[]
    const nextOffers: Record<string, CoverageOffer[]> = {}
    for (const request of nextCoverage) nextOffers[request.id] = request.offers ?? []
    setCoverageItems(nextCoverage)
    setOffers(nextOffers)
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const isNearBottomRef = useRef(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
    }
  }, [])

  const updateScrollPosition = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const nearBottom = distanceToBottom <= 120
    isNearBottomRef.current = nearBottom
    if (nearBottom) setHasNewMessages(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => scrollToLatest("auto"), 50)
    return () => clearTimeout(timer)
  }, [scrollToLatest])

  useEffect(() => {
    const supabase = createClient()
    setLiveState("connecting")

    const messageChannel = supabase
      .channel("public:messages:teamchat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        payload => {
          const newMsg = payload.new as Message
          setMessages(prev => {
            const next = mergeMessage(prev, withEmployee(newMsg))
            if (isNearBottomRef.current) {
              setTimeout(() => scrollToLatest("smooth"), 50)
            } else if (newMsg.employee_id !== selectedEmp) {
              setHasNewMessages(true)
            }
            return next
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        payload => {
          const deletedId = (payload.old as { id: string })?.id
          if (deletedId) setMessages(prev => prev.filter(m => m.id !== deletedId))
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") setLiveState("connected")
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setLiveState("offline")
      })

    return () => { void supabase.removeChannel(messageChannel) }
  }, [selectedEmp, scrollToLatest, withEmployee])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SENDER_KEY)
      if (saved && employees.some(e => e.id === saved)) setSelectedEmp(saved)
    } catch { /* ignore */ }
  }, [employees])

  function chooseSender(id: string) {
    setSelectedEmp(id)
    try { localStorage.setItem(SENDER_KEY, id) } catch { /* ignore */ }
  }

  // Datei-Upload Handler (PDF / Bilder / Dokumente)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert("Datei darf maximal 10 MB groß sein.")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/chat/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Upload fehlgeschlagen")

      setAttachment({
        url: data.url,
        name: data.name,
        type: data.type,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
      alert("Fehler beim Hochladen: " + msg)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function sendMessage() {
    if ((!content.trim() && !attachment) || !selectedEmp) return
    setSending(true)
    const text = content.trim()
    const currentAttachment = attachment
    try {
      const supabase = createClient()
      const payload: Record<string, unknown> = {
        employee_id: selectedEmp,
        content: text || (currentAttachment ? `[Datei: ${currentAttachment.name}]` : ""),
        type: "chat",
        created_at: new Date().toISOString(),
      }

      if (recipientId) payload.recipient_id = recipientId
      if (currentAttachment) {
        payload.attachment_url = currentAttachment.url
        payload.attachment_name = currentAttachment.name
        payload.attachment_type = currentAttachment.type
      }

      const { data, error } = await supabase.from("messages")
        .insert(payload)
        .select("*, employee:employees(id,name,color,position,role)").single()

      if (error || !data) {
        alert("Nachricht konnte nicht gesendet werden.")
        return
      }

      setMessages(prev => mergeMessage(prev, withEmployee(data as Message)))
      setContent("")
      setAttachment(null)
      isNearBottomRef.current = true
      setHasNewMessages(false)

      // Web-Push-Benachrichtigung verschicken
      const senderName = empById(selectedEmp)?.name ?? "Team"
      if (recipientId) {
        notifyPush({
          employeeIds: [recipientId],
          title: `🔒 Direktnachricht von ${senderName}`,
          body: text || `[Datei empfangen: ${currentAttachment?.name}]`,
          url: "/portal/chat",
          tag: "chat-private",
          chatMessageId: data.id,
        })
      } else {
        const others = employees.filter(e => e.id !== selectedEmp).map(e => e.id)
        if (others.length) {
          notifyPush({
            employeeIds: others,
            title: `Team-Chat: ${senderName}`,
            body: text || `[Datei gesendet: ${currentAttachment?.name}]`,
            url: "/portal/chat",
            tag: "chat",
            chatMessageId: data.id,
          })
        }
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

  const signedInName = useMemo(() => {
    const found = employees.find(e => e.id === selectedEmp)
    return found?.name ?? "Mitarbeiter"
  }, [employees, selectedEmp])

  // Gefilterte Nachrichten:
  // Öffentlich wenn recipient_id null ist.
  // 1:1 Direktnachrichten werden nur dem Sender, dem Empfänger und Admins angezeigt.
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (msg.type !== "chat") return true
      if (!recipientId) {
        // Im öffentlichen Team-Tab: Zeige alle öffentlichen Nachrichten
        return !msg.recipient_id
      }
      // Im 1:1 Direktnachrichten-Tab: Zeige nur Konversation zwischen selectedEmp & recipientId
      if (!msg.recipient_id) return false
      const isDirectMatch =
        (msg.employee_id === selectedEmp && msg.recipient_id === recipientId) ||
        (msg.employee_id === recipientId && msg.recipient_id === selectedEmp)
      return isDirectMatch || isAdmin
    })
  }, [messages, recipientId, selectedEmp, isAdmin])

  const targetRecipientName = useMemo(() => {
    if (!recipientId) return null
    return empById(recipientId)?.name ?? "Mitarbeiter"
  }, [recipientId, empById])

  return (
    <section aria-label="Team-Chat" className="flex flex-col h-[calc(100vh-5.5rem)] md:h-[720px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden relative">
      {/* Header mit Modus-Auswahl: Öffentlich vs. 1:1 Direktnachricht */}
      <div className="shrink-0 border-b border-brand-100 bg-gradient-to-r from-brand-50 via-white to-citrus/15 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-card">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-black text-charcoal">
                  {recipientId ? `Direktnachricht mit ${targetRecipientName}` : "Team-Chat"}
                </h2>
                {recipientId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    <Lock className="h-3 w-3" /> Privat (1:1)
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {employees.length} Teammitglieder
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  liveState === "connected" && "bg-emerald-50 text-emerald-700",
                  liveState === "connecting" && "bg-brand-50 text-brand-700",
                  liveState === "offline" && "bg-red-50 text-red-700",
                )}>
                  <Wifi className="h-3 w-3" />
                  {liveState === "connected" ? "Live" : liveState === "connecting" ? "Verbinden" : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Modus & Absender Auswählen */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* Empfänger-Auswahl für 1:1 Privatnachricht */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm">
              <select
                value={recipientId}
                onChange={e => setRecipientId(e.target.value)}
                className="bg-transparent font-bold text-gray-700 focus:outline-none cursor-pointer"
              >
                <option value="">👥 Team (Öffentlich)</option>
                <optgroup label="🔒 Direktnachricht an:">
                  {employees
                    .filter(e => e.id !== selectedEmp)
                    .map(e => (
                      <option key={e.id} value={e.id}>🔒 {e.name} ({e.position})</option>
                    ))}
                </optgroup>
              </select>
            </div>

            {isAdmin && messages.some(m => m.type === "chat") && (
              <button onClick={clearChat} title="Alle Chat-Nachrichten löschen"
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                <Eraser className="w-3.5 h-3.5" /> Leeren
              </button>
            )}

            {!selfEmployeeId && (
              <select value={selectedEmp} onChange={e => chooseSender(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 focus:outline-none">
                {employees.map(e => <option key={e.id} value={e.id}>Als: {e.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Nachrichtenverlauf */}
      <div
        ref={scrollRef}
        onScroll={updateScrollPosition}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_46%,#faf8f4_100%)] px-3 py-4 sm:px-5"
      >
        {filteredMessages.length === 0 && (
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-dashed border-brand-200 bg-white/80 px-5 py-6 text-center shadow-card">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              {recipientId ? <Lock className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
            </div>
            <p className="text-sm font-bold text-charcoal">
              {recipientId ? `Keine privaten Nachrichten mit ${targetRecipientName}` : "Noch keine Team-Nachrichten"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {recipientId ? "Schreibe eine persönliche 1:1 Nachricht. Nur ihr beide könnt sie lesen." : "Neue Nachrichten erscheinen hier sofort live."}
            </p>
          </div>
        )}
        <div className="space-y-3">
          {filteredMessages.map((msg, i) => {
            const emp = empById(msg.employee_id)
            const isMe = msg.employee_id === selectedEmp
            const prev = filteredMessages[i - 1]
            const showName = i === 0 || prev?.employee_id !== msg.employee_id || prev?.type !== "chat"
            const isPrivate = !!msg.recipient_id

            return (
              <div key={msg.id} className={cn("group flex gap-2.5", isMe && "flex-row-reverse")}>
                {showName ? (
                  emp?.avatar ? (
                    <img
                      src={emp.avatar}
                      alt={emp.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-200 shadow-sm"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-card"
                      style={{ backgroundColor: emp?.color ?? "#6366f1" }}>
                      {emp?.name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                  )
                ) : <div className="w-8 flex-shrink-0" />}

                <div className={cn("max-w-[85%] sm:max-w-md flex flex-col gap-0.5", isMe && "items-end")}>
                  {showName && (
                    <div className="flex items-center gap-1 px-1">
                      <p className="text-xs text-gray-500 font-bold">{emp?.name}</p>
                      {isPrivate && (
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                          🔒 Privat
                        </span>
                      )}
                    </div>
                  )}

                  <div className={cn("flex items-center gap-1.5", isMe && "flex-row-reverse")}>
                    <div className={cn("whitespace-pre-wrap break-words px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm flex flex-col gap-2",
                      isMe ? "bg-brand-600 text-white rounded-tr-sm" : "bg-white text-gray-800 rounded-tl-sm border border-gray-200")}>
                      
                      {/* Textinhalt */}
                      {msg.content && <div>{msg.content}</div>}

                      {/* Datei-/Bild-Attachment Render */}
                      {msg.attachment_url && (
                        <div className="mt-1">
                          {msg.attachment_type === "image" ? (
                            <a href={msg.attachment_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-black/10 hover:opacity-95 transition">
                              <img src={msg.attachment_url} alt={msg.attachment_name || "Bild"} className="max-h-56 max-w-full object-cover rounded-xl" />
                            </a>
                          ) : (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              download={msg.attachment_name || "download"}
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold border transition",
                                isMe ? "bg-brand-700/60 border-brand-500 text-white hover:bg-brand-700" : "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100"
                              )}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">{msg.attachment_name || "Datei herunterladen"}</p>
                                <p className="text-[10px] opacity-75 uppercase">{msg.attachment_type || "Dokument"}</p>
                              </div>
                              <Download className="h-4 w-4 shrink-0 opacity-80" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {isAdmin && (
                      <button onClick={() => deleteMessage(msg.id)} title="Nachricht löschen"
                        className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-400 px-1" suppressHydrationWarning>
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

      {/* Eingabebereich — STICKY BOTTOM FÜR STABILE MOBIL-EINGABE */}
      <form onSubmit={send} className="shrink-0 border-t border-brand-100 bg-white/95 backdrop-blur px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 sticky bottom-0 z-30">
        
        {/* Datei-Vorschau Badge vor dem Senden */}
        {attachment && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/80 px-3 py-1.5 text-xs text-brand-900">
            <div className="flex items-center gap-2 truncate">
              {attachment.type === "image" ? <ImageIcon className="h-4 w-4 text-brand-600 shrink-0" /> : <FileText className="h-4 w-4 text-red-600 shrink-0" />}
              <span className="truncate font-bold">{attachment.name}</span>
            </div>
            <button type="button" onClick={() => setAttachment(null)} className="p-1 text-gray-400 hover:text-red-600 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Büroklammer Datei-Upload Button */}
          <label title="Datei, PDF oder Bild anhängen" className={cn(
            "flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition",
            uploading && "animate-pulse opacity-50"
          )}>
            <Paperclip className="h-5 w-5" />
            <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" disabled={uploading} />
          </label>

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
            placeholder={recipientId ? `🔒 Private Nachricht an ${targetRecipientName}...` : "Nachricht an alle schreiben..."}
            className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-5 placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />

          <button type="submit" disabled={sending || uploading || (!content.trim() && !attachment)}
            aria-label="Nachricht senden"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card transition hover:bg-brand-700 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </section>
  )
}
