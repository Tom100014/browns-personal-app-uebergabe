"use client"

import { useRef } from "react"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"

/** ISO (yyyy-MM-dd) -> deutsches Anzeigeformat (tt.mm.jjjj) */
function toGerman(iso?: string) {
  if (!iso) return "tt.mm.jjjj"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

/**
 * Anklickbares Datumsfeld: zeigt immer das deutsche Datum sichtbar an,
 * oeffnet ueberall (Feld + Kalender-Icon) den nativen Datums-Picker.
 * value/onChange bleiben ISO (yyyy-MM-dd), damit der Rest der App unveraendert bleibt.
 */
export default function DateInput({ value, onChange, className, required, min, max, id }: {
  value: string
  onChange: (iso: string) => void
  className?: string
  required?: boolean
  min?: string
  max?: string
  id?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const openPicker = () => {
    const el = ref.current
    if (!el) return
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return } catch { /* unsupported */ }
    }
    el.focus(); el.click()
  }

  return (
    <button
      type="button"
      id={id}
      onClick={openPicker}
      className={cn(
        "relative inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-left",
        "hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition cursor-pointer",
        className
      )}
    >
      <span className={cn("tabular-nums", value ? "text-gray-900 font-medium" : "text-gray-400")}>
        {toGerman(value)}
      </span>
      <CalendarDays className="w-4 h-4 text-brand-600 flex-shrink-0" />
      <input
        ref={ref}
        type="date"
        value={value}
        required={required}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Datum waehlen"
      />
    </button>
  )
}
