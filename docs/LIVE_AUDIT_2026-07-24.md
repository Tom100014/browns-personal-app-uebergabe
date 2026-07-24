# Browns Perso — Technischer & optischer Prüfbericht (Go-Live)

**Datum:** 2026-07-24 · **Stand:** `main` nach PR #5

Dieser Bericht prüft die App technisch, optisch und auf Ladegeschwindigkeit,
listet unlogische Punkte und legt fest, was umgesetzt wird und was noch
verbessert werden muss, damit ein sauberer Live-Betrieb möglich ist.

---

## 1. 🔴 Kritisch — Performance-Fixes wurden rückgängig gemacht

In PR #4 waren diese Punkte bereits behoben; durch parallele Änderungen auf
`main` sind sie **wieder verschwunden**. Sie sollten erneut angewendet werden:

| Punkt | Wirkung | Status |
| :-- | :-- | :-- |
| **Kein Timeout für Supabase** (`supabase.ts`, `supabase-server.ts`) | Bei langsamer/nicht erreichbarer DB hängt **jede** Seite unbegrenzt → leere weiße Seite | wieder offen |
| **Dashboard lädt recharts sofort** (311 kB statt 203 kB) | Langsamer erster Aufbau | wieder offen |
| **Doppelte Auth-Abfrage im Dashboard** (`getUser` + Mitarbeiter-Lookup) | Unnötige Extra-Roundtrips | wieder offen |
| **Keine Fehler-Auffangseite** (`app/error.tsx`) | Fehler → leere Seite statt „Erneut versuchen" | wieder offen |
| **Uneinheitliche Seitenbreiten** (schmale, linksbündige `max-w-*`) | Auf breiten Monitoren viel Leerraum rechts | wieder offen |

→ **Empfehlung:** Diese fünf Punkte erneut einspielen (sauber, ohne die
parallele Stempeluhr-Arbeit zu überschreiben).

## 2. 🟠 Logik / Korrektheit

- **`shift_revenue`-Spalte fehlt in der DB** → Ausstempeln schlug fehl.
  **Behoben in PR #5** (robustes Ausstempeln). Für die Umsatz-Speicherung noch
  einmalig ausführen:
  `ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS shift_revenue NUMERIC(10,2) DEFAULT 0.00;`
- **Auto-Ausstempeln läuft ungesteuert**: Der Cron `/api/timeentries/autoclose`
  schließt offene Stempelungen **immer** (täglich 03:00). Es gibt **keinen
  An/Aus-Schalter**. → wird umgesetzt (siehe §5).
- **Umsatzpflicht ist global**, nicht pro Rolle (Service). → einstellbar machen.
- **Kein „Vergessen zu stempeln"-Hinweis für Mitarbeiter**: Der Admin sieht
  überfällige Einstempelungen auf dem Dashboard, der **Mitarbeiter selbst nicht**.
- **Keine Überstunden-Sicht**: Es gibt keine Sektion, die zeigt, wer **über die
  geplante Schichtzeit hinaus** ausgestempelt hat.
- **„Meine Stunden" ist rudimentär**: nur Wochenbalken, **keine Einzelnachweise,
  keine Suche, keine Struktur nach Tag/Zeit**.

## 3. 🟡 Optik / UX

- Stunden-Seite wirkt unfertig (keine Detailtabelle).
- Verlauf zeigte rohes ISO-Datum → **behoben in PR #5** (Wochentag + Datum).
- Einige Seiten links schmal statt Vollbreite (siehe §1).

## 4. 🟢 Was gut ist

- Sicherheit: Service-Role nur serverseitig, RLS, Rate-Limits, CSP-Header.
- PWA jetzt vollständig (Offline, Manifest-Shortcuts, Install-Banner) — PR #5.
- Ausstempeln jetzt zuverlässig — PR #5.
- Realtime-Sync, Push-System, Storage-Buckets vorhanden.

---

## 5. Umsetzungsplan der gewünschten Funktionen

| # | Funktion | Umfang | Wird umgesetzt |
| :-- | :-- | :-- | :-- |
| A | **„Meine Stunden" professionell**: Einzelnachweise, Struktur nach Tag/Zeit, **Suche**, Summen | mittel | **jetzt** |
| B | **Einstellungen**: System-Auto-Ausstempeln **an/aus**, Umsatzpflicht (Service) an/aus | klein | **jetzt** |
| C | **„Vergessen zu stempeln"** — für Mitarbeiter UND Admin sichtbar | mittel | nächster Schritt |
| D | **Admin-Benachrichtigung** (Push) bei vergessenem Stempeln | mittel | nächster Schritt |
| E | **Überstunden-Sektion**: wer über die Schichtzeit hinaus ausgestempelt hat | mittel | nächster Schritt |
| F | Performance-Fixes aus §1 erneut einspielen | klein–mittel | auf Freigabe |

**Reihenfolge-Empfehlung:** A + B jetzt (dieser PR), danach C/D/E zusammen
(Zeiterfassungs-Warnungen + Push), dann F (Performance erneut).

---

## 6. Go-Live-Checkliste (offen)

1. SQL `shift_revenue`-Spalte in Supabase ausführen.
2. Performance-Fixes (§1) erneut einspielen.
3. Auto-Ausstempeln & Umsatzpflicht in Einstellungen konfigurieren (§5 B).
4. Echten Handy-Test: Mitarbeiter-Login, PWA installieren, Push, Stempeln.
5. Cron-Secret (`CRON_SECRET`) in Vercel gesetzt lassen (Auto-Ausstempeln).
