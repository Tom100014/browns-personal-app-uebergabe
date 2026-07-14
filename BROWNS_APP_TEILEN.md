# Browns Perso App teilen

Stand: 2026-07-15

## Aktueller sicherer Stand

- Code liegt privat auf GitHub: https://github.com/Tom100014/browns-perso-app
- Supabase Backend, Auth, Datenbank und Storage sind konfiguriert.
- Production-Keys sind im neuen Vercel-Projekt `browns-perso-live` hinterlegt.
- Lokaler Build ist erfolgreich.
- Lint hat keine Fehler, nur Warnungen.

## Noch nicht an Mitarbeiter verteilen

Der neue Vercel-Link ist noch nicht freigegeben, weil Vercel das private GitHub-Repo noch nicht lesen darf. Direkte CLI-Deployments wurden bei Vercel als `UNKNOWN` angelegt und sind nicht als stabile Live-App verwendbar.

Noetiger einmaliger Schritt:

1. Vercel Dashboard oeffnen.
2. Projekt `browns-perso-live` oeffnen.
3. GitHub verbinden.
4. Zugriff auf das private Repository `Tom100014/browns-perso-app` erlauben.
5. Danach `main` deployen.

Geplanter finaler Link nach erfolgreichem Deployment:

https://browns-perso-live.vercel.app/login

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

https://browns-perso-live.vercel.app/login

Bitte mit deiner E-Mail und deinem Passwort anmelden. Auf dem iPhone kannst du die App ueber Teilen -> Zum Home-Bildschirm speichern. Danach bitte Push-Benachrichtigungen erlauben.

## Text fuer Leitung

Hallo, hier ist der Zugang zur Browns Admin- und Mitarbeiter-App:

https://browns-perso-live.vercel.app/login

Leitung/Admin kommt nach dem Login automatisch ins Dashboard. Mitarbeiter kommen automatisch in die Mitarbeiter-App.
