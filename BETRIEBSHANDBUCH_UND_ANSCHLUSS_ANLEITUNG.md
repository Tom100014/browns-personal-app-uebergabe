# 📖 Betriebshandbuch & Anschluss-Anleitung
## Browns Personal App — Browns Coffee Lounge Nürnberg

Willkommen im offiziellen Betriebshandbuch und Entwickler-Anschluss-Handbuch für die **Browns Personal App**. Dieser Ordner enthält den vollständigen Quellcode, alle Konfigurationen, Datenbank-Schemas und Schritt-für-Schritt-Anleitungen zur Verwaltung und Weiterentwicklung der Anwendung.

---

## 🛠️ 1. Projekt-Übersicht & Links

* **Projektname:** Browns Personal App (Browns Coffee Lounge Nürnberg)
* **Live Production URL:** [https://browns-perso-app.vercel.app](https://browns-perso-app.vercel.app)
* **GitHub Repository:** [https://github.com/Tom100014/browns-personal-app-uebergabe.git](https://github.com/Tom100014/browns-personal-app-uebergabe.git)
* **Supabase Project:** `nrqbjzralbteecdmrxeq` ([https://nrqbjzralbteecdmrxeq.supabase.co](https://nrqbjzralbteecdmrxeq.supabase.co))
* **Vercel Dashboard:** `sosotechs-projects/browns-perso-app`

---

## 🔑 2. Vercel Environment Variables (System-Konfiguration)

Folgende Umgebungsvariablen sind in **Vercel Production** hinterlegt:

| Variable | Beschreibung | Wert / Format |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Server URL | `https://nrqbjzralbteecdmrxeq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Anon Key | `sb_publishable_DTXZkYZM0sUmHK2XyGfdrg_RDNxkv63` |
| `SUPABASE_SERVICE_ROLE_KEY` | Administrative Key (Passwort/Zugang) | `eyJhbGciOiJIUzI1NiIsInR...` |
| `RESEND_API_KEY` | E-Mail API Key | `re_aKX6o9y1_MS9ExAMVkDgbRxEZNTbCKc3k` |
| `RESEND_FROM` | E-Mail Absender | `"Browns Perso <onboarding@resend.dev>"` |
| `LLM_API_KEY` | KI-Assistent API Key | `sk-or-v1-bdc2a5c8e2c9...` |
| `LLM_MODEL` | KI-Modell | `openai/gpt-4o-mini` |
| `CRON_SECRET` | System Automatismus Secret | `c05fc8e0558a5f4557bad24750b489c4` |

---

## 💾 3. Supabase & Datenbank-Struktur

Die Datenbank läuft auf PostgreSQL bei Supabase und nutzt **Row-Level Security (RLS)** für maximalen Datenschutz.

### Tabellen-Übersicht:
1. `employees`: Grundlegende Mitarbeiterdaten (Name, E-Mail, Rolle, Position, Farbe).
2. `employee_private`: Geschützte Management-Daten (Stundenlohn, Wochenstunden, Adresse, Geburtsdatum).
3. `time_entries`: Zeiterfassung & Stempeluhr (Kommen, Gehen, Pause, Gesamtstunden).
4. `shifts`: Dienstplan-Schichten (Datum, Uhrzeit, Position, Notiz, Status).
5. `absences`: Abwesenheitsanträge (Urlaub, Krank, Frei, Status).
6. `daily_revenue`: Tages-Umsätze & Tages-Analysen.
7. `revenue`: Monats-Gesamtumsätze.
8. `extras`: Zulagen & Spesen je Mitarbeiter.
9. `documents`: In der Personalakte gespeicherte Dokumente & Arbeitsverträge.
10. `settings`: Einstellungen (DATEV-Lohnarten, Café-Stammdaten).

---

## ✉️ 4. Resend E-Mail-System & Domain-Freischaltung

### Aktueller Stand (Testmodus):
* Der Absender lautet `onboarding@resend.dev`.
* Im Testmodus erlaubt Resend das Senden von E-Mails an die bei Resend registrierte Inhaber-E-Mail (`wachendorf23@gmail.com`).

### Freischaltung für alle Mitarbeiter-E-Mails:
1. Gehe auf [resend.com/domains](https://resend.com/domains).
2. Klicke auf **"Add Domain"** und gib deine Domain ein (z. B. `browns.at`).
3. Trage die 3 angezeigten DNS-Einträge (DKIM / SPF) beim Domain-Anbieter ein.
4. Ändere auf Vercel die Variable `RESEND_FROM` auf:  
   `RESEND_FROM="Browns Perso <no-reply@deine-domain.at>"`

---

## 📱 5. Mitarbeiter App-Zugang & Passwort-Vergabe

### Zugang für Mitarbeiter einrichten:
1. Gehe im Manager-Dashboard auf **Mitarbeiter** (`/dashboard/mitarbeiter`).
2. Klicke bei einem Mitarbeiter auf **„Zugang einrichten“** oder **„Zugang“**.
3. **Passwort vergeben:** Gib ein Passwort ein (mind. 8 Zeichen) und klicke auf **„Setzen“**.
4. **Was passiert automatisch:**
   * Das Passwort wird in Supabase Auth gespeichert.
   * Der Mitarbeiter erhält sofort eine professionelle E-Mail mit Zugangsdaten und App-Installationsanleitung (Safari iPhone / Chrome Android).
   * Der Mitarbeiter kann sich auf `https://browns-perso-app.vercel.app/login` anmelden.

---

## 🚀 6. How-To: Änderungen machen & Aktualisieren

Wenn du in Zukunft Veränderungen an diesem Ordner vornehmen oder neue Features hinzufügen möchtest:

### 1. Ordner im Terminal öffnen:
```bash
cd "/Users/thomasschuh/Desktop/Browns Lounge Nürnberg Personalapp Askim"
```

### 2. Abhängigkeiten installieren:
```bash
npm install
```

### 3. Lokalen Entwicklungsserver starten:
```bash
npm run dev
```
*(Die App öffnet sich unter `http://localhost:3000`)*

### 4. Code-Prüfung & Build testen:
```bash
npx tsc --noEmit && npm run build
```

### 5. Änderungen auf GitHub & Vercel live schalten:
```bash
git add .
git commit -m "feat: Beschreibung deiner Änderung"
git push origin main
npx vercel --prod --yes
```

---

## 🎉 Herzlichen Glückwunsch!
Deine **Browns Personal App** ist vollständig aufgebaut, synchronisiert, abgesichert und bereit für den täglichen Einsatz in der **Browns Coffee Lounge Nürnberg**!
