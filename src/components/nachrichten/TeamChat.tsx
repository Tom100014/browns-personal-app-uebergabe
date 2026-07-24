"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Send, Trash2, Eraser, MessageSquare, Users, Wifi,
  Paperclip, FileText, Image as ImageIcon, X, Lock, Download,
  CheckCheck, Maximize2
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
  
  // 1:1 Direktnachricht Empfänger ("" = Team Öffentlich)
  const [recipientId, setRecipientId] = useState<string>("")
  
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
  const isNearBottomRef = useRef(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
    }
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

  // Gefilterte Nachrichten
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (!msg) return false
      if (msg.type !== "chat") return true
      const targetRecipient = getMsgRecipient(msg)

      if (!recipientId) {
        return !targetRecipient
      }

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

  return (
    <section aria-label="Team-Chat" className="w-full max-w-7xl mx-auto flex flex-col h-[650px] bg-white rounded-3xl border border-gray-200 shadow-md overflow-hidden relative">
      
      {/* Header mit Empfänger- & Absender-Auswahl */}
      <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-amber-500/10 via-white to-amber-500/5 px-4 py-3.5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-base text-gray-900">
                  {recipientId ? `🔒 1:1 Privat-Chat mit ${targetRecipientEmp?.name || "Mitarbeiter"}` : "👥 Team-Chat (Öffentlich)"}
                </h2>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 font-semibold">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  {employees.length} Teammitglieder
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  liveState === "connected" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                )}>
                  <Wifi className="h-3 w-3" />
                  {liveState === "connected" ? "Live Verbunden" : "Verbinden..."}
                </span>
              </p>
            </div>
          </div>

          {/* Steuerung & Empfänger Auswahl */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Empfänger Auswahl */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-xs">
              <select
                value={recipientId}
                onChange={e => setRecipientId(e.target.value)}
                className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="">👥 Team (Öffentlich)</option>
                <optgroup label="🔒 Private 1:1 Nachricht:">
                  {employees
                    .filter(e => e.id !== selectedEmp)
                    .map(e => (
                      <option key={e.id} value={e.id}>🔒 {e.name} ({e.position || "Team"})</option>
                    ))}
                </optgroup>
              </select>
            </div>

            {!selfEmployeeId && (
              <select value={selectedEmp} onChange={e => chooseSender(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 focus:outline-none shadow-xs">
                {employees.map(e => <option key={e.id} value={e.id}>Als: {e.name}</option>)}
              </select>
            )}

            {isAdmin && messages.some(m => m.type === "chat") && (
              <button onClick={clearChat} title="Chat leeren"
                className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                <Eraser className="w-3.5 h-3.5" /> Leeren
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nachrichtenverlauf */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-gradient-to-b from-gray-50/50 via-white to-gray-50/30"
      >
        {filteredMessages.length === 0 && (
          <div className="mx-auto mt-12 max-w-sm rounded-2xl bg-white p-6 text-center shadow-card border border-dashed border-gray-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              {recipientId ? <Lock className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
            </div>
            <p className="text-sm font-bold text-gray-900">
              {recipientId ? `Keine privaten Nachrichten mit ${targetRecipientEmp?.name}` : "Noch keine Team-Nachrichten"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {recipientId ? "Schreibe eine vertrauliche 1:1 Nachricht an deinen Kollegen." : "Starte das Gespräch mit dem Team!"}
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
            <div key={msg.id || i} className={cn("group flex gap-2.5 items-end", isMe ? "justify-end" : "justify-start")}>
              {!isMe && showName && (
                emp?.avatar ? (
                  <img src={emp.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mb-1 border border-gray-200 shadow-xs" />
                ) : (
                  <div className="h-8 w-8 rounded-full shrink-0 mb-1 flex items-center justify-center text-white text-xs font-bold shadow-xs"
                    style={{ backgroundColor: emp?.color || "#f59e0b" }}>
                    {emp?.name?.split(" ")?.map(n => n[0])?.join("")?.slice(0, 2) || "M"}
                  </div>
                )
              )}

              <div className={cn("max-w-[85%] sm:max-w-md flex flex-col gap-0.5", isMe && "items-end")}>
                {showName && !isMe && (
                  <p className="text-xs font-bold text-gray-600 px-1 flex items-center gap-1">
                    {emp?.name || "Kollege"}
                    {isPrivate && <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">🔒 Privat</span>}
                  </p>
                )}

                <div className={cn(
                  "relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-xs break-words flex flex-col gap-1.5",
                  isMe
                    ? "bg-amber-500 text-white rounded-tr-xs"
                    : "bg-white text-gray-900 rounded-tl-xs border border-gray-200"
                )}>
                  {/* Textinhalt */}
                  {msg.content && <div>{msg.content}</div>}

                  {/* Datei / Bild Rendering */}
                  {msgAttachment && (
                    <div className="mt-1">
                      {msgAttachment.type === "image" ? (
                        <div
                          onClick={() => setPreviewImageUrl(msgAttachment.url)}
                          className="relative cursor-pointer group/img overflow-hidden rounded-xl border border-black/10 transition"
                        >
                          <img src={msgAttachment.url} alt={msgAttachment.name} className="max-h-60 max-w-full object-cover rounded-xl" />
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
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold border transition",
                            isMe ? "bg-amber-600/80 border-amber-400 text-white hover:bg-amber-600" : "bg-gray-50 border-gray-200 text-gray-900 hover:bg-gray-100"
                          )}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white shrink-0 shadow-xs">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold">{msgAttachment.name}</p>
                            <p className="text-[10px] opacity-75 uppercase">{msgAttachment.type}</p>
                          </div>
                          <Download className="h-4 w-4 shrink-0 opacity-80" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className={cn("flex items-center gap-1 text-[10px] ml-auto pt-0.5", isMe ? "text-amber-100" : "text-gray-400")}>
                    <span suppressHydrationWarning>{mounted ? format(new Date(msg.created_at || Date.now()), "HH:mm", { locale: de }) : ""}</span>
                    {isMe && <CheckCheck className="h-3.5 w-3.5 inline" />}
                  </div>
                </div>

                {isAdmin && (
                  <button onClick={() => deleteMessage(msg.id)} title="Nachricht löschen"
                    className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 self-end text-[10px] p-0.5">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Eingabebereich */}
      <form onSubmit={send} className="shrink-0 bg-white border-t border-gray-100 p-3 sm:p-4 sticky bottom-0 z-30">
        
        {/* Attachment Preview Badge */}
        {attachment && (
          <div className="mb-2.5 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 p-2 px-3 text-xs text-amber-900 shadow-xs">
            <div className="flex items-center gap-2 truncate">
              {attachment.type === "image" ? <ImageIcon className="h-4 w-4 text-amber-600 shrink-0" /> : <FileText className="h-4 w-4 text-red-600 shrink-0" />}
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
            "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-amber-600 transition border border-gray-200 shadow-xs",
            uploading && "animate-pulse opacity-50 bg-amber-50 text-amber-600"
          )}>
            <Paperclip className="h-5 w-5" />
            <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" disabled={uploading} />
          </label>

          <input
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={recipientId ? `🔒 Private Nachricht an ${targetRecipientEmp?.name}...` : "Nachricht an das Team schreiben..."}
            className="flex-1 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm leading-relaxed placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />

          <button
            type="submit"
            disabled={sending || uploading || (!content.trim() && !attachment)}
            aria-label="Senden"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md transition hover:bg-amber-600 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

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
