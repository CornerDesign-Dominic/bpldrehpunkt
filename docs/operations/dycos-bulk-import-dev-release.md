# Dev-Veröffentlichung: Sammelimport und zentrale Stammdatenübernahme

## Persönlicher Stammdatenimportverlauf (Dev-Freigabe 02.11.2026)

Direkt unter dem Einzelabruf steht ein eigener Verlauf mit Zeitpunkt, Benutzer,
Debitoren-/Kreditornummer und Ergebnis sowie einem Link zum Stammdatenblatt.
Er erfasst neue, ergänzte und unveränderte Übernahmen sowie fehlgeschlagene
Abrufe. Wiederholungen mit derselben Anfrage-ID aktualisieren denselben Eintrag.
Abgelaufene Abrufe erscheinen als unterbrochen. Die letzten 25 Einträge werden
einmalig geladen, weitere 25 erst mit „Mehr anzeigen“. Es gibt kein Polling.
Nach einem Abruf wird die erste Seite aktualisiert; der vorhandene Bereich für
frühere CSV-Prüfungen und -Verläufe bleibt erhalten.

Die Zuordnung zu einer Person beginnt mit dieser Erweiterung. Alte Abrufbelege
enthalten keine zuverlässige Benutzerzuordnung und werden nicht nachträglich
zugeordnet. Die bisherigen Partner-Änderungshistorien bleiben erhalten.

Für die Veröffentlichung sind `fetchDycosMasterData` und die neue Callable
`listDycosMasterDataImports` zusammen mit dem Frontend bereitzustellen. Rules,
Indizes und Power-Automate-Flows benötigen keine Änderung. Die Historie wird
atomar mit einer erfolgreichen Übernahme gespeichert; Fehler verändern keine
Partnerdaten. Zugriff wie beim Import mit `masterData: edit`, ausschließlich
auf den eigenen Verlauf, ohne zusätzliche Datenimportrechte.

## Partnerliste und separater Import-Tab (Dev, 01.11.2026)

Die Partnerliste bietet oben rechts nur „Stammdaten importieren“. Der Link
öffnet `/kunden-unternehmer/import` in einem neuen Tab. Der direkte Abruf und
„Geschäftspartner anlegen“ entfallen auf der Liste. Im Import-Tab werden Kunde
oder Unternehmer und die jeweilige Kontonummer angegeben. Nach erfolgreicher
Übernahme wird das Nummernfeld geleert; Ergebnis und Stammdatenblatt-Link bleiben
sichtbar. Der Tab kann während des Abrufs im Hintergrund geöffnet bleiben.

Für den Einzelabruf reichen weiterhin Stammdaten-Bearbeitungsrechte wie beim
bisherigen direkten Abruf. Frühere CSV-Prüfungen und -Verläufe benötigen zusätzlich
Datenimport-Bearbeitungsrechte. Bestehende Daten-, Konflikt- und Historieregeln
bleiben unverändert; keine Änderung am Flow oder an Serverfunktionen erforderlich.

Freigabe am 30.10.2026 durch den Nutzer ausschließlich für Dev. Zielprojekt:
`db-bpl-drehpunkt-dev`; Oberfläche: `https://dev.drehpunktlogistik.de`.
Main-Baseline: `230c2ad86af9700118e2f1456746292241461efc`.
Vorheriger Dev-Stand: `ed31c8ec47dee9c7974a299c2c41996e11405474`
(einschließlich der zuletzt parallel veröffentlichten Handbuch-Erweiterung).

## Umfang

- Auftragsimport: Ladedatum von/bis, optionale Relation, kompakte Vorschau,
  Auswahl mit Checkboxen und seitenübergreifendem Alle-Markieren, anschließender
  vollständiger Abruf ausschließlich ausgewählter Aufträge. Fortschritt,
  Einzelfehler, Pause und Fortsetzung mit festen Anfrage-IDs.
- Serverseitige Jahresgrenze ab Januar 2026, einschließlich späterer Jahre.
  Ohne Ladedatum gilt ein gültiger TA-Jahres-/Monatspräfix ab 2601 als Ersatz.
- Stammdatenimport: Debitoren-/Kreditorennummer und Partnerart ausschließlich
  unter „Stammdaten importieren“. CSV-Upload entfällt dort und beim
  Auftragsimport. Bestehende Prüfungen und Importverläufe bleiben verfügbar.
- Bestehende Daten nur ergänzen; abweichende manuelle Werte und Kreditlimit
  erhalten. Bestehende sichere Konten-/Quellzuordnung und Historie verwenden.
- Aktuellen Dev-Stand einschließlich Postfachänderungen und strengerer
  Partner-Merge-/Trennungsprüfung aus dem anderen Chat erhalten.

## Bereitstellung

Das neue Secret `DYCOS_ORDER_SEARCH_FLOW_URL` wird ausschließlich in Dev als
Version 1 hinterlegt. Der Wert stammt aus der geschützten lokalen URL-Datei;
keine URL oder Anmeldedaten im Repository oder Frontend. Die bestehende
Zertifikatsanmeldung wird wiederverwendet.

Gezielte Function-Bereitstellung: `searchDycosTransportOrders`,
`fetchDycosTransportOrder`, `importTransportOrders`. Der Stammdatenabruf
`fetchDycosMasterData` einschließlich `DYCOS_MASTER_DATA_FLOW_URL` sowie
Diagnose und Partner-Merge-Endpunkte wurden bereits im gemeinsamen vorherigen
Dev-Release bereitgestellt und sind aktiv. Deren aktueller Code wird beim
Zusammenführen erhalten; siehe `mailbox-order-dev-release.md`.

Keine neuen Rules, Indizes oder Microsoft-Berechtigungen in diesem Release.
Der Such-Flow mit Relationskatalog ist bereits veröffentlicht und lesend
geprüft. Lokaler Dev-Parametersatz enthält die bereits vereinbarte Firmenwährung
EUR für die gemeinsame Functions-Quellanalyse.

Firebase hat die Erstellung von `searchDycosTransportOrders` sowie die Updates
von `fetchDycosTransportOrder` und `importTransportOrders` erfolgreich bestätigt.
Die neue Suchadresse liegt als aktivierte Secret-Version 1 vor. Die bestehende
aktive Stammdatenfunktion bindet das separate Stammdaten-URL-Secret und die
fünf erforderlichen Anmeldesecrets. Das Frontend wird danach einmal gemeinsam
über den freigegebenen Branch `dev` veröffentlicht; kein Push nach Main.

## Prüfungen

Nach Zusammenführung: 61 gezielte Modultests und 37 Firestore-Emulatortests
erfolgreich, keine übersprungen. Darunter Partnerabruf, Gegenreferenzzuordnung,
Erhalt manueller Daten, Historie, Merge-Identitäten, Suchvorschau, Jahresgrenze,
Rechteentzug, Quoten und Wiederholungen. ESLint, Build und Shared-Abgleich
erfolgreich (39 deploybare Module). Bekannte Build-Chunkgrößenwarnung bleibt.

Vorheriger Oberflächencheck mit synthetischen Daten und echte lesende
Power-Automate-Prüfungen sind in Abschnitt 33 der Schnittstellenplanung
dokumentiert. Der angemeldete Dev-Browsercheck folgt nach dem erfolgreichen
Vercel-Build; dessen Umfang wird im Abschlussfeedback benannt. Keine privaten
Anmeldetokens für einen Ersatztest erzeugen.

## Rückkehr

Ein Frontend-Rollback kann zum oben genannten vorherigen Dev-Stand erfolgen.
Die neue Suchfunktion und das Secret können bei einem Frontend-Rollback
zunächst bestehen bleiben. Eine Rücknahme der Jahresgrenze erfordert eine
gezielte Function-Rücknahme. Bereits gespeicherte Daten und Historien werden
durch einen Frontend-Rollback nicht zurückgesetzt. Main bleibt unberührt.
