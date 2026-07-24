"use client"

import { useState, useRef } from "react"
import { Camera, Check, Loader2, User, AlertCircle, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { Employee } from "@/types"

interface Props {
  employee: Employee
  onAvatarChange?: (newAvatar: string | null) => void
  readOnly?: boolean
  showCallout?: boolean
}

export default function AvatarUpload({ employee, onAvatarChange, readOnly = false, showCallout = true }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(employee.avatar ?? null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initials = employee.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Bitte wähle eine gültige Bilddatei (JPG, PNG, WebP) aus.")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Das Bild darf maximal 5 MB groß sein.")
      return
    }

    setUploading(true)
    setError(null)
    setNotice(null)

    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = event.target?.result as string
        if (!base64) {
          setError("Bild konnte nicht gelesen werden.")
          setUploading(false)
          return
        }

        const res = await fetch("/api/employee/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "avatar", id: employee.id, avatar: base64 }),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          setError("Fehler beim Speichern des Profilbilds: " + (data.error || "Unbekannt"))
        } else {
          setAvatarUrl(base64)
          setNotice("Profilbild erfolgreich aktualisiert!")
          onAvatarChange?.(base64)
        }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setError("Unerwarteter Fehler beim Bild-Upload.")
      setUploading(false)
    }
  }

  async function handleDeleteAvatar() {
    if (!confirm(`Möchtest du das Profilbild von ${employee.name} wirklich löschen?`)) return

    setDeleting(true)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch("/api/employee/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "avatar", id: employee.id, avatar: null }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError("Fehler beim Löschen des Profilbilds: " + (data.error || "Unbekannt"))
      } else {
        setAvatarUrl(null)
        setNotice("Profilbild wurde entfernt.")
        onAvatarChange?.(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    } catch {
      setError("Unerwarteter Fehler beim Löschen des Profilbilds.")
    }
    setDeleting(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
      {/* Upload Callout Banner if no avatar set */}
      {showCallout && !avatarUrl && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200/80 p-3.5 rounded-xl text-amber-900 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">Bitte Profilbild hochladen!</p>
            <p className="text-amber-800 mt-0.5">
              Ein Foto hilft der Leitung und allen Kolleg:innen, dich im Team-Chat, Dienstplan und bei Schichtvertretungen sofort zu erkennen.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative group flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={employee.name}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-brand-100 shadow-md transition group-hover:opacity-90"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md border-2 border-white"
              style={{ backgroundColor: employee.color || "#3b82f6" }}
            >
              {initials}
            </div>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || deleting}
              title="Profilbild auswählen"
              className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md transition hover:bg-brand-700 active:scale-95 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h2 className="text-base font-bold text-gray-900 truncate">{employee.name}</h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
              {employee.position}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Foto für Team-Chat, Dienstplan &amp; Personalakte (JPG, PNG, WebP, max. 5 MB).
          </p>

          {!readOnly && (
            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || deleting}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {avatarUrl ? "Foto ändern" : "Profilbild hochladen"}
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleDeleteAvatar}
                  disabled={uploading || deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition disabled:opacity-50"
                  title="Profilbild löschen"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                  Bild löschen
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          {notice}
        </div>
      )}

      {error && (
        <div className="mt-3 text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100">
          {error}
        </div>
      )}
    </div>
  )
}
