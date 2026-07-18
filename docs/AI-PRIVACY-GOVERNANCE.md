# KI-Datenschutz und Freigaben

## Sichere Standardwerte

- Die tägliche Mitarbeiteranalyse ist ohne gespeicherte Einwilligung deaktiviert.
- Externe KI-Antworten sind ohne ausdrückliche Aktivierung deaktiviert.
- Auto-Lern-Snapshots werden standardmäßig 30 Tage aufbewahrt; zulässig sind 7, 30 oder 90 Tage.
- Vertretungen bleiben Vorschläge. Es gibt keine automatische bestätigte Zuweisung.

Die Einstellungen liegen als JSON unter `settings.key = ai_privacy`. Fehlende oder ungültige Werte werden mit den sicheren Standardwerten ersetzt.

## Externe Modellgrenze

Gesundheitsdaten, Krankmeldungen, besondere Kategorien personenbezogener Daten und rohe persönliche Wissensnotizen werden vor einem externen Modellaufruf blockiert oder entfernt. Mitarbeiter-Intelligence enthält extern nur operative Stunden-, Zeitnachweis-, Vertretungs- und Überschneidungsdaten.

RAG-Dokumente werden nur aus freigegebenen betrieblichen Kategorien übernommen. Jeder übermittelte Datensatz ist strukturell isoliert und als `MANAGER-GEPRÜFT` oder `UNGEPRÜFT` markiert. Anweisungen innerhalb eines RAG-Dokuments dürfen nicht ausgeführt werden.

## Aufbewahrung und Löschung

Der Lern-Endpunkt löscht bei jedem Lauf Snapshots außerhalb der Aufbewahrungsfrist. Unter **Einstellungen > Datenschutz & KI-Steuerung** kann die Frist geändert und der gesamte Auto-Lern-Bestand nach einer Bestätigung gelöscht werden. Die Löschung umfasst:

- `knowledge_docs` mit dem Titelpräfix `Auto-Lernen Personal `
- `settings.latest_insight`
- alte, an `settings.knowledge` angehängte Auto-Analyse-Blöcke

Manuell gepflegte Betriebsregeln und hochgeladene Dokumente bleiben erhalten.

## Menschliche Freigabe

- Schreibende Agent-Aktionen wie Vertrags- oder Kündigungsentwürfe erzeugen zunächst einen 15 Minuten gültigen Einmalcode. Erst `BESTÄTIGEN <CODE>` führt die Aktion aus.
- `POST /api/agent/plan` speichert Schichten nur mit `humanApproved: true`. Ohne dieses Feld antwortet der Endpunkt mit `409 approval_required` und schreibt nichts.
- KI-erzeugte Schichten werden als `scheduled`, niemals automatisch als `confirmed`, gespeichert.
