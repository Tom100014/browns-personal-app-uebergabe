/** Worked hours from a time entry (handles breaks and overnight shifts). */
export function entryHours(e: { clock_in: string; clock_out?: string | null; break_minutes?: number | null }): number {
  if (!e.clock_out) return 0
  const [sh, sm] = e.clock_in.split(":").map(Number)
  const [eh, em] = e.clock_out.split(":").map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // shift crossed midnight
  mins -= e.break_minutes ?? 0
  return Math.max(0, Math.round(mins / 6) / 10) // 0.1h precision
}

/** Planned hours from a shift's start/end times. */
export function shiftHours(s: { start_time: string; end_time: string }): number {
  const [sh, sm] = s.start_time.split(":").map(Number)
  const [eh, em] = s.end_time.split(":").map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return Math.max(0, Math.round(mins / 6) / 10)
}

export function formatHours(h: number): string {
  return `${h.toFixed(1).replace(".", ",")} h`
}

export function formatEuro(v: number): string {
  return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
