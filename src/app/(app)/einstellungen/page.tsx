"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Wifi, Save, Check, Clock, Store, Bot, HandHelping, Bell, NotebookPen, Server, ExternalLink } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import PushToggle from "@/components/push/PushToggle"
import PushTestButton from "@/components/push/PushTestButton"
import KnowledgeUpload from "@/components/einstellungen/KnowledgeUpload"
import MinStaffingEditor from "@/components/einstellungen/MinStaffingEditor"
import EmailStatus from "@/components/einstellungen/EmailStatus"
import WhatsAppSettings from "@/components/einstellungen/WhatsAppSettings"
import { APP_VERSION, DEVELOPER } from "@/lib/app-info"
import type { OpeningHours, DayHours } from "@/types"

type CafeInfo = { name: string; address: string; phone: string; email: string }
const DEFAULT_CAFE: CafeInfo = { name: "Browns Café", address: "", phone: "", email: "" }

type Automation = { mode: "vorschlag" | "auto"; samePositionOnly: boolean }
const DEFAULT_AUTOMATION: Automation = { mode: "vorschlag", samePositionOnly: false }

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: "mon", label: "Montag" },
  { key: "tue", label: "Dienstag" },
  { key: "wed", label: "Mittwoch" },
  { key: "thu", label: "Donnerstag" },
  { key: "fri", label: "Freitag" },
  { key: "sat", label: "Samstag" },
  { key: "sun", label: "Sonntag" },
]

const DEFAULT_DAY: DayHours = { open: "08:00", close: "18:00", closed: false }
const DEFAULT_HOURS: OpeningHours = {
  mon: { ...DEFAULT_DAY }, tue: { ...DEFAULT_DAY }, wed: { ...DEFAULT_DAY },
  thu: { ...DEFAULT_DAY }, fri: { open: "08:00", close: "20:00", closed: false },
  sat: { open: "09:00", close: "20:00", closed: false }, sun: { open: "09:00", close: "16:00", closed: false },
}

export default function EinstellungenPage() {
  const [wifiIp, setWifiIp] = useState("")
  const [currentIp, setCurrentIp] = useState("")
  const [savingWifi, setSavingWifi] = useState(false)
  const [savedWifi, setSavedWifi] = useState(false)

  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS)
  const [savingHours, setSavingHours] = useState(false)
  const [savedHours, setSavedHours] = useState(false)

  const [cafe, setCafe] = useState<CafeInfo>(DEFAULT_CAFE)
  const [savingCafe, setSavingCafe] = useState(false)
  const [savedCafe, setSavedCafe] = useState(false)

  const [auto, setAuto] = useState<Automation>(DEFAULT_AUTOMATION)
  const [savingAuto, setSavingAuto] = useState(false)
  const [savedAuto, setSavedAuto] = useState(false)

  const KNOW_DEFAULT = "Beispiel-Regeln für die Personalplanung (das System & ein KI-Agent richten sich danach):\n\n• Sommer & schönes Wetter (ab ~22°C, trocken): Außenbereich offen → mehr Service einplanen (mind. +2 im Service, +1 Spüle).\n• Regen/kühl: Innenbetrieb, weniger Außen-Service.\n• Wochenende & Feiertage: stärkere Besetzung in Service & Theke.\n• Frühschicht braucht erfahrene Kraft (Schichtleitung Theke).\n• Küche: immer mind. 1. oder 2. Köchin anwesend.\n• Minijobber: Verdienstgrenze beachten."
  const [knowledge, setKnowledge] = useState("")
  const [savingKnow, setSavingKnow] = useState(false)
  const [savedKnow, setSavedKnow] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from("settings").select("key,value").in("key", ["wifi_ip", "opening_hours", "cafe_info", "automation", "knowledge"])
      for (const row of data ?? []) {
        if (row.key === "wifi_ip") setWifiIp(row.value)
        if (row.key === "opening_hours" && row.value) {
          try { setHours({ ...DEFAULT_HOURS, ...JSON.parse(row.value) }) } catch {}
        }
        if (row.key === "cafe_info" && row.value) {
          try { setCafe({ ...DEFAULT_CAFE, ...JSON.parse(row.value) }) } catch {}
        }
        if (row.key === "automation" && row.value) {
          try { setAuto({ ...DEFAULT_AUTOMATION, ...JSON.parse(row.value) }) } catch {}
        }
        if (row.key === "knowledge") setKnowledge(row.value || "")
      }
      try {
        const res = await fetch("https://api.ipify.org?format=json")
        const { ip } = await res.json()
        setCurrentIp(ip)
      } catch {}
    }
    load()
  }, [])

  async function saveWifi() {
    setSavingWifi(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "wifi_ip", value: wifiIp })
    setSavingWifi(false); setSavedWifi(true)
    setTimeout(() => setSavedWifi(false), 2000)
  }

  async function saveHours() {
    setSavingHours(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "opening_hours", value: JSON.stringify(hours) })
    setSavingHours(false); setSavedHours(true)
    setTimeout(() => setSavedHours(false), 2000)
  }

  function updateDay(key: keyof OpeningHours, patch: Partial<DayHours>) {
    setHours(h => ({ ...h, [key]: { ...h[key], ...patch } }))
  }

  async function saveCafe() {
    setSavingCafe(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "cafe_info", value: JSON.stringify(cafe) })
    setSavingCafe(false); setSavedCafe(true)
    setTimeout(() => setSavedCafe(false), 2000)
  }

  async function saveAuto() {
    setSavingAuto(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "automation", value: JSON.stringify(auto) })
    setSavingAuto(false); setSavedAuto(true)
    setTimeout(() => setSavedAuto(false), 2000)
  }

  async function saveKnowledge() {
    setSavingKnow(true)
    const supabase = createClient()
    await supabase.from("settings").upsert({ key: "knowledge", value: knowledge })
    setSavingKnow(false); setSavedKnow(true)
    setTimeout(() => setSavedKnow(false), 2000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-500 text-sm mt-0.5">Browns Café Konfiguration</p>
      </div>

      {/* System-Anschlüsse */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Server className="w-4.5 h-4.5 text-slate-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 text-sm">System-Anschlüsse</h2>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              Übersicht über Backend, Datenbank, Login, Speicher, Push, E-Mail, WhatsApp und KI-Verbindungen mit Status und Links.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Supabase", "Vercel", "Push", "LLM/KI", "E-Mail", "WhatsApp"].map(item => (
                <span key={item} className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item}</span>
              ))}
            </div>
          </div>
          <Link href="/system"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
            Öffnen <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Vertretungs-Automatik */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4.5 h-4.5 text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Vertretung &amp; Automatik</h2>
            <p className="text-gray-500 text-xs mt-1">Wie soll das System bei Krankmeldungen und abgegebenen Schichten reagieren?</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <button onClick={() => setAuto(a => ({ ...a, mode: "vorschlag" }))}
            className={cn("text-left rounded-xl border p-4 transition",
              auto.mode === "vorschlag" ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50")}>
            <div className="flex items-center gap-2 mb-1">
              <HandHelping className={cn("w-4 h-4", auto.mode === "vorschlag" ? "text-brand-600" : "text-gray-400")} />
              <span className="text-sm font-semibold text-gray-900">Mit Zustimmung</span>
            </div>
            <p className="text-xs text-gray-500">Das System sucht Ersatz, schlägt den besten Kandidaten vor und fragt im Team — <strong>du bestätigst</strong> die Zuweisung.</p>
          </button>
          <button onClick={() => setAuto(a => ({ ...a, mode: "auto" }))}
            className={cn("text-left rounded-xl border p-4 transition",
              auto.mode === "auto" ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50")}>
            <div className="flex items-center gap-2 mb-1">
              <Bot className={cn("w-4 h-4", auto.mode === "auto" ? "text-brand-600" : "text-gray-400")} />
              <span className="text-sm font-semibold text-gray-900">Vollautomatisch</span>
            </div>
            <p className="text-xs text-gray-500">Das System <strong>weist den besten freien Ersatz sofort zu</strong> und informiert das Team. Du kannst es jederzeit unter &quot;Vertretung&quot; ändern.</p>
          </button>
        </div>

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input type="checkbox" checked={auto.samePositionOnly} onChange={e => setAuto(a => ({ ...a, samePositionOnly: e.target.checked }))}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500/30" />
          <span className="text-sm text-gray-700">Nur Mitarbeiter mit <strong>gleicher Position</strong> vorschlagen/zuweisen</span>
        </label>

        <button onClick={saveAuto} disabled={savingAuto}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
          {savedAuto ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Automatik speichern</>}
        </button>
      </div>

      {/* Mindestbesetzung pro Station */}
      <MinStaffingEditor />

      {/* Wissensdatenbank / Betriebsregeln */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
            <NotebookPen className="w-4.5 h-4.5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Wissensdatenbank &amp; Betriebsregeln</h2>
            <p className="text-gray-500 text-xs mt-1">
              Hier hinterlegst du, wie geplant werden soll (z.&nbsp;B. Wetter/Außenbereich, Wochenenden, Mindestbesetzung).
              Das System nutzt diese Regeln — und ein optionaler KI-Agent richtet sich danach.
            </p>
          </div>
        </div>
        <textarea rows={9} value={knowledge} onChange={e => setKnowledge(e.target.value)}
          placeholder={KNOW_DEFAULT}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveKnowledge} disabled={savingKnow}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
            {savedKnow ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Regeln speichern</>}
          </button>
          {!knowledge && (
            <button onClick={() => setKnowledge(KNOW_DEFAULT)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
              Beispiel-Regeln einfügen
            </button>
          )}
        </div>
        <KnowledgeUpload />
      </div>

      {/* Benachrichtigungen */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4.5 h-4.5 text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Push-Benachrichtigungen</h2>
            <p className="text-gray-500 text-xs mt-1">Auf diesem Gerät aktivieren — für Vertretungen, Anträge und Nachrichten.</p>
          </div>
        </div>
        <PushToggle />
        <PushTestButton />
        <EmailStatus />
        <WhatsAppSettings />
      </div>

      {/* Café-Stammdaten */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Store className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Café-Stammdaten</h2>
            <p className="text-gray-500 text-xs mt-1">Name und Kontaktdaten deines Betriebs.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Name</label>
            <input type="text" value={cafe.name} onChange={e => setCafe(c => ({ ...c, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Telefon</label>
            <input type="tel" value={cafe.phone} onChange={e => setCafe(c => ({ ...c, phone: e.target.value }))}
              placeholder="+43 …" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block font-medium">Adresse</label>
            <input type="text" value={cafe.address} onChange={e => setCafe(c => ({ ...c, address: e.target.value }))}
              placeholder="Straße, PLZ Ort" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">E-Mail</label>
            <input type="email" value={cafe.email} onChange={e => setCafe(c => ({ ...c, email: e.target.value }))}
              placeholder="kontakt@browns.at" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
        </div>
        <button onClick={saveCafe} disabled={savingCafe}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
          {savedCafe ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Stammdaten speichern</>}
        </button>
      </div>

      {/* Öffnungszeiten */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4.5 h-4.5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Öffnungszeiten</h2>
            <p className="text-gray-500 text-xs mt-1">Die Öffnungszeiten des Cafés — Grundlage für die Schichtplanung.</p>
          </div>
        </div>

        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = hours[key]
            return (
              <div key={key} className="flex items-center gap-3 py-1.5">
                <span className="w-24 text-sm text-gray-700 font-medium flex-shrink-0">{label}</span>
                {day.closed ? (
                  <span className="flex-1 text-sm text-gray-400">Geschlossen</span>
                ) : (
                  <div className="flex-1 flex items-center gap-2">
                    <input type="time" value={day.open} onChange={e => updateDay(key, { open: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                    <span className="text-gray-400 text-sm">–</span>
                    <input type="time" value={day.close} onChange={e => updateDay(key, { close: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                  </div>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={day.closed} onChange={e => updateDay(key, { closed: e.target.checked })}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500/30" />
                  geschlossen
                </label>
              </div>
            )
          })}
        </div>

        <button onClick={saveHours} disabled={savingHours}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
          {savedHours ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Öffnungszeiten speichern</>}
        </button>
      </div>

      {/* WLAN-Verifikation */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Wifi className="w-4.5 h-4.5 text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">WLAN-Verifikation für Zeiterfassung</h2>
            <p className="text-gray-500 text-xs mt-1">
              Mitarbeiter können sich nur einstempeln, wenn sie mit dem Browns Café WLAN verbunden sind.
              Trage hier die öffentliche IP-Adresse des Café-Routers ein.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block font-medium">Café WLAN — Öffentliche IP-Adresse</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={wifiIp}
                onChange={e => setWifiIp(e.target.value)}
                placeholder="z.B. 85.124.32.1"
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
              <button onClick={() => setWifiIp(currentIp)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition whitespace-nowrap">
                Aktuelle IP
              </button>
            </div>
          </div>

          {currentIp && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Deine aktuelle IP: <span className="font-mono text-gray-600">{currentIp}</span>
            </p>
          )}

          <p className="text-xs text-gray-400 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
            <strong>Anleitung:</strong> Gehe im Café auf ein Gerät im Browns WLAN, klicke &quot;Aktuelle IP&quot; und speichere.
            Mehrere IPs mit Komma trennen. Bei wechselnder (dynamischer) IP ein <code className="bg-white px-1 rounded">/24</code> anhängen
            (z.&nbsp;B. <span className="font-mono">85.124.32.0/24</span>) — dann zählt das ganze Café-Netz. Leer lassen = keine Einschränkung.
          </p>
        </div>

        <button onClick={saveWifi} disabled={savingWifi}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition disabled:opacity-50">
          {savedWifi ? <><Check className="w-4 h-4" /> Gespeichert</> : <><Save className="w-4 h-4" /> Speichern</>}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Über Browns Perso</h2>
        <div className="text-xs text-gray-400 space-y-1">
          <p>Version {APP_VERSION} · Personalplanung für Browns Café</p>
          <p>Dienstplan · Offene Schichten · Zeiterfassung · Abwesenheiten · Vertretung · Personalakte · Auswertungen · Team-Chat · Checklisten</p>
        </div>
        <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 space-y-0.5">
          <p className="font-medium text-gray-700">Entwickler</p>
          <p>{DEVELOPER.company} · {DEVELOPER.name}</p>
          <p>{DEVELOPER.street} · {DEVELOPER.city}</p>
        </div>
      </div>
    </div>
  )
}
