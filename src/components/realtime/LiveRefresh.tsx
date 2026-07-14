"use client"

import { useRealtimeRefresh } from "@/lib/realtime"

/**
 * Unsichtbarer Helfer für Server-Komponenten (z.B. Dashboard): abonniert die
 * angegebenen Tabellen und aktualisiert die Seite live, sobald sich Daten ändern.
 */
export default function LiveRefresh({ tables }: { tables: string[] }) {
  useRealtimeRefresh(tables)
  return null
}
