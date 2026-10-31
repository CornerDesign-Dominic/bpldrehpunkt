# Auftragsbereich: freigegebene Dev-Veröffentlichung

Nutzerfreigabe am 31.10.2026 für Veröffentlichung und echte Auftragsprüfung.
Nur `db-bpl-drehpunkt-dev` und `https://dev.drehpunktlogistik.de`.
Main unverändert bei `230c2ad86af9700118e2f1456746292241461efc`.

## Veröffentlichter Umfang

Grundlage `d64e363`, Auftragsbereich `e34aa76`, Rücksprungkorrektur `0f2370f`.
Separate Auftragsliste, dreispaltige Übersicht, fünf Fachreiter, gegenseitige
Trackingverknüpfung und serverseitig protokollierte Aktualisierungen.
Keine Bereiche aus der Sendungsverfolgung entfernt. Ihre vorhandenen
Darstellungen, Mails, Route, Timeline, Historie, Rechnungsprüfung sowie
Fall-, Aufgaben- und Palettenverknüpfungen bleiben erhalten.

## Backend und Rules

Expliziter Firebase-Deploy mit Region `europe-west3` erfolgreich:

- `listTransportOrderRecordsPage`: neu, aktiv.
- `refreshTransportOrderWorkspace`: neu, aktiv; sieben bestehende
  DyCoS-Secret-Bindungen, keine neuen Secrets.
- `reportClientDiagnostic`: aktualisiert, aktiv.
- Firestore-Rules: kompiliert und veröffentlicht; neue Refreshbelege
  lesbar mit Auftragsrecht und ausschließlich serverseitig schreibbar.

Vorher-/Nachher-Inventar: 170 → 172 Endpunkte. Genau zwei ergänzt,
keiner entfernt, unter bestehenden Endpunkten nur Diagnose-Codehash geändert.
Bestehende DyCoS-/Trackingfunktionen unverändert. Keine Indexänderung,
Datenmigration, Storageänderung oder Produktionsbereitstellung.

Vier bestehende nicht geheime Mailbox-Deployparameter wurden unverändert aus
der Dev-Laufzeitkonfiguration im ignorierten lokalen Deployment-Dotenv
wiederhergestellt. Keine Konfigurationswerte oder Zugangsdaten veröffentlicht.

## Prüfung

Vor Veröffentlichung Lint, Build und Abgleich von 42 Shared-Modulen erfolgreich.
103 gezielte Modul-/Vertragstests bestanden. Unabhängige erneute Prüfung:
vier echte Firestore-Emulatorfälle und neun fokussierte Backendtests bestanden,
keine übersprungen. Rechteverweigerung vor Abruf/Reservierung, Parallelreplay,
Teilergebnis sowie Browser-Schreibsperren geprüft. Emulator ausschließlich
`demo-order-workspace`, danach beendet. Bestehende große Bundlewarnung bleibt.

Die erste Vercel-Veröffentlichung zu `e34aa76` war erfolgreich. Die in der
echten Prüfung erkannte Rücksprungkorrektur ist in `0f2370f` enthalten:
Fachreiter/Query/Hash bleiben beim wechselseitigen Öffnen erhalten, ohne eine
neue Rückkehrschleife. Neun Navigations-/Diagnosetests, gezieltes ESLint und
Build für diese Korrektur erfolgreich.

## Echte Dev-Prüfung

Angemeldete vorhandene Testsitzung; keine Konten, Rechte oder Tokens verändert.

- Neue Auftragsliste liefert vorhandene Dev-Aufträge über die neue Callable.
- TA `261000309`: Ertrag 280 EUR, Kosten 200 EUR, Differenz 80 EUR.
  Originalrechnung `66718`, eigenständiger Stornobeleg mit derselben sichtbaren
  Nummer und Bezug zum Original, neue Kundenrechnung `66821` sichtbar.
  Externe UTN-Rechnung und interne Proforma-Nummer getrennt.
- Aktualisierung aus Finanzen: tatsächlicher DyCoS-Abruf erfolgreich,
  Daten unverändert; eigener serverseitiger Historienbeleg.
- Gesamtaktualisierung aus Übersicht: Auftrag und beide verknüpften Partner
  erfolgreich geprüft, alle unverändert; Zeitpunkt/kurzer Historienverweis
  am Button, Einzelresultate in der Historie.
- TA `261000849`: alle drei Stationen und ihre Hinweise sichtbar,
  übermittelte Warenmengen bleiben von Stationsmengen getrennt.
- Geschäftspartnerreiter und Aktualisierungsaktion sichtbar. Wechsel zur
  echten Sendungsverfolgung mit vollständigen Bestandsbereichen geprüft.

Keine Testmails, keine erzeugten Fälle/Palettenbuchungen, keine manuell
geänderten Auftrags- oder Quelldaten. Die beauftragten Aktualisierungen haben
Dev-Import-/Prüfmetadaten und Historien erzeugt. Die DyCoS-Datenquelle wurde
nur gelesen.

Reine Leser und abgewiesene Aktualisierungen sind im Emulator geprüft,
nicht durch Änderungen an echten Benutzerrechten. Echte Teilfehler wurden
nicht künstlich in DyCoS erzeugt; dieser Ablauf ist durch Emulatorfälle belegt.

## Abschließender Frontend-Nachtest

Vercel meldet Erfolg für `0f2370f57d80b702d4c229305ab1e17485b6372f`.
Dev neu geladen: Auftrag → Geschäftspartnerreiter → Sendungsverfolgung →
„Auftrag öffnen“ stellt denselben Reiter wieder her (`?tab=partners`).
Separater Stammdatenabruf bei TA `261000849` erfolgreich; beide
Geschäftspartner als aktualisiert protokolliert. Kein erneuter Auftragsabruf
für diesen Stammdaten-Scope. Live-Screenshot außerhalb des Repositories
unter der chatbezogenen Visualisierungsablage gesichert.

Git-Remote `main` nach Veröffentlichung unverändert. Nur Dev-Deployziele
wurden angesprochen. Eine spätere Produktionsübernahme bleibt separat
freizugeben.
