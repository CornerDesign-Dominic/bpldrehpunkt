# Erweiterte Vertragsakte – Dev-Abschluss 05.11.2026

Ausdrücklicher Auftrag: Aktenausbau samt Stift-/Mülleimer-Buttons auf dem
aktuellen Dev-Stand veröffentlichen und danach im Browser prüfen. Fachlich
handelt es sich um Begleitverträge wie Miete, Mobilfunk, Internet oder
Versicherungen. Außer dem Kalender gibt es keine fachlichen Verknüpfungen;
insbesondere keine Transportauftrags-, Fall-, To-do-, CRM- oder Stammdatenlinks.

## Stand und Bereitstellung

- Ausgangspunkt `e41e28b3656a613756241bf05f370b56cef4c8d9`.
- Zwischenzeitlich veröffentlichten Dev-Commit `28b901e` ohne Überschreiben
  übernommen. Zusammengeführter Frontendstand `5ec0363d4c158a5ac8f517cc83c9ebc02a5397ca`;
  [Vercel-Erfolg](https://vercel.com/cornerdesign-dominics-projects/bpldrehpunkt/2ohDBXoVTGkJ6AeNz5TVgGb5rKmS)
  und Live-Alias `https://dev.drehpunktlogistik.de` bestätigt.
- Abschließend den parallelen Maileinordnungs-/Rechnungsstand bis `35b3ae2`
  erhalten. Dessen bereits veröffentlichter Frontendquellstand ist identisch
  mit dem abschließend geprüften `src/`-Stand; die verbleibenden Ergänzungen
  betreffen PDF-Backend/Rules, Tests und den Abschlussbeleg. Zusammengeführte
  Diagnoseexports beider Veröffentlichungen bleiben erhalten.
- PDF-Korrektur im Fachstand `f640c6f`: Storage-Zugriff über Benutzerprofil und
  serververwalteten Status-/Größen-Slot in der Vertragswurzel.
- Firebase-Ziel ausschließlich `db-bpl-drehpunkt-dev`, Functions `europe-west3`:
  `mutateContract`, `listSystemCalendarSources`, `reportClientDiagnostic` und
  `listDiagnosticsPage` erfolgreich angelegt/aktualisiert. Firestore und Storage
  Rules separat erfolgreich veröffentlicht. Keine Index-, Secret- oder
  Benutzermigration und keine Änderung von Benutzerrechten.

Der erste gebündelte Firebase-Versuch scheiterte mit einem vorübergehenden
Rules-API-503; die Wiederholung war erfolgreich. Beim echten PDF-Test fiel
anschließend eine Produktionsgrenze des Storage-Regelwerks auf: drei statt
höchstens zwei unterschiedliche Firestore-Lookups. Die Emulatorprüfung allein
hatte diese Grenze nicht abgebildet. Bestehende Service-Agent-Berechtigung und
korrekt veröffentlichtes Regelwerk wurden bestätigt; es wurden dafür keine
IAM-Rechte erweitert.

Die Korrektur erhielt Elternexistenz, aktuelle Modulrechte, unveränderliche
Dateien und Statussperren. Sie wurde zuerst als Function bereitgestellt, nach
Auslaufen möglicher alter Aufrufe als Storage-Regelwerk. Eine eigene
Budgetregression sowie alte Reservierungs-/Verarbeitungsbelege ohne Manifest
sind nun explizit geprüft.

## Automatische Prüfung

- Projekt-Lint und Frontendbuild erfolgreich, auch nach Übernahme des aktuellen
  Dev-Zwischenstands. Es bleibt die bekannte Buildwarnung zu großen Chunks.
- Shared-Abgleich vor der parallelen Zusammenführung: 45 Module; danach alle
  46 deploybaren Module synchron. Abschließend 49 gezielte Vertrags-, Kalender-,
  Diagnose- und Sprach-/Navigationstests erfolgreich.
- Releaseprüfungen für Validierung, Fremdverknüpfungen, Kalenderrechte,
  Kalendernavigation, Diagnose, Beträge und Monatsanker erfolgreich.
- Nach PDF-Korrektur 18 echte Firestore-/Storage-/Transaktionsprüfungen im
  expliziten Demo-Projekt und sieben Validierungs-/Budgettests erfolgreich;
  zusätzlich gezielter Altzustand mit offener Finalisierung ohne Manifest.
- Erlaubte/verweigerte Rollen, inaktive/fehlende Profile, unveränderliche PDFs,
  Revisionskonflikte, Wiederholungen und beschädigte Eingaben geprüft.

## Echte Browserabnahme auf Dev

Vorhandene angemeldete Sitzung verwendet; keine Anmeldetokens oder Testkonten
erzeugt. Ausschließlich eigene synthetische Daten unter der Akte
`contracts/j9ihzIgFizRFUkoRl10Y` mit Namen
`DEV-Abnahme Begleitverträge 05.11.2026` verwendet.

- Anlage, Vertragsnummer `DEV-MOBIL-2026`, Kundennummer `DEV-K-005` gespeichert.
- Fünf Handypositionen zu jeweils 19,99 € brutto: Monatssumme 99,95 €.
  Bezugsdatum 31.01.2026 ergibt nächste Monatsfälligkeit 30.11.2026.
- Stift öffnet und speichert die richtige Position; testweise geänderter Betrag
  aktualisiert die Summe und wurde wieder zurückgesetzt. Mülleimer öffnet die
  passende Löschbestätigung; diese wurde ohne Löschung abgebrochen. Die
  bestätigte Löschwirkung ist durch Emulator-/lokale UI-Tests abgedeckt.
- Buttons enthalten Icons ohne Text, Tooltips und zugängliche Beschriftungen;
  gemessene Aktionsspalte 78,5 px, Buttonbreite 28 px.
- Kündigungsfrist am 15.12.2026 im Kalender **Vertragsmanagement** sichtbar.
  Datumslink öffnet Dezember; Kalenderereignis öffnet die konkrete Aktenfrist;
  Zurück stellt den betrachteten Kalendermonat wieder her.
- Als erledigt markierte Frist verschwindet aus dem Kalender; Wiederöffnen
  macht sie wieder sichtbar. Erfassungsdatum und Historie bleiben erhalten.
- Notiz gespeichert und nach Neuladen sichtbar.
- PDF-Reservierung nach anfänglichem Zugriffsfehler mit denselben Eingaben und
  Vorgangs-IDs fortgesetzt: genau ein fertiges Dokument, keine offene
  Dokumentverarbeitung. PDF nach Neuladen sichtbar, Download und Metadaten-
  Bearbeitung erfolgreich. Abschließend keine Browser-Konsolenfehler.
- Innerhalb der Akte keine Links zu anderen Fachmodulen außer dem Kalender.
  Unbekannte fachliche Verknüpfungsfelder werden serverseitig abgewiesen.

Echte Dev-Tests verwenden die vorhandene Fachsitzung; weitere Rollen wurden
im Emulator und die Nur-Lesen-Oberfläche lokal geprüft. Die Akte sendet keine
automatischen Erinnerungen oder Mails.

## Bereinigung und Rückkehr

Die erzeugte Test-PDF wurde identitäts- und generationsgebunden administrativ
entfernt. Anschließend wurde ausschließlich die bekannte eigene Testakte samt
Untercollections rekursiv in Dev gelöscht. Vertragsliste ohne Testakte und
Kalender ohne deren Frist im Browser bestätigt. Keine anderen Daten geändert.

Main/Produktion unverändert. Frontend kann auf den vorherigen Dev-Stand
zurückkehren; dies setzt weder Firestore-/Storage-Rules noch Functions zurück.
Neue Vertragsdaten und serverseitige Auditfelder sind bei Rücknahmen zu erhalten.
