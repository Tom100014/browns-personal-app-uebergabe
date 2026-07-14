# Browns Perso App - QA Live Check 2026-07-14

## Ergebnis

Status: technisch gruener Live-Kandidat, aber Domain/Deployment/Production-Freigabe noch offen.

## Getestet

- Produktions-Build: `npm run build` erfolgreich.
- Mitarbeiter-Login: erfolgreich.
- Mitarbeiter-App Seiten: Start, Dienstplan, Stempeln, Stunden, Chat, Abwesenheit, Vertretung, Profil, Checklisten, Hilfe.
- Admin-Login: erfolgreich.
- Admin-Seiten: Dashboard, Dienstplan, Nachrichten, Abwesenheiten, Zeiterfassung, Mitarbeiter, System.
- Rechte: Mitarbeiter wird von Admin-Bereich zurueck ins Portal geleitet.
- Synchronisation Mitarbeiter zu Admin:
  - Schicht bestaetigt und in Datenbank gespeichert.
  - Chat-Nachricht gespeichert und im Admin-Bereich sichtbar.
  - Abwesenheit gespeichert und im Admin-Bereich sichtbar.
  - Stempeln Ein/Aus gespeichert.
- Supabase Storage:
  - Bucket `documents` vorhanden, privat, Upload/Loeschen erfolgreich.
  - Bucket `knowledge` vorhanden, privat, Upload/Loeschen erfolgreich.
  - Bucket `sicknotes` vorhanden, privat, Upload/Loeschen erfolgreich.
- Push-System:
  - Service Worker vorhanden.
  - VAPID-Keys vorhanden.
  - Push-Subscribe-API vorhanden.
  - Push-Notify-API vorhanden.
  - Tabelle `push_subscriptions` erreichbar.

## Backend / Daten

- Supabase ist aktiv fuer Auth, Datenbank und Storage.
- Wichtige Tabellen erreichbar:
  - `employees`
  - `employee_private`
  - `shifts`
  - `messages`
  - `absences`
  - `time_entries`
  - `push_subscriptions`
  - `knowledge_docs`
  - `settings`

## Noch vor Live-Betrieb erledigen

1. App bei Vercel deployen.
2. Production-Umgebungsvariablen in Vercel setzen:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LLM_API_KEY`
   - `LLM_MODEL`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
3. Domain verbinden, z.B. `app.browns-cafe.de`.
4. Supabase Production-Sicherheit pruefen:
   - RLS Policies
   - Backups
   - Service-Role-Key nur serverseitig
   - Storage-Buckets privat lassen
5. Einen echten Handy-Test machen:
   - Mitarbeiter einloggen
   - App zum Home-Bildschirm hinzufuegen
   - Push erlauben
   - Testnachricht senden
6. Optional aktivieren:
   - `RESEND_API_KEY` fuer E-Mail-Fallback
   - WhatsApp-Provider fuer WhatsApp-Fallback

## Test-Screenshots

- Mitarbeiter-App: `/tmp/browns-qa-employee-portal.png`
- Admin-Systemseite: `/tmp/browns-qa-admin-dashboard.png`
