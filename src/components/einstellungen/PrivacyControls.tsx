"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Database, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import {
  AI_PRIVACY_SETTINGS_KEY,
  AUTO_LEARNING_TITLE_PREFIX,
  DEFAULT_AI_PRIVACY_SETTINGS,
  SNAPSHOT_RETENTION_OPTIONS,
  parseAiPrivacySettings,
  serializeAiPrivacySettings,
  snapshotCutoffIso,
  stripLegacyAutoLearningBlocks,
  type AiPrivacySettings,
} from "@/lib/privacy"

type SnapshotRow = { id: string; title: string; created_at?: string | null }

function StatusDot({ active }: { active: boolean }) {
  return <span className={`h-2 w-2 flex-shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-gray-300"}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  )
}

export default function PrivacyControls() {
  const [settings, setSettings] = useState<AiPrivacySettings>(DEFAULT_AI_PRIVACY_SETTINGS)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const [{ data: privacyRow, error: privacyError }, { data: snapshotRows, error: snapshotError }] = await Promise.all([
      supabase.from("settings").select("value").eq("key", AI_PRIVACY_SETTINGS_KEY).maybeSingle(),
      supabase
        .from("knowledge_docs")
        .select("id,title,created_at")
        .ilike("title", `${AUTO_LEARNING_TITLE_PREFIX}%`)
        .order("created_at", { ascending: false }),
    ])
    if (privacyError || snapshotError) setError("Datenschutzstatus konnte nicht vollständig geladen werden.")
    setSettings(parseAiPrivacySettings(privacyRow?.value))
    setSnapshots((snapshotRows ?? []) as SnapshotRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cleanLegacyKnowledge() {
    const supabase = createClient()
    const { data } = await supabase.from("settings").select("value").eq("key", "knowledge").maybeSingle()
    const current = data?.value ?? ""
    const cleaned = stripLegacyAutoLearningBlocks(current)
    if (cleaned !== current) await supabase.from("settings").upsert({ key: "knowledge", value: cleaned })
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const supabase = createClient()
    const savedSettings = parseAiPrivacySettings(serializeAiPrivacySettings(settings))
    const { error: saveError } = await supabase.from("settings").upsert({
      key: AI_PRIVACY_SETTINGS_KEY,
      value: serializeAiPrivacySettings(savedSettings),
    })
    const { error: retentionError } = await supabase
      .from("knowledge_docs")
      .delete()
      .ilike("title", `${AUTO_LEARNING_TITLE_PREFIX}%`)
      .lt("created_at", snapshotCutoffIso(savedSettings.snapshotRetentionDays))
    await cleanLegacyKnowledge()

    if (saveError || retentionError) {
      setError("Einstellungen oder Aufbewahrungsfrist konnten nicht gespeichert werden.")
    } else {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    }
    await load()
    setSaving(false)
  }

  async function deleteSnapshots() {
    const confirmed = window.confirm(`Alle ${snapshots.length} Auto-Lern-Snapshots endgültig löschen? Manuell gepflegte Betriebsregeln bleiben erhalten.`)
    if (!confirmed) return

    setDeleting(true)
    setError(null)
    const supabase = createClient()
    const { error: docsError } = await supabase
      .from("knowledge_docs")
      .delete()
      .ilike("title", `${AUTO_LEARNING_TITLE_PREFIX}%`)
    const { error: latestError } = await supabase.from("settings").delete().eq("key", "latest_insight")
    await cleanLegacyKnowledge()
    if (docsError || latestError) setError("Die Auto-Lern-Daten konnten nicht vollständig gelöscht werden.")
    await load()
    setDeleting(false)
  }

  const latest = snapshots[0]?.created_at
    ? new Date(snapshots[0].created_at).toLocaleDateString("de-DE")
    : "keiner"

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Datenschutz &amp; KI-Steuerung</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Status, Modellzugriff und Aufbewahrung der automatisch erzeugten Lernstände.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 border-y border-gray-100">
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Tägliche Mitarbeiteranalyse</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <StatusDot active={!settings.dailyProfilingEnabled} />
                  {settings.dailyProfilingEnabled ? "Aktiviert" : "Standardmäßig aus"}
                </p>
              </div>
              <Toggle
                checked={settings.dailyProfilingEnabled}
                onChange={dailyProfilingEnabled => setSettings(current => ({ ...current, dailyProfilingEnabled }))}
                label="Tägliche Mitarbeiteranalyse"
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Externe KI-Antworten</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <StatusDot active={settings.externalLlmEnabled} />
                  {settings.externalLlmEnabled ? "Aktiv, sensible Personaldaten blockiert" : "Deaktiviert"}
                </p>
              </div>
              <Toggle
                checked={settings.externalLlmEnabled}
                onChange={externalLlmEnabled => setSettings(current => ({ ...current, externalLlmEnabled }))}
                label="Externe KI-Antworten"
              />
            </div>

            <div className="grid gap-2 py-3 text-xs text-gray-600 sm:grid-cols-2">
              <p className="flex items-center gap-2"><StatusDot active />Gesundheitsdaten: gesperrt</p>
              <p className="flex items-center gap-2"><StatusDot active />KI-Aktionen: Freigabe nötig</p>
              <p className="flex items-center gap-2"><StatusDot active />RAG-Quellen: Vertrauenslabel</p>
              <p className="flex items-center gap-2"><StatusDot active />Vertretung: nur Vorschlag</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Auto-Lern-Daten</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px] sm:items-end">
              <div>
                <label htmlFor="snapshot-retention" className="mb-1 block text-xs font-medium text-gray-600">Aufbewahrungsfrist</label>
                <select
                  id="snapshot-retention"
                  value={settings.snapshotRetentionDays}
                  onChange={event => setSettings(current => ({ ...current, snapshotRetentionDays: Number(event.target.value) as AiPrivacySettings["snapshotRetentionDays"] }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  {SNAPSHOT_RETENTION_OPTIONS.map(days => <option key={days} value={days}>{days} Tage</option>)}
                </select>
              </div>
              <div className="text-xs text-gray-500 sm:text-right">
                <p>{snapshots.length} Snapshots gespeichert</p>
                <p className="mt-1">Letzter Stand: {latest}</p>
              </div>
            </div>
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? "Gespeichert" : "Datenschutz speichern"}
            </button>
            <button
              type="button"
              onClick={deleteSnapshots}
              disabled={saving || deleting || snapshots.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Alle Auto-Lern-Daten löschen
            </button>
          </div>
        </>
      )}
    </div>
  )
}
