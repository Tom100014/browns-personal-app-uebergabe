# Go-Live-Checkliste — Browns Perso

Kurze, abhakbare Schritte für die Kundenübergabe. Details/Begründung stehen im
Prüfbericht `docs/LIVE_AUDIT_2026-07-24.md`.

---

## 1. Datenbank (Supabase → SQL Editor)

Diese SQL einmal ausführen (idempotent, kann gefahrlos wiederholt werden) —
aktiviert die Umsatz-Speicherung beim Ausstempeln:

```sql
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS shift_revenue NUMERIC(10,2) DEFAULT 0.00;
```

Sicherstellen, dass alle versionierten Migrationen aus `supabase/migrations/`
angewendet sind (Reihenfolge nach Dateiname):

- `20260718120000_security_privacy_hardening.sql` — RLS/Sicherheit **(kritisch)**
- `20260718130000_atomic_shift_import.sql`
- `20260723000000_daily_revenue.sql`
- `20260723150000_add_shift_revenue.sql`

> Mit Supabase-CLI: `supabase db push`. Ohne CLI: den Inhalt jeder noch nicht
> angewendeten Migration im SQL Editor ausführen.

---

## 2. Vercel → Project → Settings → Environment Variables

**Erforderlich** (App-Kern, Push, Cron, E-Mail):

| Variable | Wofür |
| :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-Verbindung |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase-Verbindung |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin-Aktionen, Stempeln, Auto-Ausstempeln, Push |
| `CRON_SECRET` | Schützt die Cron-Endpunkte |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web-Push |
| `VAPID_PRIVATE_KEY` | Web-Push |
| `VAPID_SUBJECT` | Web-Push (z. B. `mailto:admin@browns.at`) |
| `RESEND_API_KEY` | E-Mail-Benachrichtigungen |
| `RESEND_FROM` | Absenderadresse der E-Mails |

**Optional** (nur falls genutzt): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`LLM_API_KEY`, `LLM_MODEL`, `GEMINI_API_KEY`, `EVENT_MODEL`.

Nach dem Setzen der Variablen **einmal neu deployen**.

---

## 3. Admin-Push bei vergessenem Stempeln (kostenlos, Hobby-Plan)

Die **In-App-Warnung** (Mitarbeiter-Portal + Admin-Dashboard) läuft ohne weitere
Einrichtung live. Für den zusätzlichen **automatischen Push** stündlich sorgt der
GitHub-Actions-Workflow `.github/workflows/missed-punch-notify.yml`.

Dafür zwei Repository-Secrets anlegen
(GitHub → Settings → Secrets and variables → Actions):

| Secret | Wert |
| :-- | :-- |
| `PROD_APP_URL` | Produktions-URL, z. B. `https://browns-perso-app.vercel.app` (ohne `/`) |
| `CRON_SECRET` | derselbe Wert wie in Vercel |

Ohne diese Secrets überspringt der Workflow sich selbst (kein Fehler). Test per
GitHub → Actions → „Missed-punch admin notify" → **Run workflow**.

---

## 4. Einstellungen in der App (als Admin)

- **Automatisches Ausstempeln**: an/aus nach Wunsch (Standard: aus — vergessene
  Stempelungen bleiben sichtbar).
- **Umsatzpflicht (Service)**: an/aus nach Wunsch.

---

## 5. Abnahmetest (5 Minuten, mit echten Zugangsdaten)

**Als Mitarbeiter:**
- [ ] Einstempeln → Ausstempeln (ggf. mit Umsatz) funktioniert
- [ ] „Meine Stunden" zeigt den Eintrag; Suche nach Tag/Datum/Uhrzeit funktioniert
- [ ] Bei laufender Schicht ohne Stempel erscheint die Warnung „Vergessen zu stempeln?"

**Als Admin:**
- [ ] Dashboard lädt; überfällige Mitarbeiter & Überstunden-Sektion erscheinen bei passenden Daten
- [ ] Einstellungen speichern (Auto-Ausstempeln, Umsatzpflicht)
- [ ] Einen Mitarbeiter vollständig anlegen

**Am Handy:**
- [ ] PWA installieren (Android „Installieren" / iOS „Zum Home-Bildschirm")
- [ ] Push erlauben und Test-Push empfangen
- [ ] Flugmodus → Offline-Seite erscheint
