"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"

const REFRESH_DELAY_MS = 700

/**
 * Live-Sync: abonniert Postgres-Änderungen der angegebenen Tabellen und löst
 * gebündelt `router.refresh()` aus, sobald sich etwas ändert. Dadurch sehen alle Geräte
 * neue Schichten, Nachrichten, Stempel- und Vertretungsdaten ohne Neuladen.
 * Die kleine Bündelung verhindert mehrere komplette Server-Refreshes direkt
 * hintereinander, wenn Supabase mehrere Events für eine Aktion sendet.
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
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        router.refresh()
      }, REFRESH_DELAY_MS)
    }

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      )
    }
    channel.subscribe()
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router])
}
