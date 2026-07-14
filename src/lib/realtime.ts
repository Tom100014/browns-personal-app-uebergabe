"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"

/**
 * Live-Sync: abonniert Postgres-Änderungen der angegebenen Tabellen und löst
 * `router.refresh()` aus, sobald sich etwas ändert. Dadurch sehen alle Geräte
 * neue Schichten, Nachrichten, Stempel- und Vertretungsdaten ohne Neuladen.
 *
 * Komponenten, die ihren Anfangszustand aus Props seeden, müssen diesen Zustand
 * bei neuen Props nachziehen (useEffect(() => setX(initial), [initial])), damit
 * der Refresh sichtbar wird.
 */
export function useRealtimeRefresh(tables: readonly string[]): void {
  const router = useRouter()
  const key = tables.join(",")

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`rt-${key}`)
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => router.refresh(),
      )
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router])
}
