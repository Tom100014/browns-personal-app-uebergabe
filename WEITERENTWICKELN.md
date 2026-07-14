# Browns Perso — Weiterentwickeln

Diese Desktop-Kopie ist eine **vollständige, eigenständige Arbeitskopie** der App. Hier kannst du jederzeit weiterentwickeln.

> ⚠️ Enthält `.env.local` mit **echten Schlüsseln** — Ordner nicht öffentlich teilen / nicht in ein öffentliches Git-Repo legen.

## 1. Vorbereiten (einmalig)

```bash
cd "/Users/thomasschuh/Desktop/Browns Perso App"
npm install        # installiert die Pakete (node_modules), dauert 1–2 Min.
```

## 2. Lokal entwickeln

```bash
npm run dev        # startet http://localhost:3000
```

Änderungen in `src/` werden sofort im Browser aktualisiert (Hot Reload).

- **Admin/Leitung**: Login mit `admin@browns.at`
- Code-Struktur:
  - `src/app/(app)/` — Verwaltung (Dashboard, Dienstplan, Mitarbeiter, Auswertungen, Agent, Einstellungen, System)
  - `src/app/(portal)/` — Mitarbeiter-App
  - `src/app/api/` — Server-Funktionen (Agent, Briefing, Events, Push/E-Mail/WhatsApp, Auto-Ausstempeln …)
  - `src/components/` — UI nach Bereich
  - `src/lib/` — Logik (Supabase, LLM, Agent-Kontext, Forecast, Holidays, Audit …)

## 3. Prüfen vor dem Deploy

```bash
npx tsc --noEmit   # Typprüfung
npm run build      # Produktions-Build testen
```

## 4. Live schalten (Vercel)

```bash
npm i -g vercel    # falls noch nicht installiert
vercel link        # einmalig mit Projekt "browns-perso" verbinden
vercel --prod --yes
```

Umgebungsvariablen liegen in Vercel (Project → Settings → Environment Variables). `.env.local` wirkt nur lokal.

## 5. Handbuch-PDF neu erzeugen

```bash
node scripts/build-handbook-pdf.mjs   # legt das PDF auf den Desktop
```

## 6. Datenbank

- Supabase-Projekt-Ref `nrqbjzralbteecdmrxeq` → Dashboard: https://supabase.com/dashboard/project/nrqbjzralbteecdmrxeq
- Struktur: siehe `DATENBANK-Schema.md`
- Schemaänderungen am besten über das Supabase-Dashboard (SQL Editor); danach `DATENBANK-Schema.md` bei Bedarf aktualisieren.

## Weitere Doku

- `BROWNS-PERSO-KOMPLETT.md` — vollständige Übersicht (Konten, Variablen, Funktionen)
- `Browns-Perso-Betriebsanleitung.pdf` — Bedienungsanleitung
- In-App: „Handbuch"

---
Entwickler: sosotech · Tom Schuh · Langer Weg 23a · 90556 Cadolzburg
