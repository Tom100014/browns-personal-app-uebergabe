"use client"

import { useState, useEffect } from "react"
import { ShieldCheck, BellRing, Users, CheckCircle2, AlertTriangle, Loader2, Volume2, Play, Send } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Employee } from "@/types"

function playAudioChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio Context not supported or allowed
  }
}

export default function SystemCheck() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [pushCount, setPushCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [testingPush, setTestingPush] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [broadcastBusy, setBroadcastBusy] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null)

  useEffect(() => {
    async function auditSystem() {
      setLoading(true)
      const supabase = createClient()
      const [{ data: empData }, { count: pushSubCount }] = await Promise.all([
        supabase.from("employees").select("*").order("name"),
        supabase.from("push_subscriptions").select("id", { count: "exact", head: true })
      ])
      setEmployees((empData ?? []) as Employee[])
      setPushCount(pushSubCount ?? 0)
      setLoading(false)
    }
    auditSystem()
  }, [])

  const withAuthLogin = employees.filter(e => e.auth_user_id)
  const pendingLogin = employees.filter(e => !e.auth_user_id)
  const admins = employees.filter(e => e.role === "admin")
  const managers = employees.filter(e => e.role === "manager")
  const staff = employees.filter(e => e.role === "employee")

  async function handleTestScreenPush() {
    setTestingPush(true)
    setTestResult(null)

    // Play local audio chime tone immediately
    playAudioChime()

    try {
      // Trigger Web Push Notification
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "self",
          title: "🔊 Browns System-Check & Test-Signal",
          body: "Push-Benachrichtigung mit Ton & Bildschirm-Mitteilung erfolgreich auf deinem Gerät empfangen!",
          url: "/dashboard",
          tag: "system-check-push",
          important: true,
        }),
      })
      const data = await res.json()
      if (res.ok && !data.error) {
        setTestResult("✅ Push-Mitteilung mit Ton & Bildschirm-Banner gesendet!")
      } else {
        setTestResult("⚠️ Push-Mitteilung konnte nicht gesendet werden: " + (data.error || "Unbekannter Fehler"))
      }
    } catch {
      setTestResult("❌ Netzwerkfehler beim Ausführen des Push-Tests.")
    }
    setTestingPush(false)
  }

  async function handleBroadcastTest() {
    if (!confirm(`Möchtest du eine Test-Push-Nachricht an ALLE ${pushCount} aktiv registrierten Geräte senden?`)) return

    setBroadcastBusy(true)
    setBroadcastResult(null)
    playAudioChime()

    try {
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "broadcast",
          title: "🔔 Browns System-Weckruf",
          body: "Hallo Team! Dies ist ein Test der Alarm- & Push-Mitteilungen für Browns Lounge Nürnberg.",
          url: "/nachrichten",
          important: true,
        }),
      })
      const data = await res.json()
      if (res.ok && !data.error) {
        setBroadcastResult(`✅ Erfolgreich an ${data.sent ?? pushCount} Gerät(e) gesendet!`)
      } else {
        setBroadcastResult("⚠️ Broadcast-Fehler: " + (data.error || "Nicht gesendet"))
      }
    } catch {
      setBroadcastResult("❌ Netzwerkfehler beim Senden des Broadcasts.")
    }
    setBroadcastBusy(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold mb-2">
            <ShieldCheck className="w-4 h-4 text-brand-600" /> System-Check &amp; Audit
          </div>
          <h2 className="text-xl font-bold text-gray-900">System-Status, Zugänge &amp; Push-Test</h2>
          <p className="text-xs text-gray-500 mt-1">
            Überprüfe die Freischaltung aller Mitarbeiter und teste Push-Benachrichtigungen mit Ton &amp; Bildschirm-Mitteilungen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestScreenPush}
            disabled={testingPush}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
          >
            {testingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            Push mit Ton auf Screen testen
          </button>
        </div>
      </div>

      {testResult && (
        <div className="p-3.5 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 text-xs font-semibold flex items-center gap-2">
          <BellRing className="w-4 h-4 text-brand-600 flex-shrink-0" />
          <span>{testResult}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> System-Audit wird ausgeführt…
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {/* Employee Freischaltungs Card */}
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Mitarbeiter Status</span>
              <Users className="w-4 h-4 text-brand-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{employees.length}</p>
            <p className="text-xs text-gray-500 mt-1">Gesamt im System</p>
            <div className="mt-3 pt-3 border-t border-gray-200/60 space-y-1 text-xs">
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Mit Login freigeschaltet:</span>
                <span className="font-bold">{withAuthLogin.length}</span>
              </div>
              {pendingLogin.length > 0 && (
                <div className="flex justify-between text-amber-700 font-medium">
                  <span>Ohne Login (Einladung offen):</span>
                  <span className="font-bold">{pendingLogin.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rollen Verteilung */}
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Rollen &amp; Rechte</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{admins.length + managers.length}</p>
            <p className="text-xs text-gray-500 mt-1">Leitungskräfte (Admins &amp; Manager)</p>
            <div className="mt-3 pt-3 border-t border-gray-200/60 space-y-1 text-xs text-gray-600">
              <div className="flex justify-between"><span>Admins:</span><span className="font-bold text-gray-900">{admins.length}</span></div>
              <div className="flex justify-between"><span>Manager:</span><span className="font-bold text-gray-900">{managers.length}</span></div>
              <div className="flex justify-between"><span>Mitarbeiter:</span><span className="font-bold text-gray-900">{staff.length}</span></div>
            </div>
          </div>

          {/* Push Subscriptions Card */}
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Push-Empfänger</span>
              <BellRing className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{pushCount}</p>
            <p className="text-xs text-gray-500 mt-1">Aktive Geräte für Mitteilungen</p>
            <div className="mt-3 pt-3 border-t border-gray-200/60">
              <button
                onClick={handleBroadcastTest}
                disabled={broadcastBusy || pushCount === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition disabled:opacity-50"
              >
                {broadcastBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Test-Alarm an Team senden
              </button>
              {broadcastResult && (
                <p className="mt-2 text-[11px] font-semibold text-violet-900 leading-tight">{broadcastResult}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Freischaltungs-Liste Details */}
      {pendingLogin.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Ausstehende Mitarbeiter-Freischaltungen ({pendingLogin.length}):</span>
          </div>
          <p className="text-xs text-amber-800 mb-3">
            Folgende Mitarbeiter haben noch keinen aktiven App-Login. Du kannst ihnen unter &quot;Mitarbeiter&quot; ein Passwort setzen oder eine E-Mail-Einladung senden:
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingLogin.map(emp => (
              <a
                key={emp.id}
                href={`/mitarbeiter/${emp.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-amber-300 text-amber-950 text-xs font-semibold hover:bg-amber-100 transition shadow-2xs"
              >
                <span>{emp.name} ({emp.position})</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
