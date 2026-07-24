"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Send, Trash2, Eraser, MessageSquare, Users, Wifi, ChevronDown,
  Paperclip, FileText, Image as ImageIcon, X, Lock, Download, CheckCheck,
  Search, ArrowLeft, Maximize2
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Employee, Message, CoverageRequest } from "@/types"
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

function messageTime(message?: Message | null) {
  if (!message || !message.created_at) return 0
  const parsed = Date.parse(message.created_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

function orderMessages(messages: Message[]) {
  return [...messages]
    .filter(Boolean)
    .sort((a, b) => messageTime(a) - messageTime(b))
    .slice(-MAX_CHAT_ITEMS)
}

function mergeMessage(prev: Message[], next: Message) {
  if (!next) return prev
  const exists = prev.some(message => message?.id === next.id)
  if (exists) return orderMessages(prev.map(message => message?.id === next.id ? next : message))
  return orderMessages([...prev, next])
}

type AttachmentInfo = {
  url: string
  name: string
  type: string
}

function getMsgAttachment(msg?: Message | null): AttachmentInfo | null {
  if (!msg) return null
  const meta = (msg.meta && typeof msg.meta === "object" ? msg.meta : {}) as Record<string, unknown>
  const url = (msg.attachment_url || meta.attachment_url) as string | undefined
  const name = (msg.attachment_name || meta.attachment_name || "Datei") as string
  const type = (msg.attachment_type || meta.attachment_type || "file") as string
  if (!url) return null
  return { url, name, type }
}

function getMsgRecipient(msg?: Message | null): string | null {
  if (!msg) return null
  const meta = (msg.meta && typeof msg.meta === "object" ? msg.meta : {}) as Record<string, unknown>
  return ((msg.recipient_id || meta.recipient_id) as string) || null
}

export default function TeamChat({ messages: initial, employees = [], coverageRequests = [], currentEmployeeId, selfEmployeeId, isAdmin = false }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => orderMessages(initial || []))
  const [content, setContent] = useState("")
  
  // Active Chat: "" = WhatsApp Team-Chat (Öffentlich), or employee.id = 1:1 WhatsApp Privatchat
  const [recipientId, setRecipientId] = useState<string>("")
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const [searchQuery, setSearchQuery] = useState("")
  
  // Attachment State & Lightbox Modal
  const [attachment, setAttachment] = useState<AttachmentInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  const zeynepId = employees.find(e => e?.name?.trim()?.toLowerCase() === "zeynep kara")?.id
  const [selectedEmp, setSelectedEmp] = useState(selfEmployeeId ?? zeynepId ?? currentEmployeeId ?? employees[0]?.id ?? "")
  const [sending, setSending] = useState(false)
  const [liveState, setLiveState] = useState<"connecting" | "connected" | "offline">("connecting")

  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees])
  const empById = useCallback((id?: string | null) => id ? employeeById.get(id) : undefined, [employeeById])
  const withEmployee = useCallback((message: Message): Message => ({
    ...message,
    employee: message.employee ?? empById(message.employee_id),
  }), [empById])

  useEffect(() => { setMessages(orderMessages((initial || []).map(withEmployee))) }, [initial, withEmployee])

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

  function openChat(id: string) {
    setRecipientId(id)
    setMobileView("chat")
  }

  // Datei-Upload Handler
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

  // Server Route Message Sending
  async function sendMessage() {
    if ((!content.trim() && !attachment) || !selectedEmp) return
    setSending(true)
    const text = content.trim()
    const currentAttachment = attachment
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmp,
          content: text || (currentAttachment ? `[Datei: ${currentAttachment.name}]` : ""),
          recipient_id: recipientId || null,
          attachment_url: currentAttachment?.url || null,
          attachment_name: currentAttachment?.name || null,
          attachment_type: currentAttachment?.type || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success || !data.message) {
        throw new Error(data.error || "Fehler beim Senden")
      }

      setMessages(prev => mergeMessage(prev, withEmployee(data.message as Message)))
      setContent("")
      setAttachment(null)
      isNearBottomRef.current = true
      setHasNewMessages(false)

      const senderName = empById(selectedEmp)?.name ?? "Team"
      if (recipientId) {
        notifyPush({
          employeeIds: [recipientId],
          title: `🔒 Direktnachricht von ${senderName}`,
          body: text || `[Datei empfangen: ${currentAttachment?.name}]`,
          url: "/portal/chat",
          tag: "chat-private",
          chatMessageId: data.message.id,
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
            chatMessageId: data.message.id,
          })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nachricht konnte nicht gesendet werden"
      alert("Fehler: " + msg)
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

  // Gefilterte Nachrichten für aktuellen WhatsApp Chat
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (!msg) return false
      if (msg.type !== "chat") return true
      const targetRecipient = getMsgRecipient(msg)

      if (!recipientId) {
        // Im Öffentlichen Team-Chat: Zeige alle allgemeinen Nachrichten
        return !targetRecipient
      }

      // Im 1:1 WhatsApp Privatchat: Zeige nur Chat zwischen selectedEmp & recipientId
      if (!targetRecipient) return false
      const isDirectMatch =
        (msg.employee_id === selectedEmp && targetRecipient === recipientId) ||
        (msg.employee_id === recipientId && targetRecipient === selectedEmp)
      return isDirectMatch || isAdmin
    })
  }, [messages, recipientId, selectedEmp, isAdmin])

  const targetRecipientEmp = useMemo(() => {
    if (!recipientId) return null
    return empById(recipientId) ?? null
  }, [recipientId, empById])

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees.filter(e => e.id !== selectedEmp)
    const q = searchQuery.toLowerCase()
    return employees.filter(e => e.id !== selectedEmp && (e.name.toLowerCase().includes(q) || e.position?.toLowerCase().includes(q)))
  }, [employees, selectedEmp, searchQuery])

  return (
    <section aria-label="Team-Chat" className="w-full max-w-7xl mx-auto flex flex-col md:flex-row h-[calc(100vh-5.5rem)] min-h-[550px] bg-[#111b21] md:bg-white rounded-2xl border border-gray-300 shadow-2xl overflow-hidden">
      
      {/* LEFT SIDEBAR: WHATSAPP CHAT LIST & TEAM DIRECTORY */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-200 bg-[#f0f2f5] shrink-0",
        mobileView === "chat" ? "hidden md:flex" : "flex"
      )}>
        {/* WhatsApp Sidebar Header */}
        <div className="bg-[#075e54] text-white p-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Browns WhatsApp</h2>
              <p className="text-[11px] text-emerald-100 flex items-center gap-1 font-medium">
                <span className={cn("inline-block h-2 w-2 rounded-full", liveState === "connected" ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
                {liveState === "connected" ? "Live Verbunden" : "Verbinden..."}
              </p>
            </div>
          </div>

          {!selfEmployeeId && (
            <select value={selectedEmp} onChange={e => chooseSender(e.target.value)}
              className="rounded-lg bg-black/20 text-white px-2 py-1 text-xs font-semibold focus:outline-none border border-white/20">
              {employees.map(e => <option key={e.id} value={e.id} className="text-gray-900">Als: {e.name}</option>)}
            </select>
          )}
        </div>

        {/* WhatsApp Suche */}
        <div className="p-2.5 bg-white border-b border-gray-200">
          <div className="relative flex items-center bg-[#f0f2f5] rounded-xl px-3 py-1.5 border border-gray-200">
            <Search className="h-4 w-4 text-gray-400 shrink-0 mr-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Chat oder Mitarbeiter suchen..."
              className="w-full bg-transparent text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* WhatsApp Chat Kanäle & 1:1 Mitarbeiter Liste */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 bg-white">
          
          {/* Channel 1: Team-Chat (Öffentlich) */}
          <button
            onClick={() => openChat("")}
            className={cn(
              "w-full text-left p-3.5 flex items-center gap-3 transition hover:bg-[#f5f6f6]",
              recipientId === "" && "bg-[#e9edef] border-l-4 border-[#00a884]"
            )}
          >
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white font-bold shadow-md">
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="truncate font-bold text-sm text-gray-900">👥 Team-Chat (Öffentlich)</h3>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Alle</span>
              </div>
              <p className="truncate text-xs text-gray-500 mt-0.5">Offener Raum für das gesamte Browns Team</p>
            </div>
          </button>

          <div className="px-3 py-2 bg-[#f0f2f5] text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            🔒 1:1 Privat-Nachrichten
          </div>

          {/* 1:1 Direktnachrichten Liste aller Mitarbeiter */}
          {filteredEmployees.map(emp => {
            const isSelected = recipientId === emp.id
            return (
              <button
                key={emp.id}
                onClick={() => openChat(emp.id)}
                className={cn(
                  "w-full text-left p-3.5 flex items-center gap-3 transition hover:bg-[#f5f6f6]",
                  isSelected && "bg-[#e9edef] border-l-4 border-[#00a884]"
                )}
              >
                {emp.avatar ? (
                  <img src={emp.avatar} alt={emp.name} className="h-12 w-12 rounded-full object-cover shrink-0 border border-gray-200 shadow-sm" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white font-bold text-sm shadow-md"
                    style={{ backgroundColor: emp.color || "#075e54" }}>
                    {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="truncate font-bold text-sm text-gray-900">{emp.name}</h3>
                    <span className="text-[10px] font-semibold text-gray-400">{emp.position || "Team"}</span>
                  </div>
                  <p className="truncate text-xs text-gray-500 mt-0.5">Klicke für private 1:1 Nachricht</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT MAIN VIEW: WHATSAPP ACTIVE CHAT WINDOW */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-[#efeae2] relative",
        mobileView === "list" ? "hidden md:flex" : "flex"
      )}>
        
        {/* WhatsApp Chat Top Header Bar */}
        <div className="bg-[#075e54] text-white px-3 py-2.5 sm:px-4 flex items-center justify-between shadow-md shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Zurück-Button */}
            <button
              onClick={() => setMobileView("list")}
              className="md:hidden flex items-center justify-center p-2 text-white/90 hover:text-white rounded-full hover:bg-white/10"
              title="Zurück zur Chat-Liste"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            {recipientId ? (
              targetRecipientEmp?.avatar ? (
                <img src={targetRecipientEmp.avatar} alt="" className="h-10 w-10 rounded-full object-cover shrink-0 border border-white/20" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm">
                  {targetRecipientEmp?.name?.split(" ")?.map(n => n[0])?.join("")?.slice(0, 2) || "P"}
                </div>
              )
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold">
                <Users className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0">
              <h3 className="truncate font-bold text-sm sm:text-base leading-tight">
                {recipientId ? targetRecipientEmp?.name || "Mitarbeiter" : "👥 Team-Chat (Öffentlich)"}
              </h3>
              <p className="text-[11px] text-emerald-100 truncate">
                {recipientId ? `🔒 Verschlüsselter 1:1 Privat-Chat` : `${employees.length} Mitglieder online`}
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isAdmin && messages.some(m => m.type === "chat") && (
              <button onClick={clearChat} title="Chat leeren"
                className="p-2 rounded-full hover:bg-white/10 text-white/90 transition text-xs font-semibold flex items-center gap-1">
                <Eraser className="h-4 w-4" /> <span className="hidden sm:inline">Leeren</span>
              </button>
            )}
          </div>
        </div>

        {/* WhatsApp Chat Wallpaper Nachrichtenverlauf */}
        <div
          ref={scrollRef}
          onScroll={updateScrollPosition}
          className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3 bg-[radial-gradient(#0000000a_1px,transparent_1px)] [background-size:16px_16px]"
        >
          {filteredMessages.length === 0 && (
            <div className="mx-auto mt-12 max-w-sm rounded-2xl bg-white/90 p-6 text-center shadow-lg border border-gray-200">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#00a884]">
                {recipientId ? <Lock className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
              </div>
              <p className="text-sm font-bold text-gray-900">
                {recipientId ? `🔒 1:1 Chat mit ${targetRecipientEmp?.name}` : "👥 Browns Team-Chat"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {recipientId ? "Nachrichten in diesem Raum sind vertraulich und nur für euch beide sichtbar." : "Willkommen im Team-Chat. Schreibe deine Nachricht an alle Kollegen."}
              </p>
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            if (!msg) return null
            const emp = empById(msg.employee_id)
            const isMe = msg.employee_id === selectedEmp
            const prev = filteredMessages[i - 1]
            const showName = i === 0 || prev?.employee_id !== msg.employee_id || prev?.type !== "chat"
            const msgAttachment = getMsgAttachment(msg)
            const msgRecipient = getMsgRecipient(msg)
            const isPrivate = !!msgRecipient

            return (
              <div key={msg.id || i} className={cn("group flex gap-2 items-end", isMe ? "justify-end" : "justify-start")}>
                {!isMe && showName && (
                  emp?.avatar ? (
                    <img src={emp.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 mb-1 border border-gray-200" />
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 mb-1 flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                      style={{ backgroundColor: emp?.color || "#075e54" }}>
                      {emp?.name?.split(" ")?.map(n => n[0])?.join("")?.slice(0, 2) || "M"}
                    </div>
                  )
                )}

                <div className={cn("max-w-[85%] sm:max-w-md flex flex-col gap-0.5", isMe && "items-end")}>
                  {/* WhatsApp Original Message Bubble */}
                  <div className={cn(
                    "relative px-3.5 py-2 rounded-2xl text-sm shadow-md break-words flex flex-col gap-1.5",
                    isMe
                      ? "bg-[#d9fdd3] text-[#111b21] rounded-tr-none border border-emerald-200/60" // WhatsApp Outgoing Bubble
                      : "bg-white text-[#111b21] rounded-tl-none border border-gray-200" // WhatsApp Incoming Bubble
                  )}>
                    {showName && !isMe && (
                      <p className="text-[11px] font-bold text-[#075e54] flex items-center gap-1">
                        {emp?.name || "Kollege"}
                        {isPrivate && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 rounded">🔒 Privat</span>}
                      </p>
                    )}

                    {/* Textinhalt */}
                    {msg.content && <div className="leading-relaxed font-normal">{msg.content}</div>}

                    {/* Datei / Bild Rendering */}
                    {msgAttachment && (
                      <div className="mt-1">
                        {msgAttachment.type === "image" ? (
                          <div
                            onClick={() => setPreviewImageUrl(msgAttachment.url)}
                            className="relative cursor-pointer group/img overflow-hidden rounded-xl border border-black/10 transition"
                          >
                            <img src={msgAttachment.url} alt={msgAttachment.name} className="max-h-64 max-w-full object-cover rounded-xl" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition">
                              <Maximize2 className="h-6 w-6 drop-shadow-md" />
                            </div>
                          </div>
                        ) : (
                          <a
                            href={msgAttachment.url}
                            target="_blank"
                            rel="noreferrer"
                            download={msgAttachment.name}
                            className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold bg-black/5 hover:bg-black/10 border border-black/10 transition text-gray-900"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white shrink-0 shadow-sm">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold">{msgAttachment.name}</p>
                              <p className="text-[10px] text-gray-500 uppercase">{msgAttachment.type}</p>
                            </div>
                            <Download className="h-4 w-4 shrink-0 text-gray-600" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* WhatsApp Timestamp & Checkmarks */}
                    <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 ml-auto pt-0.5">
                      <span suppressHydrationWarning>{mounted ? format(new Date(msg.created_at || Date.now()), "HH:mm", { locale: de }) : ""}</span>
                      {isMe && <CheckCheck className="h-3.5 w-3.5 text-sky-500 inline" />}
                    </div>
                  </div>

                  {isAdmin && (
                    <button onClick={() => deleteMessage(msg.id)} title="Nachricht löschen"
                      className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500 self-end text-[10px]">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {hasNewMessages && (
          <button
            type="button"
            onClick={() => scrollToLatest("smooth")}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 rounded-full bg-[#00a884] px-3.5 py-1.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#008f70]"
          >
            Neue Nachrichten <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}

        {/* WhatsApp Fixed Input Bar (Sticky Bottom) */}
        <form onSubmit={send} className="shrink-0 bg-[#f0f2f5] border-t border-gray-300 p-2.5 sm:p-3 sticky bottom-0 z-30">
          
          {/* Attachment Preview Badge */}
          {attachment && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-white border border-emerald-300 p-2 text-xs text-gray-800 shadow-sm">
              <div className="flex items-center gap-2 truncate">
                {attachment.type === "image" ? <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" /> : <FileText className="h-4 w-4 text-red-600 shrink-0" />}
                <span className="truncate font-bold">{attachment.name}</span>
              </div>
              <button type="button" onClick={() => setAttachment(null)} className="p-1 text-gray-400 hover:text-red-600 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Büroklammer Upload Button */}
            <label title="Datei oder Bild anhängen" className={cn(
              "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-gray-500 hover:bg-gray-100 hover:text-[#00a884] transition shadow-sm border border-gray-200",
              uploading && "animate-pulse opacity-50 bg-emerald-50 text-emerald-600"
            )}>
              <Paperclip className="h-5 w-5" />
              <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" disabled={uploading} />
            </label>

            <input
              type="text"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={recipientId ? `🔒 Private WhatsApp Nachricht an ${targetRecipientEmp?.name}...` : "Nachricht an das Team schreiben..."}
              className="flex-1 rounded-full bg-white border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 shadow-inner"
            />

            <button
              type="submit"
              disabled={sending || uploading || (!content.trim() && !attachment)}
              aria-label="Senden"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-md transition hover:bg-[#008f70] disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Image Lightbox Modal */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setPreviewImageUrl(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img src={previewImageUrl} alt="Vorschau" className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
