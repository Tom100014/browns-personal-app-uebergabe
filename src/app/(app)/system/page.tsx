import {
  Cloud, Database, HardDrive, Bell, Mail, Bot, ShieldCheck,
  CheckCircle2, Circle, KeyRound, Server, History, ExternalLink, MessageCircle,
} from "lucide-react"
import { createClient } from "@/lib/supabase-server"
import { format } from "date-fns"
import { de } from "date-fns/locale"

type AuditEntry = { id: string; actor: string | null; action: string; detail: string | null; created_at: string }
type Service = {
  icon: typeof Cloud
  name: string
  tech: string
  purpose: string
  ok: boolean
  optional?: boolean
  link?: string
  linkLabel?: string
}

function StatusBadge({ ok, optional }: { ok: boolean; optional?: boolean }) {
  if (ok) {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Aktiv</span>
  }
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${optional ? "bg-gray-100 text-gray-500" : "bg-red-50 text-red-700"}`}>
    <Circle className="w-3.5 h-3.5" /> {optional ? "Optional — nicht aktiv" : "Fehlt"}
  </span>
}

function ServiceLink({ href, label = "Öffnen" }: { href?: string; label?: string }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}

export default async function SystemPage() {
  const supabase = await createClient()
  const { data: auditRows } = await supabase.from("audit_log").select("id,actor,action,detail,created_at").order("created_at", { ascending: false }).limit(30)
  const audit = (auditRows ?? []) as AuditEntry[]

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const supabaseRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1]
  const supabaseDashboard = supabaseRef ? `https://supabase.com/dashboard/project/${supabaseRef}` : "https://supabase.com/dashboard/projects"
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasVapid = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
  const hasEmail = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM
  const hasWhatsApp = !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID
  const hasLLM = !!process.env.LLM_API_KEY
  const llmKey = process.env.LLM_API_KEY || ""
  const isOpenRouter = llmKey.startsWith("sk-or-")
  const isAnthropic = llmKey.startsWith("sk-ant-")
  const llmProvider = !hasLLM ? "Regelbasiert, LLM optional" : isOpenRouter ? "OpenRouter" : isAnthropic ? "Anthropic Claude" : "OpenAI-kompatibel"
  const llmLink = isOpenRouter
    ? "https://openrouter.ai/settings/keys"
    : isAnthropic
      ? "https://console.anthropic.com/settings/keys"
      : "https://platform.openai.com/api-keys"

  const services: Service[] = [
    { icon: Cloud, name: "Hosting", tech: "Vercel", purpose: "Betrieb der Web-App & Server-Funktionen", ok: true, link: "https://vercel.com/dashboard", linkLabel: "Vercel" },
    { icon: Database, name: "Backend, Datenbank & Login", tech: "Supabase (Postgres + Auth)", purpose: "Mitarbeiter, Schichten, Zeiten, Logins und Rechte", ok: hasSupabase, link: supabaseDashboard, linkLabel: "Supabase" },
    { icon: HardDrive, name: "Datei-Speicher", tech: "Supabase Storage", purpose: "Personalakte, Arbeitsverträge und Dokumente", ok: hasSupabase && hasService, link: supabaseRef ? `${supabaseDashboard}/storage/buckets` : supabaseDashboard, linkLabel: "Storage" },
    { icon: Bell, name: "Push-Benachrichtigungen", tech: "Web Push (VAPID)", purpose: "Plan, Ersatzsuche, Genehmigungen und Chat", ok: hasVapid },
    { icon: Mail, name: "E-Mail-Fallback", tech: "Resend", purpose: "Wichtige Infos zusätzlich per E-Mail", ok: hasEmail, optional: true, link: "https://resend.com/emails", linkLabel: "Resend" },
    { icon: MessageCircle, name: "WhatsApp-Fallback", tech: "WhatsApp Cloud API / Anbieter", purpose: "Optionale proaktive Nachrichten an Mitarbeiter-Telefone", ok: hasWhatsApp, optional: true, link: "https://developers.facebook.com/docs/whatsapp/cloud-api", linkLabel: "WhatsApp API" },
    { icon: Bot, name: "Browns Agent / KI", tech: llmProvider, purpose: "Arbeitsverträge, Überstunden, Kündigungsentwürfe, Planung und Prognose", ok: true, link: hasLLM ? llmLink : undefined, linkLabel: "KI-Konsole" },
    { icon: Bot, name: "Google Vertex AI", tech: "Nicht angebunden", purpose: "Derzeit nicht verbunden; nur nötig, falls später Vertex statt LLM_API_KEY genutzt werden soll", ok: false, optional: true, link: "https://cloud.google.com/vertex-ai", linkLabel: "Vertex" },
  ]

  const required = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", desc: "Adresse der Datenbank", ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", desc: "Öffentlicher DB-Schlüssel (Browser)", ok: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { key: "SUPABASE_SERVICE_ROLE_KEY", desc: "Geheimer Server-Schlüssel (Logins anlegen, Push senden)", ok: hasService },
    { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", desc: "Push — öffentlicher Schlüssel", ok: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY },
    { key: "VAPID_PRIVATE_KEY", desc: "Push — geheimer Schlüssel (Server)", ok: !!process.env.VAPID_PRIVATE_KEY },
  ]

  const optional = [
    { key: "RESEND_API_KEY + RESEND_FROM", desc: "E-Mail-Versand (Resend-Konto + verifizierte Absenderadresse)", ok: hasEmail },
    { key: "LLM_API_KEY", desc: "Echte KI-Sprachmodell-Intelligenz (z.B. Claude) — optional", ok: hasLLM },
  ]

  return (
    <div className="min-w-0">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">System &amp; Integrationen</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welche Dienste die App nutzt, welche Zugänge nötig sind und wo Schlüssel hinterlegt werden</p>
      </div>

      {/* Komponenten / Status */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Server className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Komponenten &amp; Verbindungen</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {services.map(({ icon: Icon, name, tech, purpose, ok, optional, link, linkLabel }) => (
            <div key={name} className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Icon className="w-4.5 h-4.5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="break-words text-sm font-medium text-gray-900">{name} <span className="font-normal text-gray-400">· {tech}</span></p>
                <p className="break-words text-xs text-gray-500">{purpose}</p>
              </div>
              <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
                <ServiceLink href={link} label={linkLabel} />
                <StatusBadge ok={ok} optional={optional} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KI / Intelligenz */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Intelligenz / KI-Modell</h2>
        </div>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li className="flex gap-2"><span className="text-brand-500 mt-0.5">•</span><span><strong>Aktiv: Regelbasierte Automatik</strong> — prüft Position, Verfügbarkeit und Konflikte, schlägt den besten Ersatz vor oder weist automatisch zu. Kostenlos, schnell, keine Datenweitergabe.</span></li>
          <li className="flex gap-2"><span className="text-brand-500 mt-0.5">•</span><span>Modus einstellbar unter <strong>Einstellungen → Vertretung &amp; Automatik</strong> (Mit Zustimmung / Vollautomatisch).</span></li>
          <li className="flex gap-2"><span className="text-brand-500 mt-0.5">•</span><span><strong>Optional: echtes KI-Sprachmodell</strong> (z.B. Claude) für Freitext-Vorschläge — dafür einen <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">LLM_API_KEY</code> hinterlegen. {hasLLM ? "(konfiguriert)" : "(derzeit nicht aktiv)"}</span></li>
        </ul>
      </div>

      {/* Benötigte Zugänge */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Benötigte Zugänge</h2>
        </div>
        <div className="space-y-2">
          {required.map(({ key, desc, ok }) => (
            <div key={key} className="grid min-w-0 gap-1.5 rounded-lg border border-gray-100 p-2.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:border-0 sm:p-0">
              <code className="min-w-0 break-all rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">{key}</code>
              <span className="min-w-0 text-xs text-gray-500">{desc}</span>
              <div className="justify-self-start sm:justify-self-end"><StatusBadge ok={ok} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Optionale Zugänge */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Optionale Zugänge</h2>
        </div>
        <div className="space-y-2">
          {optional.map(({ key, desc, ok }) => (
            <div key={key} className="grid min-w-0 gap-1.5 rounded-lg border border-gray-100 p-2.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:border-0 sm:p-0">
              <code className="min-w-0 break-all rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">{key}</code>
              <span className="min-w-0 text-xs text-gray-500">{desc}</span>
              <div className="justify-self-start sm:justify-self-end"><StatusBadge ok={ok} optional /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Änderungsverlauf */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <History className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Änderungsverlauf</h2>
          <span className="text-xs text-gray-400 ml-1">letzte Aktionen der Leitung</span>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine protokollierten Änderungen.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {audit.map(a => (
              <div key={a.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
                <span className="mt-0.5 text-[11px] tabular-nums text-gray-400">{format(new Date(a.created_at), "dd.MM. HH:mm", { locale: de })}</span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-gray-800">{a.action}</p>
                  {a.detail && <p className="break-words text-xs text-gray-500">{a.detail}</p>}
                </div>
                <span className="col-start-2 min-w-0 break-all text-[11px] text-gray-400 sm:col-start-auto sm:max-w-[140px] sm:truncate">{a.actor}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wo Schlüssel eintragen */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-brand-900 leading-relaxed">
          <p className="font-semibold mb-1">Wo werden API-Schlüssel eingetragen?</p>
          <p>Geheime Schlüssel gehören <strong>nicht</strong> in den Browser, sondern sicher auf den Server:
          Vercel → Projekt <em>browns-perso</em> → Settings → Environment Variables → Variable anlegen → neu deployen.
          Diese Seite zeigt nur den <strong>Status</strong> (gesetzt / nicht gesetzt), niemals den Schlüssel selbst.</p>
        </div>
      </div>
    </div>
  )
}
