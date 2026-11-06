# Statusauswertung und Antwortbezug – Dev 05.11.2026

Der Nutzer hat die Veröffentlichung des gesammelten aktuellen Stands auf Dev
beauftragt. Main/Produktion bleiben unverändert. Die Prod-Systemmailtexte werden
weder kopiert noch verändert. Basis: origin/dev 7676ad4, einschließlich der letzten
Vertrags-Storage-Korrektur; ergänzt durch lokale Pakete 0056ed6 und 7a196d4.

## Umfang

- Gerade/bereits angekommen ohne genaue Zeit: Mailzeit auf fünf Minuten abrunden,
  als angenäherte tatsächliche Ankunft vorschlagen.
- Kommt gleich: Mailzeit auf fünf Minuten aufrunden, plus 15 Minuten als ETA.
- Konkrete Antwort und nächste zitierte Frage haben Vorrang vor Verlaufsschätzung.
  Keine zusätzliche Speicherung des Fragetexts, keine Rekonstruktion über aktuelle
  Vorlagen-IDs. Mehrfachfragen, Verneinungen und widersprüchliche Bezüge abgesichert.
- Bestätigte Ankunft bleibt trotz ungenauer Uhrzeit für Fortschritt und weitere
  Schritte verwertbar. Nutzerbestätigung bleibt vor Übernahme hergeleiteter Werte.
- Antwort 80 auf eine eindeutige Kilometerfrage wird als prüfbare Reststrecke erkannt.
  Auch konservative Modellklassifikation verliert klar belegte kurze Antworten nicht.
- Herkunft und Näherung sichtbar im Statusdialog und in allen Trackinghistorien:
  Ereigniszeit, Maileingang und Übernahmezeit getrennt; Korrekturen nachvollziehbar.
- Keine präzise Pünktlichkeits-/Wartezeitbewertung aus Ersatzzeiten. Das gilt für
  Detail, Prognose und Auftragsliste. Status@ übernimmt hergeleitete Vorschläge
  weder automatisch als Zeitwert noch als Positionsereignis.

Bei der Releaseprüfung geschlossen: Listenprognose beachtet Zeitungenauigkeit;
Präzisionsänderung bei gleicher Uhrzeit löst Aktualisierung aus. Prognoseprojektionen
werden vollständig ersetzt, damit alte Zahlen/Näherungsflags nicht in neue Zustände
hineingemischt werden. Der Präzisionswechsel erzeugt keine Aktualisierungsschleife.

## Prüfung

Nach Zusammenführung und Releasekorrektur: 327 gezielte Unit-/Regressionstests,
15 echte Firestore-Emulatortests ohne Skip erfolgreich. Letztere umfassen
Hintergrundjobs, Antwortbezug, Datenherkunft, bestätigte Übernahme, keine automatische
Übernahme hergeleiteter Werte und den Wechsel von alter Zahlenprognose über
Näherungszustand zu wieder genauer Prognose bei unveränderter Ankunftsuhrzeit.
Explizites Demo-Projekt, keine Live-Testdaten.
Lint, Build, Functionssyntax und Shared-Abgleich (46 Module) erfolgreich.
Bestehende Bundlegrößenwarnung unverändert. Frühere lokale Browserprüfung des
Dialog-/Historienpakets verwendet synthetische Daten; sie ersetzt keine Fachabnahme
mit echten neuen Antwortmails. Diese übernimmt der Nutzer nach Veröffentlichung.

## Bereitstellung

Firebase-Ziel ausschließlich db-bpl-drehpunkt-dev, Region europe-west3.
Benötigte Funktionen werden gemeinsam aus demselben Quellpaket aktualisiert:

- processMailboxActionRun
- previewMailboxTracking
- applyMailboxTracking
- processStatusMailAiOnCreate
- retryStatusMailAi
- updateManualShipmentTracking
- getShipmentTrackingForecast
- getShipmentTrackingAttention
- refreshShipmentTrackingForecast
- refreshShipmentTrackingForecastOnUpdate
- refreshShipmentTrackingAttentionOnMail
- listTransportOrdersPage

Keine neuen Rules, Indizes, Secrets, Berechtigungen oder Migrationen für dieses Paket.
Die bereits separat auf Dev veröffentlichten Vertrags-Storage-Regeln bleiben erhalten;
kein Rules-Deploy in diesem Release. Frontend über dev/Vercel nach Backendbereitstellung.

Main-Referenz vor Veröffentlichung: a4b274d09399bdfdbdb298e3b09b5842fcf01c71.
Aktive Revisionen, Quellpaket und Frontendstatus werden nach Bereitstellung geprüft.


## Aktive Backendbereitstellung

Am 05.11.2026 erfolgreich ausschließlich auf db-bpl-drehpunkt-dev bereitgestellt.
Anschließende Cloud-Abfrage: alle zwölf Exporte ACTIVE und identische
Quellpaket-Prüfsumme 7VtW6SMyedxc+EbuYX7Sfg==. Codebasis f460b6d.

| Export | Aktive Revision |
| --- | --- |
| processMailboxActionRun | processmailboxactionrun-00020-boy |
| previewMailboxTracking | previewmailboxtracking-00005-duy |
| applyMailboxTracking | applymailboxtracking-00007-kug |
| processStatusMailAiOnCreate | processstatusmailaioncreate-00015-yuh |
| retryStatusMailAi | retrystatusmailai-00014-tar |
| updateManualShipmentTracking | updatemanualshipmenttracking-00018-kev |
| getShipmentTrackingForecast | getshipmenttrackingforecast-00008-pih |
| getShipmentTrackingAttention | getshipmenttrackingattention-00007-qas |
| refreshShipmentTrackingForecast | refreshshipmenttrackingforecast-00007-veg |
| refreshShipmentTrackingForecastOnUpdate | refreshshipmenttrackingforecastonupdate-00007-zaf |
| refreshShipmentTrackingAttentionOnMail | refreshshipmenttrackingattentiononmail-00005-dax |
| listTransportOrdersPage | listtransportorderspage-00022-fex |

Der Frontendstand wird über dev/Vercel bereitgestellt; dessen erfolgreicher Build
und die angemeldete Kontrolle von Postfach/Sendungsverfolgung sind zusätzliche
Abschlusskriterien. Neue echte Antwortmails bleiben Gegenstand der Nutzerabnahme.
Keine echten Testmails versendet, keine vorhandenen Statuszeiten zu Testzwecken
geändert. Keine nachträgliche automatische Auswertung alter Mails gestartet.


## Frontend und Livekontrolle

Frontendcommit c31c5aa94684d53aa20d3edcead40ebebbac1f70 erfolgreich nach dev
gepusht. Vercel meldet success:
[Deployment](https://vercel.com/cornerdesign-dominics-projects/bpldrehpunkt/2c2v7wvnM1nmiHFP1ik4TqskCBjq).
Die angemeldete Dev-Sitzung lädt den veröffentlichten Stand unter
https://dev.drehpunktlogistik.de. Postfach samt vorhandenen Aktionen sowie die
Sendungsverfolgung mit Filtern und real geladenen Auftragsdaten geprüft; keine
Browser-Konsolenfehler. Es wurden keine Statuszeiten übernommen/geändert und
keine neuen KI-Läufe auf vorhandenen Mails gestartet. Der fachliche Test der
neuen Herleitungen mit echten Antwortmails bleibt die angekündigte Nutzerabnahme.

Main nach Veröffentlichung weiterhin a4b274d09399bdfdbdb298e3b09b5842fcf01c71.
Dieser Nachtrag dokumentiert ausschließlich die Abnahme; keine weitere
Laufzeitcodeänderung gegenüber dem geprüften Frontendcommit.
