# Persönliche Stammdatenimport-Historie auf Dev

Freigabe am 02.11.2026 ausschließlich für Dev. Main und Produktion bleiben
unverändert. Main-Baseline: `230c2ad86af9700118e2f1456746292241461efc`.

## Umfang und Zugriff

Unter „Stammdaten importieren“ steht ein eigener Verlauf mit Datum/Uhrzeit,
Benutzer, Debitoren-/Kreditornummer und Ergebnis. Zunächst werden die letzten
25 Vorgänge geladen, weitere jeweils mit „Mehr anzeigen“. Nach einem Abruf
wird die erste Seite aktualisiert. Kein Polling, keine Hintergrund-Worker.
Alte Abrufbelege werden mangels zuverlässiger Benutzerzuordnung nicht migriert.
Bestehende Partnerhistorien und frühere CSV-Prüfungen bleiben erhalten.

Aktives Profil und `masterData: edit` sind erforderlich; der Server bildet den
Benutzerpfad ausschließlich aus der Anmeldung. Auch Superadmins erhalten über
diesen Endpunkt nur ihren eigenen Verlauf. Erfolgreiche Übernahme und
Historienabschluss werden gemeinsam gespeichert; Wiederholungen derselben
Anfrage-ID erzeugen keine doppelten Einträge. Technische Rohdaten und Sperrtokens
werden nicht an den Browser ausgegeben.

## Prüfung

- Lint und Build erfolgreich, bekannte Warnung zu großen Build-Dateien.
- 23 Datenbankprüfungen im isolierten Firestore-Emulator erfolgreich:
  Seitengröße, stabile Cursor, Benutzertrennung, Rechteentzug, Fehler, erneute
  Versuche, neue/ergänzte/unveränderte Übernahmen und bisherige Konfliktregeln.
- 21 gezielte Vertrags-, Mapping- und Verknüpfungsprüfungen erfolgreich.
- Nach Übernahme aktueller Dev-Navigation Build und 15 Navigations-/Callable-
  Prüfungen zusätzlich erfolgreich. Fremde Dev-Änderungen bleiben erhalten.
- Lokale Browserprüfung: 25, dann 50, dann 52 Einträge; danach kein
  „Mehr anzeigen“. Erfolgreicher und fehlgeschlagener Abruf aktualisieren die
  Liste. Feldnummer nach Erfolg geleert; Fehlerhinweise lesbar.

## Gezielte Serverbereitstellung

Explizites Ziel `db-bpl-drehpunkt-dev`, Region `europe-west3`:
`fetchDycosMasterData` aktualisiert, `listDycosMasterDataImports` angelegt.
Beide ACTIVE, CLI exit 0. Vorher 198 Functions, danach 199; Hashvergleich:
nur `fetchDycosMasterData` aktualisiert, nur die Historienfunktion hinzugefügt.
Alle übrigen Functions unverändert. Keine Rules, Indizes, Secrets oder Flows
verändert. Die lokale Functions-Startfrist wurde für diesen CLI-Aufruf auf
60 Sekunden gesetzt; keine Änderung der Anwendungslaufzeit.

Das Frontend wird mit diesem Beleg gemeinsam nach Dev übertragen. Danach
werden Vercelstatus und der authentifizierte Live-Abruf im Import-Tab geprüft.
