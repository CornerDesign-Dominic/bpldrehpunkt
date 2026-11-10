# Zeiterfassung: lokaler Entwicklungsprüfstand 10.11.2026

Branch in beiden Checkouts: `codex/time-recorder`. Kein Release, kein Push,
keine Änderung produktiver Firebase-Einstellungen.

## Umfang

- Gemeinsames Firebase-Backend mit Arbeitszeitmodellen, Zeitkonten,
  Stempelereignissen, revisionsgeschützten Korrekturen und Historie.
- Getrennte Zeitmanager-Zuständigkeiten nach Abteilung; Arbeitszeitmodelle nur
  Superadmin. Personal-Leseprojektion ohne Stempel-/Modellzugriff.
- Drehpunkt-Seiten für Mitarbeiter, Zeitmanager und Superadmin sowie
  Personal-Zeitkontokarte und optionaler Link zur mobilen Anwendung.
- Eigenes PWA-Repository `BPLTimeRecorderMobile` mit Zeiterfassung, Urlaub und
  kontogetrennter Offline-Warteschlange ausschließlich für Zeitstempel.
- Überstundenabbau mit eigenem Kontodebit und Referenzen auf genehmigte
  Originalanträge; keine doppelte Wertung von Änderungsunteranträgen.

Fachlicher und technischer Vertrag: [Zeiterfassung](../time-recorder.md).

## Tatsächlich ausgeführte Prüfungen

- Drehpunkt: vollständiges `npm run lint`, Vite-Build und
  `npm run check:functions-shared` erfolgreich.
- 85 ausgewählte Node-Prüfungen erfolgreich, keine fehlgeschlagen oder
  übersprungen: Zeitberechnung und -persistenz, Akteursbindung, Rechte,
  Überstundenabbau, Korrekturfrist, Urlaubssaldo, Feiertagsregion,
  bestehende HR-/Rules-Verträge, Navigation und Übersetzungen.
- Functions-Einstiegsmodul importiert; alle sechs neuen Callable-Exporte
  vorhanden. Dabei keine Functions aufgerufen oder veröffentlicht.
- PWA: ESLint, Vite-Build und acht Node-Prüfungen erfolgreich. IndexedDB wird
  in den Tests mit `fake-indexeddb` ausgeführt, nicht nur durch eine gemockte
  erfolgreiche Synchronisierungsantwort ersetzt.
- Gebaute PWA: beide fingerprinteten JS-/CSS-Dateien im Service-Worker-Precache
  und beide Manifest-PNG-Icons im Ausgabeverzeichnis vorhanden.
- Lokaler Browserstart der PWA zeigt die vorgesehene Einrichtungsansicht, da
  keine lokale Firebase-Konfiguration vorliegt. Keine angemeldete Sitzung oder
  produktiven Daten zur Ersatzprüfung verwendet.
- Beide Builds melden den Hinweis auf große Bundles; kein Buildfehler.

Die Persistenztests verwenden einen kontrollierten In-Memory-Transaktionsspeicher.
Die Rules-Vertragstests sind Quell-/Vertragstests. Das ist **keine** ausgeführte
Firebase-Emulatorprüfung und **keine** Live-Abnahme.

## Vor Dev-Abnahme offen

1. Die sechs Firebase-Webkonfigurationswerte und App-Check-Konfiguration der
   Entwicklungsumgebung lokal beziehungsweise im PWA-Dev-Hosting hinterlegen.
2. PWA-Domain für Firebase Authentication und App Check registrieren.
3. Neue Callables, Rules und `timeHistory`-Index gezielt nach
   `db-bpl-drehpunkt-dev` bereitstellen; Indexaufbau abwarten.
4. Rechte- und Speicherabläufe mit Emulator beziehungsweise echten Dev-Konten
   prüfen, einschließlich Installation, Offline-Neustart, Rechteentzug,
   Netzwerkabbruch nach Serverannahme und paralleler Web-/Handy-Bearbeitung.
5. Erst nach gesonderter fachlicher Abnahme einen Produktionsrelease vorbereiten.
