# 🚀 Übergabe-Guide für Claude Code: Browns Lounge Nürnberg Personal-App

Dieses Dokument enthält alle Informationen, Repositories, System-Architekturen und Befehle, damit du nahtlos mit **Claude Code** weiterarbeiten kannst.

---

## 📂 1. GitHub Repositories & Lokale Ordner

| Zweck | GitHub Repository URL | Lokaler Ordner-Pfad auf deinem Mac |
| :--- | :--- | :--- |
| **Übergabe-Hauptrepo** | `https://github.com/Tom100014/browns-personal-app-uebergabe.git` | `/Users/thomasschuh/Desktop/Browns Personal App Übergabe` |
| **Vercel Production Repo** | `https://github.com/Tom100014/browns-perso.git` | `/Users/thomasschuh/Documents/browns-perso` |
| **Arbeitsbereich (Master)** | — | `/Users/thomasschuh/Desktop/Browns Lounge Nürnberg Personalapp Askim` |

> **Live Production URL:** [https://browns-perso-app.vercel.app](https://browns-perso-app.vercel.app)

---

## 🏗️ 2. Architektur & Key Features Summary

1. **Tech Stack:**
   - **Framework:** Next.js 15 (App Router) + React + TypeScript
   - **Styling:** Tailwind CSS (Fluid Glassmorphism & Responsive Mobile Design)
   - **Backend / DB / Auth:** Supabase PostgreSQL (`@supabase/supabase-js`)
   - **Deployment:** Vercel Production (`npx vercel --prod --yes`)

2. **Wichtige API-Endpoints & Komponenten:**
   - **`/api/employee/manage` (`src/app/api/employee/manage/route.ts`):**  
     Zentraler Service-Role Server-Endpoint für 100% verlässliches Erstellen, Bearbeiten, Profilbild-Upload und kaskadierendes Löschen von Mitarbeitern.
   - **Tages-Morgen-Briefing (`src/components/dashboard/DailyMorningBriefing.tsx`):**  
     Automatischer Morgen-Report beim ersten Login des Tages (Wetter, Terrassen-Empfehlung, unbesetzte Schichten, No-Shows & offene Anträge).
   - **Next.js Streaming Skeleton Loaders (`src/app/(app)/*/loading.tsx`):**  
     Verhindert Ladeverzögerungen beim Klicken der Seitentasten (`/zeiterfassung`, `/belegung`, `/dienstplan`, `/mitarbeiter`, `/dashboard`).
   - **System-Check & Push-Test mit Audio (`src/components/einstellungen/SystemCheck.tsx`):**  
     Freischaltungs-Audit & Push-Mitteilungstest mit akustischem Signal-Ton (Web Audio API).
   - **Fotorealistisches Wetter & Events (`src/components/belegung/OccupancyForecast.tsx` & `src/components/dashboard/Weather.tsx`):**  
     Fotorealistische Bilder für Messen, Konzerte, Festivale, Sport-Events und animierte Wetter-Container.

---

## 💻 3. Anweisung für Claude Code Start

Wenn du **Claude Code** im Terminal startest, führe folgende Schritte aus:

### Schritt A: Terminal öffnen und in den Ordner wechseln
```bash
cd "/Users/thomasschuh/Desktop/Browns Personal App Übergabe"
```

### Schritt B: Claude Code starten
```bash
claude
```

### Schritt C: Erster Prompt für Claude Code
Kopiere diesen Text direkt als ersten Befehl in Claude Code:

> **Prompt für Claude Code:**  
> „Hallo Claude! Ich übernehme das Projekt *Browns Lounge Nürnberg Personalapp*. Die Codebasis nutzt Next.js 15, Supabase und Tailwind CSS. Alle Tests laufen über `npm run typecheck && npm test`. Die Mitarbeiter-Verwaltung läuft serverseitig über `/api/employee/manage`. Bitte lies das Repository ein und stehe für die nächsten Aufgaben bereit.“

---

## 🛠️ 4. Wichtige Entwickler-Befehle

- **Typ-Prüfung & Unit-Tests ausführen:**
  ```bash
  npm run typecheck && npm test
  ```
- **Lokalen Dev-Server starten:**
  ```bash
  npm run dev
  ```
- **Direktes Production-Deployment auf Vercel:**
  ```bash
  npx vercel --prod --yes
  ```
