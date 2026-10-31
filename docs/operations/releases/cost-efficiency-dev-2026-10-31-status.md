# Kostenoptimierungen: Dev-Veröffentlichung am 31.10.2026

Der Nutzer hat die schrittweise Veröffentlichung einschließlich Datenaufbau
und anschließender Abnahme ausdrücklich freigegeben. Ziel ausschließlich
`db-bpl-drehpunkt-dev`, Region `europe-west3`, Webadresse
`https://dev.drehpunktlogistik.de`. Produktion und `main` wurden nicht geändert.

Backendquelle: `1379bf30c95d297fe31f91cdbec3b727ae75bad3`, auf Dev-Basis
`5e9586145b2df0c939d10fa455f699653e1f40ba`. Der abschließende Frontendstand
ergänzt die unten beschriebene Diagnosekorrektur. Der ursprüngliche Desktop-
Arbeitsstand wurde nicht in diesen Release übernommen oder überschrieben.
Umfang und Haltepunkte stehen im [Releaseplan](../cost-efficiency-dev-release.md)
und [Manifest](cost-efficiency-dev-2026-10-31.json).

## Bereitgestellt und tatsächlich kontrolliert

- **Indizes:** Alle 71 Composites und die drei konfigurierten Indexrichtungen
  für `deadlines.date` stehen auf `READY`. Gegenüber den elf zuvor vorhandenen
  Dev-Composites wurden 60 ergänzt; gegenüber der Codebasis sind es 59 neue,
  weil ein bereits deklarierter Index in Dev noch fehlte. Keine fremden
  Live-Indizes wurden gelöscht.
- **Functions:** Alle 34 Manifestfunctions wurden gestuft bereitgestellt und
  sind aktiv. Insgesamt sind 170 aktive Endpunkte vorhanden. Alle 136 nicht
  zum Release gehörenden Function-Revisionen sind unverändert. Die bestehenden
  Secret-Bindungen einschließlich Versionsnummern blieben erhalten. Die vier
  vorhandenen Postfach-Konfigurationsparameter wurden aus den laufenden
  Dev-Functions übernommen; keine Secretwerte wurden gelesen oder versioniert.
- **Reihenfolgekorrektur im Vorabreview:** `separatePartnerMerge` wurde vor den
  Palettenaufbau gezogen. So schützt bereits die neue Serverrevision gegen
  parallele Legacy-Referenzumschreibungen; Client-Rules allein reichen dort nicht.
- **Rules:** Die aktive Firestore-Rulesetquelle wurde nach Bereitstellung mit
  dem Kandidaten verglichen und stimmt überein. Direkte Palettenwrites sind
  gesperrt. Storage wurde nicht bereitgestellt oder verändert.
- **Daten:** Die drei Hintergrundaufbauten sind vollständig. 64 Aufträge wurden
  für Tracking und Liste vorbereitet; der Fristenquellenaufbau fand aktuell
  keine Fristdokumente. Palettenstatus: `version: 1`, `status: ready`, gültige
  Generation, `tourCoverage: true`. Diese Werte wurden nicht von Hand gesetzt.
- **Bestandsabgleich:** Alle 42 Root-Partnerkonten wurden gegen die
  historische Quellberechnung verglichen, einschließlich Saldo, Zu-/Abgängen
  und letztem Abschluss. Alle 64 Auftragsprojektionen und vier Relationszähler
  stimmen mit den Quellen überein. Nach Bereinigung der Testdaten wurde dieser
  vollständige Abgleich erneut erfolgreich ausgeführt.
- **Queue:** Tatsächliche Cloud-Tasks-Zustellung an den authentifizierten
  Worker erfolgreich, HTTP 204, keine Workerfehler. Queue läuft mit einer
  gleichzeitigen Task und zehn Versuchen; Worker ist nicht öffentlich.
  Vorhandene IAM-Rechte waren ausreichend, es wurden keine pauschalen
  zusätzlichen Owner-/Editor-Rechte vergeben. Die bereits vorhandene breite
  Runtime-Editorrolle wurde in diesem abgegrenzten Release nicht verändert.
- **Frontend:** Dev-Branch und dessen Vercel-Deployment wurden bereitgestellt;
  die Dev-Domain zeigte für die fachliche Abnahme auf Commit `1379bf3` im
  Zustand `READY`. Der abschließende Push umfasst die geprüfte
  Diagnoseverfeinerung und diesen Beleg. Produktionsbranch blieb `main`;
  Produktionsdeployment `dpl_H6NVNYTMRuunkCJwUQAvBCm1QzXW` blieb unverändert.

Vorherige Dev-Function-Revisionen, Rules und Vercel-Zuordnung wurden für den
Rückweg lokal gesichert. Die Datenaufbereitung nutzte die vorhandene
IAM-berechtigte Deployment-Anmeldung und dieselben begrenzten Transaktionskerne,
ohne eine Anwendungsidentität zu imitieren. Die öffentliche Aufbau-Callable
behält ihre aktive Superadmin-Prüfung und App Check. Tokens/Schlüssel wurden
weder ausgegeben noch als neue Zugangsdaten gespeichert.

## Abnahme und Korrektur

Automatisch: 811 Unit-/Vertragstests bestanden, Lint, Build und 42 Shared-Module
konsistent. Der frühere vollständige Emulatornachweis umfasst 117 verschiedene
Prüfungen; seine Isolationskorrektur ist im
[lokalen Prüfbeleg](../cost-efficiency-dev-verification.md) transparent beschrieben.
Nach Extraktion des Paletten-Aufbaukerns wurden zusätzlich die sechs zugehörigen
Unitprüfungen, drei echten Paletten-Emulatorabläufe und die Legacy-Trennprüfung
gemeinsam erfolgreich ausgeführt (zehn Prüfungen, keine übersprungen).

Im echten angemeldeten Dev-Browser geprüft:

- Palettenübersicht und Detailseite mit vorhandenen Salden; Anlegen und Ändern
  einer isolierten Testbewegung sowie ein Kontoabschluss. Zwei geöffnete
  Formulare derselben Identität: erster Write erfolgreich, veralteter zweiter
  Write mit HTTP 409 verweigert; dessen eingegebene Menge und Bemerkung bleiben
  im Formular erhalten. Keine fremde Buchung wurde dafür verändert.
- Auftragsliste: Suche, zweite Ergebnisseite, Relation und Datumsbereich
  gemeinsam, Rücksetzen auf die vorherigen persönlichen Filter. Auftrag über
  seine sichtbare Nummer geöffnet, Tracking-/Palettenbereiche und die
  Partnerverknüpfung geprüft. Monatsfilter lieferte 15 passende Aufträge.
- Kalender: Monat wechseln/nachladen, alle sechs Kalender abwählen, neu laden
  und weiterhin keine Kalender ausgewählt vorfinden. Ursprüngliche Auswahl
  wurde wiederhergestellt. Die reale Anzeige der nächsten Termine war leer;
  die Zehn-Termine-Auswahl ist durch die automatisierten Datenfälle abgesichert.
- Gezielte CRM-Partnerseite mit Bewertungen, Kontakt/Notizen und Partnerhistorie
  sowie To-do- und Qualitätsansichten geladen. Keine bezahlte KI-/OCR-Auswertung,
  Routen-Neuberechnung oder echte Mail wurde zum Test ausgelöst.
- Vier unangemeldete Live-Aufrufe der neuen geschützten Callables wurden mit
  HTTP 401 abgewiesen. Weitere Rollen-/Rules-Fälle sind im Emulator geprüft.

Im Paralleltest fiel eine **Diagnoseklassifizierung** auf: Der erwartete
Revisionskonflikt wurde zusätzlich unter `pallets/save/unknown` protokolliert.
Bestätigte Ablehnungen beim Speichern verwenden nun dieselbe Fehlerklassifikation
wie der sichere Wiederholungsweg und erzeugen keinen technischen Fehlerbericht.
Technische und unklare Fehler bleiben meldepflichtig; Fehlertext, Konfliktschutz
und Erhalt der Eingaben bleiben unverändert. Die Klassifikation ist gezielt
getestet. Der einmalige historische Test-Diagnoseeintrag wurde nicht gelöscht.

Der alte Fristenscheduler meldete bis 16:14 UTC Indexfehler der alten Revision
`scheduledcasedeadlinereminderdispatch-00005-faq` (`FAILED_PRECONDITION`, Index
noch im Aufbau). 20 ERROR-Logeinträge entsprechen zehn fehlgeschlagenen
Ausführungen. Der finale Backendwechsel war um 16:21:32 UTC vollständig.
Die anschließende Prüfung aller 34 betroffenen Dienste fand **keine ERROR-Logs
nach diesem Wechsel**. Der Beobachtungszeitraum ist begrenzt und ersetzt keine
laufende Betriebsbeobachtung.

Das ausschließlich für diese Abnahme angelegte Testpartnerkonto, seine eine
Bewegung und sein Abschluss wurden aus den aktiven Fachcollections bereinigt;
danach wurde eine neue vollständige Summengeneration aufgebaut. Es verbleiben
wieder die drei ursprünglichen Bewegungen und keine Abschlüsse. Technische
Wiederholungsbelege und alte Summengenerationen bleiben gemäß bestehendem
Vertrag erhalten. Das sind keine aktiven Testbuchungen.

## Prüfgrenzen und nächste Beobachtung

- Kein realer externer Versand, keine bezahlte Modellanfrage und kein echter
  Provider-Timeout; diese Fälle wurden mit synthetischen Abhängigkeiten geprüft.
  Die abgelaufene KI-Reservierung wurde nicht zusätzlich im echten Browser an
  einer produktiv wirkenden Mail durchgespielt.
- Keine vollständige Live-Rollenmatrix mit mehreren verschiedenen Identitäten
  und kein vollständiger Durchgang aller Dialoge in beiden Sprachen/Farbmodi.
  Zwei parallele Formulare sind kein Test zweier verschiedener Nutzerkonten.
- Bei 64 Aufträgen genügte in Dev je eine Hintergrundseite. Große Bestände,
  Unterbrechung und echte mehrseitige Fortsetzung sind lokal im Emulator geprüft;
  die echte Queue-Zustellung ist zusätzlich in Dev belegt.
- Tatsächliche Einsparung erst bei vergleichbarer Nutzung anhand von Reads,
  Laufzeiten und Rechnung bewerten. Teilstringsuche, dynamische Trackingfilter
  und sehr breite Zeiträume bleiben mögliche teure Pfade.

`main` blieb bei `230c2ad86af9700118e2f1456746292241461efc`. Keine
Produktions-Functions, Produktions-Rules, Produktionsdaten oder
Produktionsbereitstellung wurden im Rahmen dieses Releases verändert.
