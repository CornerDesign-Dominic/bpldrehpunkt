# Produktionsübernahme vom 02.11.2026

Status: **veröffentlicht, Wartungsfenster abgeschlossen**, 16:11 Uhr Berlin.
Der gesamte veröffentlichte Dev-Stand `cc14edf`, einschließlich UTN-/KU-Import,
ist mit den Produktionsanpassungen über [PR 3](https://github.com/CornerDesign-Dominic/bpldrehpunkt/pull/3)
nach `main` übernommen. Releasecommit: `0f4ce7396fb5d51777c8c501432c046c9e7d73a6`.
Vercel erfolgreich; angemeldete neue Oberfläche unter <https://www.drehpunktlogistik.de> geprüft.

## Bereitstellung und Anbindungen

- Alle **199 Functions ACTIVE**, keine unerreichbar. Sechs ersetzte Legacy-Importfunktionen entfernt.
- Alle **72 zusammengesetzten Indizes READY**; Tracking-, Reminder-, Listen- und Palettenaufbereitung bereit.
- Finale Firestore-/Storage-Regeln aktiv. LF-normalisierte Firestorequelle identisch mit aktivem Dev,
  SHA-256 `1afd2073e5ffe9a2d0e196382a5078b3186678d47c263d26b4753757e40d9d13`.
  Die separate Rules-Test-API lieferte 503; die tatsächliche Ruleset-Kompilierung und Aktivierung war erfolgreich.
  Keine Schutzregeln abgeschwächt.
- Alle 15 zusätzlich benötigten Produktions-Secrets aktiv. PowerShell-Helfer mit Known-Folder-Pfaden,
  konkreter Pfaddiagnose und UTF-8-BOM korrigiert; der Nutzer muss ihn nicht erneut ausführen.
- Eigene Mail-/DyCoS-Produktionsidentitäten und Secret-IAM eingerichtet, siehe
  [Vorbereitung](production-2026-11-02-preparation.md). Keine Dev-Tokens kopiert.
  Jeder Nutzer verbindet sein Postfach in Produktion neu.
- Die drei bestehenden SQL-Leseflows erlauben zusätzlich den Produktions-Serviceprincipal.
  Einzelauftrag, Kunde 10001 und Auftragssuche liefern echte lesende Antworten.
- Mail-Anwendungszugriff: gemeinsames no-reply@ HTTP 200, persönliches bb@ HTTP 403.
  Temporäres Produktions-Webhookabonnement erfolgreich angelegt (201), sofort gelöscht (204).
  Keine Funktion für Benutzer dabei aktiviert. Weiterhin Webhooks ohne Kontrollpolling.

## Erinnerungsflow und Wiederaufnahme

Produktionsflow `c1c89a9c-8c98-46c5-9d8d-cbfad7177d65` veröffentlicht und **Ein**.
Nur Produktions-Serviceprincipal `af348c83-0710-4ea0-88e9-ac460472cff1` darf auslösen;
gespeicherte Aufruferliste nach Neuladen bestätigt. Flowprüfung: **0 Fehler, 0 Warnungen**.

Die Oberfläche bietet den importierten WDL-Parameter `testOnly` nicht zur Bearbeitung an.
Deshalb enthält ausschließlich Produktion die sichtbare boolesche Initialisierung
**Production test mode**, Variable `productionTestOnly = false`.
`Check_test_recipient` verwendet `variables('productionTestOnly')` anstelle
`parameters('testOnly')`; ansonsten derselbe Ausdruck und dieselbe Testempfängerliste.
Der alte WDL-Parameter steuert diese Bedingung nicht mehr. Authentifizierung,
Zielbindung, Inhalts-/Zeitprüfung, Claim-/Duplikatprüfung, Ledger, Verbindungen
und Versandwiederholungen unverändert. Dev behält seine Testbegrenzung.

Erst als Entwurf serverseitig gespeichert, dann veröffentlicht; gespeicherte Option
nach Neuladen geprüft. Ein einziger bereits abgelaufener Aufruf an einen normalen
Empfänger außerhalb der alten Testliste: **HTTP 200 / missed**. Die Empfängerprüfung
wurde passiert, der Ablauf vor Claim/Versand gestoppt. Keine echte Testmail versendet;
Postfachzustellung in dieser Übernahme nicht getestet.

Vor späterem Solution-Import aktuelle Clouddefinition sichern und diesen Produktionsmodus
erhalten. Lokale Generatoren erzeugen weiterhin standardmäßig Testbetrieb/gestoppte Flows.
UI-Export der Solution auf Version 1.0.0.5 bestätigt, automatisierter Download ohne
verwendbare lokale Datei; deshalb kein altes Paket über die Clouddefinition importiert.
Zusätzliche PAC-Anmeldung kam nicht zustande und wurde beendet; keine Schutzänderung.

Temporäre globale Mailpause entfernt, vorheriger Zustand wiederhergestellt.
Tracking-, Reminder- und Feiertagszeitplan wieder **ENABLED**; zuvor pausierte
News-Recherche weiterhin **PAUSED**. Stündliche Postfachbereinigung und
Abonnementwartung aktiv; Letztere ist keine Posteingangsabfrage.

## Sicherung und Rücksetzung

- Verwalteter Firestore-Export **SUCCESSFUL: 7.467 Dokumente** im Produktionsbucket:
  `private-release-backups/production-2026-11-02-1793629412243`.
- Alle **16 Storage-Dateien** zusätzlich kopiert, CRC32C/Größe geprüft:
  `private-release-backups/files-2026-11-02`. Keine Downloadtokens in Kopien.
- 21 fachliche Collections rekursiv zurückgesetzt; 1.286 Wurzeldokumente vorab ermittelt.
  Ein Testkalendereintrag und zehn archivierte fachliche Originaldateien entfernt.
  Alle 21 Bereiche anschließend leer.
- **Alle 15 Auth-Konten und Profile exakt erhalten**, einschließlich deaktivierter
  Konten, Rollen und Modulrechten; Vergleich mit separater Sicherung erfolgreich.
  Mitarbeiter-/HR-Daten, Abteilungen, elf Kalendercontainer samt Rechten,
  Urlaubsunterlagen, fünf originale Signaturen und Firmenasset erhalten.
- Betriebskonfiguration, Systemvorlagen, Feiertagsdaten, Nutzungs-/Kostenbelege und
  technische Caches erhalten. Keine Dev-Fachdaten kopiert; Outlook und DyCoS unverändert.

Private Belege, konkrete Löschliste, Benutzervergleich und Abschlussbeleg liegen
außerhalb Git unter `%LOCALAPPDATA%/Drehpunkt/production-cutover/2026-11-02`,
mit eingeschränkten Windows-Dateirechten. Ein Frontend-Rollback stellt die
zurückgesetzten Fachdaten nicht wieder her; dafür Export und Dateikopien verwenden.

## Prüfung und Abnahmegrenzen

- **1.076 Unit-/Vertragstests und 67 isolierte Integrations-/Rulesprüfungen** bestanden,
  keine übersprungenen Tests. Lint, Build und Shared-Abgleich erfolgreich.
- Angemeldet als Bilbo Beutlin: neue Navigation, Profilreiter, Postfachverwaltung,
  erhaltene Benutzerverwaltung und leere Auftragsliste geprüft.
- Sammelimport auf Produktion für 26.10.2026: **15 echte Treffer** aus DyCoS.
  Vorschau anschließend verworfen; kein Auftrag importiert.
- Einzelauftrag/Stammdaten zusätzlich direkt lesend mit Produktionszertifikat geprüft.
  Neuer vollständiger Import mit Speicherung wurde nicht ausgeführt.
- Nach Veröffentlichung hat ein anderes bestehendes Benutzerkonto bereits einen
  neuen DyCoS-Auftrag samt zwei Partnern importiert. Diese neuen Nutzdaten bleiben
  erhalten. Ihre serverseitigen Erstellzeitpunkte liegen nach dem abgeschlossenen
  Reset; spätere Abschlussprüfungen unterscheiden neue Nutzung von alten Restdaten.
- Persönliche Microsoft-Anmeldung und tatsächlicher Mailversand aus der neuen
  Produktionsoberfläche bleiben Nutzerabnahme. Kein Postfach still verbunden.
- Bekannte Buildwarnung zu großen Dateien bleibt; keine neue Störung festgestellt.
