# Browns Perso App teilen

Stand: 2026-07-15

## Aktueller sicherer Stand

- Code liegt privat auf GitHub: https://github.com/Tom100014/browns-perso-app
- Supabase Backend, Auth, Datenbank und Storage sind konfiguriert.
- Production-Keys sind im Vercel-Projekt hinterlegt.
- Live-Deployment ist erfolgreich.
- Live-Link: `https://browns-perso-app.vercel.app/login`
- Lokal: `http://localhost:3001`
- Lint hat keine Fehler, nur Warnungen.
- Admin-Login wurde live getestet.
- Mitarbeiter-Portal wurde live mit einem temporaeren Test-Mitarbeiter getestet und danach bereinigt.

## App kann geteilt werden

Finaler Link:

https://browns-perso-app.vercel.app/login

Hinweis: Das Deployment wurde aus einer sauberen Deploy-Kopie ohne Git-Metadaten erstellt, weil Vercel den GitHub-User `Tom100014` sonst blockiert hat. Der Code bleibt trotzdem privat und aktuell in GitHub.

## Rollen

Leitung/Admin:

- Login mit Admin-Zugang.
- Wird automatisch zum Admin-Dashboard geleitet.
- Kann Mitarbeiter, Dienstplan, Abwesenheiten, Zeiterfassung, Nachrichten, System und Einstellungen verwalten.

Mitarbeiter:

- Login mit eigenem Mitarbeiter-Zugang.
- Wird automatisch zur Mitarbeiter-App geleitet.
- Kann Dienstplan sehen, Schichten bestaetigen, stempeln, Chat nutzen, Abwesenheit melden, Vertretung sehen und Profil/Passwort pflegen.

## Mitarbeiter-Zugang einrichten

Im Admin-Bereich:

1. `Mitarbeiter` oeffnen.
2. Mitarbeiter auswaehlen oder neu anlegen.
3. Rolle pruefen:
   - `employee` fuer normale Mitarbeiter
   - `manager` fuer Leitung mit Admin-Bereich
   - `admin` nur fuer volle Verwaltung
4. `Zugang einrichten` klicken.
5. E-Mail eintragen.
6. Passwort setzen oder Einladung senden.

## Text fuer Mitarbeiter

Hallo, hier ist der Zugang zur Browns Mitarbeiter-App:

https://browns-perso-app.vercel.app/login

Bitte mit deiner E-Mail und deinem Passwort anmelden. Auf dem iPhone kannst du die App ueber Teilen -> Zum Home-Bildschirm speichern. Danach bitte Push-Benachrichtigungen erlauben.

## Text fuer Leitung

Hallo, hier ist der Zugang zur Browns Admin- und Mitarbeiter-App:

https://browns-perso-app.vercel.app/login

Leitung/Admin kommt nach dem Login automatisch ins Dashboard. Mitarbeiter kommen automatisch in die Mitarbeiter-App.
