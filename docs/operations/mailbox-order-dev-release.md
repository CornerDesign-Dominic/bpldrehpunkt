# Dev-Testrelease: Auftragserfassung und Stammdatenabruf

Freigabe: 29.10.2026, ausdrücklich durch den Nutzer ausschließlich für Dev.
Projekt: **db-bpl-drehpunkt-dev**, Oberfläche: **dev.drehpunktlogistik.de**.
Produktion und `main` sind nicht Teil dieses Releases.

## Umfang und Herkunft

- Postfachaktion „Auftrag hinzufügen“: Mail/PDF-Auswertung, KI-Prüfformular,
  bestätigter XML-Download mit unverändertem Original-PDF und Firmenwährung EUR.
- Kunden-/UTN-Abruf aus dem separat fertiggestellten Power-Automate-Flow,
  einschließlich Ergänzungen bestehender Partner, Konflikten und Historie.
- Kontobezogene Adress-ID für XML verwenden; Rollen-/Nummernzuordnung und
  Quellreferenzen bleiben bei Zusammenführen/Trennen zusammen. Widersprüche
  blockieren statt eine ID aus einer Kundennummer abzuleiten.
- Vorhandene Dev-Ansichten, Auftrags-/Stammdatenhistorie, Sendungsverfolgung
  und inzwischen veröffentlichte Qualitätsänderungen bleiben erhalten.

Der isolierte Release-Checkout wurde ab `origin/dev` aufgebaut. Er übernimmt
den fertigen Stammdatenstand aus `dycos-dev-release` und ausschließlich die
zugehörigen Auftragserfassungsänderungen aus dem ursprünglichen Arbeitsordner.
Andere offene Kalender-/Fall-/Partnernavigation-Änderungen sind ausgeschlossen.
Codevorbereitung: `b450335`, danach Merge des aktuellen Dev-Stands einschließlich
`5625fb0`. Der vorherige Dev-Frontendstand ist `5625fb0`; die Produktionsbaseline
bleibt Deployment `dpl_H6NVNYTMRuunkCJwUQAvBCm1QzXW`, Git
`230c2ad86af9700118e2f1456746292241461efc`.

## Backend und Konfiguration

Das neue Secret `DYCOS_MASTER_DATA_FLOW_URL` wurde ausschließlich im
Dev-Projekt als Version 1 eingerichtet. Die fünf vorhandenen
Zertifikats-/Identitätssecrets werden wiederverwendet. `DYCOS_FLOW_URL` für
Transportaufträge bleibt unverändert. Keine Änderung an Microsoft/Power Automate.
`MAILBOX_ORDER_COMPANY_CURRENCY=EUR` ist im ignorierten Dev-Parametersatz explizit
gesetzt; der Wert wurde vom Nutzer bestätigt.

Am 29.10.2026 erfolgreich gemeinsam nach Dev bereitgestellt:

`previewMailboxOrder`, `exportMailboxOrder`, `fetchDycosMasterData`,
`cleanupMailboxConnections`, `fetchDycosTransportOrder`, `listDiagnosticsPage`,
`reportClientDiagnostic`, `mergeCustomerImportPartners`, `mergeCarrierImportPartners`,
`prepareManualPartnerMerge`, `mergeManualPartners`, `previewPartnerMergeReversal`,
`separatePartnerMerge` sowie die schmal erweiterten Firestore-Rules.

Die Rules schützen ausschließlich die für den XML-Export relevanten
Partner-Quellidentitäten vor direkten Browseränderungen; private Vorschauen,
Quoten und Exportbelege bleiben durch Default-deny serverseitig.
Es sind keine neuen Indizes oder Storage-Pfade erforderlich.

## Prüfstand

- Vollständiger Lint und Build sowie Shared-Abgleich und Functions-Syntax
  erfolgreich; bekannte Build-Chunkgrößenwarnung bleibt.
- 53 fokussierte Unit-Prüfungen erfolgreich.
- Gemeinsamer Firestore-Emulatorlauf: 37 Abruf-/Speicher-/Historien-/Rules-
  Prüfungen erfolgreich, keine übersprungen.
- Weitere neun Partner-Merge-/Trennungsprüfungen erfolgreich. Die ursprüngliche
  Testdatenkollision zwischen zwei Szenarien wurde durch getrennte Demo-Projekte
  beseitigt; die Fachprüfung auf doppelte Nummern war korrekt.
- Zwei echte lesende Abrufe mit der Release-Anbindung (Kunde und UTN) erfolgreich,
  ohne Firestore-Schreibzugriff. Ein UTN-Kontaktformat wird ausdrücklich als
  Prüfhinweis gemeldet; keine stillen Datenersatzwerte.
- Auftragserfassungs-Komponente zuvor mit synthetischen Daten in DE/EN,
  Light/Dark, Pflichtfeldkorrektur, Quellen/PDF, XML-Download und Beibehaltung
  von Eingaben geprüft. XML mit unabhängigem Parser und bytegleichem PDF geprüft.

Der angemeldete Live-Browsercheck ist offen: Die automatische Computer-Use-
Sicherheitsprüfung konnte die aktuelle Chrome-URL nicht verlässlich bestimmen
und hat den Zugriff gestoppt. Es wurden keine Konten oder Anmeldetokens als
Umgehung erzeugt. Echte persönliche Mail-/Scan-Auswertung und DyCoS-Import der
XML bleiben fachliche Benutzerabnahme; kein echter Mailversand zur technischen
Kontrolle.

## Rückkehr

Ein Frontend-Rollback kann auf den vorherigen Dev-Stand erfolgen. Neue
Backendexporte können dabei bestehen bleiben, solange alte Clients sie nicht
aufrufen. Eine vollständige Rücknahme erfordert separate Prüfung von Functions,
Rules und inzwischen angelegten Partnerdaten. Ein Vercel-Rollback setzt keine
Firestore-Daten oder Regeln zurück. Secrets werden nicht ungeprüft gelöscht.

## Live-Nachweise

Alle 13 oben genannten Function-Operationen und die Rules wurden von Firebase
als erfolgreich abgeschlossen bestätigt. Die neuen Funktionen sind `ACTIVE`
in `europe-west3`; die Stammdatenfunktion bindet das neue URL-Secret in Version 1
und die fünf bestehenden Anmeldesecrets. Die TA-Funktion bindet weiterhin
`DYCOS_FLOW_URL`. Anonyme Aufrufe aller drei neuen Funktionen liefern HTTP 401;
CORS bestätigt ausschließlich die geprüfte Dev-Origin im Test.

Das Frontend wird mit einem gemeinsamen Push des Releasebranches nach `dev`
veröffentlicht. Der vollständige Commit wird anschließend gegen den Vercel-
Deploy der Dev-Domain geprüft; die Produktionsbaseline wird dabei erneut
verglichen. Es wird kein zweiter Frontend-Push allein für Statusprotokolle erzeugt.
