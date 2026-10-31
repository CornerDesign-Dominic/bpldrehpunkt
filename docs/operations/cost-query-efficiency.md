# Kosteneffiziente Listen, Kalender und Partnerabfragen

Stand: 31.10.2026. Beschreibt den lokalen Implementierungsstand. Keine Aussage
über bereits veröffentlichte Functions, aktive Indizes oder abgeschlossene
Initialisierung in Dev/Produktion. Veröffentlichung nach [Releaseweg](releases.md).

## Transportauftragsliste

Die Liste behält globale Sortierung, Cursorseiten, Teilstringsuche und die
bestehenden Tracking-/Hinweisfilter bei. Auftragsbezogene Filter werden vor dem
Laden der separaten Trackingdokumente ausgewertet. Damit benötigen verworfene
Suchtreffer keine zusätzlichen Trackinglesungen mehr. Teilstringsuche und
dynamisch berechnete Tracking-/Hinweisfilter können weiterhin mehrere
Auftragsseiten durchsuchen; eine kleine Ergebnisseite bedeutet dort nicht
automatisch eine kleine Anzahl Datenbanklesungen.

`transportOrders.listQuery` enthält `version: 2`, die getrimmte Relation, das
Ladedatum als Kalenderdatum und den Lade-Monat. Die Datumszuordnung entspricht der bisherigen
Listenlogik: bei Strings die ersten zehn Zeichen, bei historischen Firestore-
Zeitstempeln das UTC-Kalenderdatum. Der aktuelle DyCoS-Import schreibt die Projektion
atomar mit den Importdaten. Der gemeinsame Auftrags-Trigger repariert historische
oder serverseitig geänderte Dokumente; reine Änderungen der Projektion lösen
keine erneute fachliche Hintergrundverarbeitung aus.

Erst wenn `backgroundWorkState/transport-order-list-v3.complete == true` ist,
werden Relation und Lade-Monate als tatsächliche Firestore-Filter ausgeführt.
Für geschlossene Datumsbereiche mit höchstens 29 Monaten verwendet die Abfrage
einen `in`-Filter auf `listQuery.loadingMonth`, ergänzt um den Wert `legacy`
für historisch ungewöhnliche Datumsstrings. Die genaue Tagesgrenze wird vor dem
Trackingabruf zusätzlich anhand des ursprünglichen Datums geprüft. So bleiben
auch alte lexikalisch passende Datumswerte enthalten. Gleichheits-/`in`-Filter
erhalten die bisherige globale Sortierung; eine Firestore-Bereichsabfrage auf
einem anderen Feld als dem ersten Sortierfeld wird vermieden. Offene oder
größere Zeiträume verwenden weiterhin den exakten lokalen Datumsfilter vor dem
Trackingabruf. Das ist ein verbleibender Kostenpfad.
Bis zur vollständigen v3-Abdeckung bleibt der bisherige Suchpfad aktiv;
fehlende Projektionen dürfen historische Treffer nicht verschwinden lassen.
Die Initialisierung ist in den begrenzten, fortsetzbaren Hintergrundaufbau
integriert. Der Zustand ist keine Benutzerkonfiguration und darf nicht vorzeitig
auf vollständig gesetzt werden. Neue Server-Schreibwege für Relation oder
Ladefenster müssen die Projektion ebenfalls atomar pflegen.

Die Relationsauswahl liest nach demselben v3-Abdeckungsnachweis ausschließlich
`transportOrderRelationCatalog`: einen Eintrag je unterschiedlicher Relation
mit der Anzahl zugehöriger Aufträge. `transportOrderRelationMembers` hält den
zuletzt verrechneten Relationsbezug je Auftrag. Der Projektionsrefresh liest
den aktuellen Auftrag und den Beleg in einer Transaktion; Änderungen und
Löschungen korrigieren alte/neue Relationszähler genau einmal. Doppelte,
verspätete und parallele Trigger können die Zähler nicht erneut erhöhen.
Die Transaktion liest Auftrag, eigenen Beleg und anschließend nach stabiler
Dokument-ID sortierte Relationszähler nacheinander. Diese feste
Sperrreihenfolge verhindert konkurrierende mehrteilige Streaming-Lesevorgänge
mit unterschiedlichen Sperrreihenfolgen. Gegenläufige Relationswechsel und
doppelte Aufrufe werden im echten Emulator geprüft; Fehler werden nicht durch
eine pauschale zusätzliche Retryhülle verschluckt.
Relationen ohne verbleibenden Auftrag werden entfernt. Beide Collections sind
interne Serverdaten ohne direkte Browserrechte. Bis v3 vollständig ist, bleibt
die Relationsauswahl ausdrücklich im Legacy-Lesepfad. Ein alter vollständiger
v1- oder v2-Projektionszustand aktiviert die neue Abfragegeneration nicht vorzeitig.

Die Composite-Indizes decken Relation, Lade-Monat und deren Kombination für
die unterstützten Sortierfelder ab. Zusätzliche Indexeinträge verursachen
Speicher- und Schreibaufwand; sie ersetzen die Vollscans dieser Filter nach der
Initialisierung. Dynamische Hinweisfilter und Teilstringsuche können weiterhin
Kandidaten über mehrere Datenbankseiten prüfen.

## Kalender

Die Kalenderansicht lädt Daten für den sichtbaren Monat einschließlich jeweils
eines Monats Puffer davor und danach. Monats-/Jahreswechsel laden den passenden
Bereich nach. Nur ausgewählte Kalender liefern Ereignisdaten; die Liste
verfügbarer Kalender bleibt vollständig. Verspätete Antworten verworfener
Ladeanforderungen ersetzen nicht den inzwischen gewählten Bereich.
Auch das Nachladen nach erfolgreichem Speichern oder Löschen verwendet diesen
abgesicherten aktuellen Ladeablauf. Eine verspätete Speicherung darf keine
zwischenzeitlich gewählten Monate oder Kalender mit alten Bereichsdaten
überschreiben. Eine bewusst leere Kalenderauswahl wird gespeichert und bleibt
beim nächsten Besuch leer. Fehlende oder fehlerhafte Browserpräferenzen
verhindern das Laden nicht. Bei einem Ladefehler zeigt auch die Spalte der
nächsten Termine den Fehler an, statt einen früher geladenen Stand als aktuell
darzustellen.

Normale Kalenderereignisse werden über die Überschneidung von `startDate` und
`endDate` abgefragt; lange, vor dem Bereich begonnene Termine bleiben enthalten.
Persönliche To-do-Kalendereinträge werden zusätzlich nach Eigentümer gefiltert.
Die gesonderte Zukunftsabfrage verwendet zusätzlich `startDate >= ''` als
breite Stringgrenze. Damit ist das erste Sortierfeld `startDate` selbst ein
Bereichsfilter, während `endDate >= heute` weiterhin bereits laufende Termine
erhält. Die bestehende Sortierung nach Beginn wird nicht durch eine Sortierung
nach Terminende ersetzt.

Systemkalender verwenden `listSystemCalendarSources`. Die Function prüft aktives
Profil, erlaubte Systemkalender, jeweilige Fachrechte und gültigen Zeitraum.
App Check wird an der Callable erzwungen. Datumsabfragen auf Fristen erfolgen
serverseitig über die Collection Group `deadlines`; nur exakte Pfade unter den
ausgewählten Fall-Collections werden weiterverarbeitet. To-dos und private oder
anders verschachtelte Fristen werden nicht ausgeliefert. Benötigte Elternfälle
werden zusammengefasst geladen. Historische Insolvenzarchive und
zusammengeführte Insolvenzfälle bleiben ausgeblendet. Die Antwort enthält nur
die für Kalenderdarstellung und Navigation benötigten Fall-/Fristenfelder,
keine Empfängeradresse oder sonstigen vollständigen Fachdokumente.

Die bisherige Spalte „Nächste Termine“ bleibt unabhängig vom gewählten Monat.
Dafür werden die nächsten Ereignisse separat abgefragt, einschließlich weit
entfernter Termine. Gleichdatierte Fristenseiten werden bis zum Ende des
Stichtags geladen, damit Uhrzeiten nicht durch eine Seitengrenze verloren gehen.
Die Zukunftsabfrage endet nach genügend Treffern der ausgewählten Quellen
insgesamt; ein einzelner leerer Systemkalender erzwingt keinen zusätzlichen
Vollscan. Wenn es insgesamt weniger als zehn passende zukünftige Fristen gibt,
kann die serverseitige Collection-Group-Suche dennoch alle zukünftigen Fristen
durchlaufen. Das ist eine verbleibende Kostenbegrenzung, keine bereits
materialisierte Kalenderprojektion.
Historische Fristen oder To-do-Kalendereinträge, die bereits durch die
Darstellungsprüfung ausgeschlossen werden, zählen nicht zum Zukunfts-Cutoff.
Damit verdrängen ungültige Datumswerte keine tatsächlich darstellbaren späteren
Termine.

Kalenderfehler werden an die zentrale Diagnose angebunden. Technische
Serverdetails und private Fristeninhalte werden nicht in Fehlermeldungen
übernommen. Datums-/Auswahlvalidierung und verweigerte Rechte sind keine
technischen Diagnosefehler.

## CRM und Partnercluster

Die Clusterauflösung liest den ausgewählten Partner, folgt seinen Weiterleitungen
und sucht rückwärts gezielt nach zugehörigen archivierten Partnern. Historische
mehrstufige Weiterleitungen bleiben unterstützt. Fehlende Ziele, ungültige
Weiterleitungen und Zyklen werden ausdrücklich abgewiesen. Unbeteiligte
Geschäftspartner werden nicht für jede Auflösung vollständig geladen.

Die Partnerhistorie teilt eine Clusterauflösung zwischen Historie, alten
Aktivitäten und alten Bewertungen. Die neuere Stammdatenhistorie mit ihrer
eigenen seitenweisen Abfrage und den Business-Partner-History-Verträgen bleibt
unverändert. Fehler eines dieser Teilschritte werden als
Ladefehler sichtbar, statt unbemerkt eine scheinbar vollständige Historie zu
zeigen. Die eigentlichen Historien-/Bewertungslisten sind weiterhin vollständig;
eine Pagination dieser Historien ist nicht Bestandteil dieser Änderung.
Die unbenutzten Vollscan-Einstiege `listTransportOrders`/`searchTransportOrders`
und die ebenfalls unbenutzte alte CRM-Bewertungsübersicht wurden nach Prüfung
ihrer Repository-Referenzen entfernt. Die gemeinsamen getesteten
Transportauftragsfilter bleiben erhalten; aktive Listen und Auswahlen verwenden
weiterhin die paginierte serverseitige Abfrage.

## Palettenkarte am Transportauftrag

Die Karte verwendet eine serverseitige Abfrage für den konkreten Auftrag und
lädt die vollständige Geschäftspartnerauswahl erst beim Öffnen des Editors.
Die bisherige Zuordnung über getrimmte, groß-/kleinschreibungsunabhängige
Tournummern bleibt für Altdaten erhalten. Vor belegter Indexabdeckung bleibt
der ausdrücklich gekennzeichnete Legacy-Lesepfad aktiv. Details zu Aufbau,
Summen, Mutationsrechten und Revisionen stehen in
[Palettenkontensummen](pallet-summaries.md).

Callable-Zeitstempel werden wieder in Firestore-Zeitstempelwerte überführt, damit
Sortierung und Rechenlogik bei Buchungen desselben Tages erhalten bleiben.
Schreib-/Löschaufrufe übergeben die geladene Revision; Konflikte dürfen den
offenen Entwurf nicht stillschweigend überschreiben.
Nach bestätigtem Speichern oder Löschen wird der Editor endgültig geschlossen;
ein anschließender Ladefehler ist ein gesonderter Lesefehler mit Möglichkeit
zum erneuten Laden. Er macht aus einer bereits erfolgreichen Buchung keinen
scheinbaren Speicherfehler und fordert nicht zur erneuten Anlage auf. Während
der Mutation kann der Editor nicht über den Hintergrund geschlossen werden.

## Lokale Prüfung und verbleibende Abnahme

- Gezielt geprüft: Filtersemantik, alte Zeitstempel, Coverage-Umschaltung,
  Clusterketten/-fehler, Kalenderpuffer über Jahres-/Schaltjahresgrenzen,
  gleichdatierte Zukunftsseiten, Leer-/Fehlerzustände und Zeitstempelübernahme.
- Echter Firestore-Emulator: Kalendergrenzen, private/fremde Fristenpfade,
  reduzierte Antwortdaten, historische Insolvenzarchive, Abbruch der
  Zukunftsabfrage sowie identische Legacy-/Indexseiten mit Cursorfortsetzung.
  Integrationsläufe nutzen einzigartige Demo-Projekte und löschen abschließend
  alle Quellen, Untercollections und abgeleiteten Verzeichnisdaten. Beide
  parallelen Relationsupdates werden vor Prüfung und Bereinigung abgewartet.
- Lokaler synthetischer Browser-Harness unter `tmp/cost-query-smoke` sperrt echte
  Firebase-Imports. Er ist eine Prüfhilfe und kein Produktbestandteil.
- Gesamt-Lint, Build, zentrale Berechtigungs-/Backendintegration und tatsächliche
  Browserabnahme werden im übergeordneten Änderungspaket nachgewiesen.
- Cloud-Indizes, reale Laufzeiten/Lesemengen und das gemeinsame Dev-Deployment
  sind gesondert zu prüfen. Der Emulator bestätigt keine produktiven Indexkosten
  oder tatsächliche monatliche Einsparung.

Technische Einschränkungen der Abfragestruktur:
[Firestore: Sortierung und Bereichsfilter](https://firebase.google.com/docs/firestore/query-data/order-limit-data),
[Firestore: mehrere Bereichsfelder](https://firebase.google.com/docs/firestore/query-data/multiple-range-fields).
