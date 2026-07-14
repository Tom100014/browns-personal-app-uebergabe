"use client"

import { createClient } from "@/lib/supabase"

// Schreibt einen Eintrag in den Änderungsverlauf (audit_log). Nur Leitung darf
// schreiben (RLS); der Actor wird aus der aktuellen Session ermittelt.
export async function logAudit(action: string, detail?: string): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from("audit_log").insert({ actor: user?.email ?? "—", action, detail: detail ?? null })
  } catch { /* Verlauf ist best effort, blockiert nie die Aktion */ }
}
