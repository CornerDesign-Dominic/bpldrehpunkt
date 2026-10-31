# Kostenbegrenzte Hintergrundverarbeitung

Stand: 31.10.2026. Beschreibt die lokale Implementierung; kein Nachweis einer
Bereitstellung oder einer gemessenen Kosteneinsparung. Umgebungen und Freigaben
folgen [Umgebungen](environments.md) und [Releaseweg](releases.md).

## Daten und Ablauf

Die Tracking-Automatik liest im regulären Fünfminutenlauf aus
`shipmentTrackingWork`, gefiltert auf `dueAt <= jetzt`. Ein Dokument je Auftrag
enthält ausschließlich `orderId` und `dueAt`. Auftragsarchiv und Trackingarchiv
werden nach abgeschlossenem Erstaufbau nicht mehr regelmäßig vollständig gelesen.

- Noch nicht gestartete Aufträge erhalten den frühesten Termin aus Lifecycle-Start
  und wirksamen Partnerregeln. Regeln vor dem regulären Start bleiben wirksam.
- Aktive Vorgänge sowie frühe manuelle Starts bleiben bearbeitbar. Die bestehende
  Versandfrist von zehn Minuten wird nicht verlängert. Wiederholte Läufe behalten
  die stabilen Versandidentitäten und transaktionalen Reservierungen.
- Abgeschlossene Trackings werden entfernt. Ein nach Zeitplan abgelaufener Auftrag
  geht wie bisher in `aftercare`, ohne fachlich abgeschlossen oder gesperrt zu werden.
  Nach erreichter Nachbearbeitungsphase entfällt sein periodischer Job.
- Auftrags- und relevante Trackingänderungen berechnen die Arbeitsprojektion aus
  den aktuellen Dokumenten neu. Das gilt auch für spätere Terminkorrekturen,
  Löschung, manuelle Starts und fachliche Abschlüsse. Veraltete oder doppelte
  Triggerereignisse schreiben keine alten Eventdaten zurück.
- Forecast-, Attention- und reine Änderungsmetadaten lösen keinen erneuten
  Aufbau der Tracking-Arbeitsprojektion aus. `listQuery`-Änderungen der
  Auftragsliste lösen ebenfalls keine Schleife aus.

Die Fristerinnerung liest minütlich aus `caseDeadlineReminderWork`, ebenfalls nur
Jobs mit `dueAt <= jetzt`. Ein Job enthält Quellpfad, stabile Versandversion und
Zeitpunkt. Aktivierte Erinnerungen bleiben fachlich aktiviert; bereits versandte
Versionen stehen ausschließlich in `caseDeadlineReminderDeliveries` und nicht
mehr in der Arbeitsmenge. Änderungen an Datum, Uhrzeit oder Empfänger erzeugen
wie bisher eine neue Versandversion. Deaktivierte oder gelöschte Fristen und
fehlende übergeordnete Fälle entfernen den Job. Alle fünf Quellen bleiben
enthalten: Schäden, Inkasso, Gericht/Streit, Insolvenzen und To-dos.

Die Historien werden nicht gelöscht. Beide Arbeitscollections und
`backgroundWorkState` bleiben für direkte Clientzugriffe vollständig gesperrt,
einschließlich Superadmins. `prepareBackgroundWork` ist ausschließlich für aktive
Superadmins mit App Check zugänglich. Die normalen Scheduler benötigen keine
neuen zusammengesetzten Firestore-Indizes: Filter und Sortierung verwenden nur
`dueAt`; der Aufbau paginiert nach Dokumentname.

## Erstaufbau und laufende Konfigurationsänderungen

`backgroundWorkState` speichert je Aufbau Generation, Dokumentcursor und
`complete`. Eine Seite umfasst maximal 200 Quellen. Ein Fehler lässt den Cursor
auf der vorherigen abgeschlossenen Seite; erneute Verarbeitung ist idempotent.
Ein parallel angeforderter Neuaufbau kann nicht durch den Abschluss einer alten
Seite überschrieben werden.

Erstaufbau und Umstellung müssen vor einer ausdrücklich freigegebenen
Bereitstellung in zwei Schritten erfolgen:

1. Neue Projektionstrigger, den Taskworker und `prepareBackgroundWork`
   bereitstellen; die beiden bisherigen Scheduler zunächst weiterlaufen lassen.
   Die vorhandenen Quellen bleiben dabei führend.
2. Die authentifizierte Callable `prepareBackgroundWork` wiederholt ausführen,
   bis `tracking.complete`, `reminders.complete` und `list.complete` wahr sind.
   Jeder Aufruf verarbeitet je Projektion eine begrenzte Seite. Bei Fehlern
   erneut aufrufen und Diagnose prüfen. Quelländerungen während des Aufbaus
   werden bereits durch die neuen Trigger nachgeführt.
3. Erst dann die neuen Implementierungen der beiden Scheduler bereitstellen.
   Readiness und neue Trigger müssen für das ausdrücklich genannte Firebase-Ziel
   geprüft sein. Ein Code- oder Frontenddeploy allein bestätigt dies nicht.

Ohne diesen vorbereiteten Aufbau kann ein großer Altbestand länger als das
bestehende Mail-Versandfenster benötigen. Der periodische Scheduler kann einen
unvollständigen Aufbau zwar seitenweise fortsetzen, ersetzt aber ausdrücklich
nicht diese Umstellungsreihenfolge.

Nach Änderungen an Betriebszeiten, Regelkatalog, Ankunftsrückfrage oder
Partnerpolicy beziehungsweise Partnerzusammenführung fordert der jeweilige
Trigger sofort einen Neuaufbau an. Derselbe Eventbeleg setzt den Cursor bei
erneuter Zustellung nicht zurück. Der Worker `rebuildShipmentTrackingWork`
verarbeitet zuerst bereits geplante Jobs und anschließend den Auftragsbestand.
Er stellt unmittelbar Folgetasks ein, bis die aktuelle Generation vollständig ist;
er wartet zwischen den Seiten nicht auf den nächsten Fünfminutentakt.
Taskworker und Scheduler sind jeweils auf eine Instanz begrenzt; der Worker
verarbeitet eine Task gleichzeitig, mit maximal zehn Zustellversuchen und
mindestens fünf Sekunden Wiederholungsabstand. Transaktionen schützen den
gemeinsamen Fortschritt auch bei Überschneidung mit Scheduler oder Vorbereitung.

Die Deduplizierung hält je Konfigurationsereignis einen kleinen, serverseitigen
`rebuild-request-<hash>`-Beleg in `backgroundWorkState`. Dadurch setzt auch die
Reihenfolge A, B, erneute Zustellung von A einen laufenden Neuaufbau nicht zurück.
Die Belege enthalten keine Mail- oder Fachdaten und werden dauerhaft erhalten;
es wird keine unkonfigurierte TTL-Bereinigung vorausgesetzt.

Für die neue Taskqueue dieselben benötigten Cloud-Tasks-/Invoker-Rechte wie beim
bestehenden Routeworker prüfen; keine pauschalen Owner-Rechte vergeben. Bei einer
geplanten Veröffentlichung den Worker vor den ihn aufrufenden Triggern
bereitstellen. Die tatsächliche Cloud-Tasks-Zustellung, IAM-Konfiguration und
Laufzeit unter realer Bestandsgröße gehören zur Dev-Abnahme. Ein Emulatorlauf
prüft Verarbeitung und Fortsetzung mit injiziertem Enqueue, keine echte Queue.

## KI, Trigger und Versandbelege

Die Statusmail-KI erkennt fachlich abgeschlossene Trackings vor Kontextabruf und
Modellaufruf. Der Skip wird anhand frischer Daten transaktional gespeichert.
Die Anwendungstransaktion prüft einen zwischenzeitlichen Abschluss weiterhin.
Eine fünf Minuten gültige, transaktional reservierte `aiProcessing`-Lease am
Maildokument verhindert parallele bezahlte Auswertungen; nur der aktuelle
Reservierungsinhaber darf das Ergebnis anwenden oder seine Reservierung lösen.
Abgelaufene Reservierungen können wieder übernommen werden. Es entsteht dafür
keine zusätzliche Collection.

Die Mailansicht erlaubt die manuelle Wiederaufnahme einer `pending`-Auswertung
nur bei nachweislich abgelaufener Reservierung mit gültigem Zeitpunkt und Token.
Ein einzelner Timer im geöffneten Dialog aktualisiert die Bedienung zum Ablauf;
aktive Reservierungen erlauben keinen zweiten Start. Für initiales `pending`
ohne Reservierung wird keine neue zeitabhängige Wiederholungsregel angenommen.
Lesefehler nach der Reservierung und Fehler beim Anwenden des Ergebnisses werden
ebenso wie Modellfehler diagnostiziert und lösen nur die eigene Reservierung.
Ist die Speicherung trotz fehlender Commit-Antwort bereits erfolgt, wird das
gespeicherte Ergebnis erkannt und nicht als Fehler überschrieben. Ein parallel
manuell abgeschlossener Review bleibt ebenfalls abgeschlossen.

Der Mail-Attention-Trigger reagiert auf Anlage/Löschung, geänderte Empfangszeit
und geänderte fachliche Reviewbedürftigkeit, einschließlich der Statuswerte
`needs_review` und `error`. Die Berechnung erfolgt transaktional. Ein unverändert
berechnetes `manualReviewOpen` erzeugt keinen weiteren Trackingwrite.

Unmittelbar vor automatischem Trackingversand werden Lifecycle, Phase,
Automation-Pause, Entladeabschluss und aktueller gespeicherter Empfänger nochmals
geprüft. Ein erst nach angenommenem Versand erfolgter fachlicher Abschluss
verhindert den Versandbeleg nicht und wird nicht rückgängig gemacht. Nach
erfolgreichem Webhook wird vor der Historientransaktion `delivered` gespeichert;
bei einem anschließenden Historiefehler bleibt die Version gegen erneuten
Versand gesperrt. Fristerinnerungen behandeln einen nach angenommenem Webhook
fehlgeschlagenen Belegwrite ebenfalls als `delivered`, soweit Firestore erreichbar
ist. `delivered` bezeichnet hier den vom bestehenden Webhook angenommenen
Auftrag, keine bestätigte Zustellung beim Empfänger.

Lifecycle-Änderungen prüfen den Auftrag nochmals innerhalb der Transaktion;
vor Versand wird zusätzlich die verwendete Auftragsquelle verglichen. Ein
zwischenzeitlich gelöschter oder umterminierter Auftrag erzeugt damit keine
neue Sendungsverfolgung beziehungsweise Mail anhand seines alten Datenstands.
Eine nach `aftercare` in die Zukunft verschobene Planung wird für den nächsten
Schedulerlauf sofort fällig; dieser korrigiert die bevorstehende Phase und
terminiert anschließend den künftigen Start. Versandreservierungen werden ausschließlich aus
dem erfolgreich abgeschlossenen Transaktionsversuch zurückgegeben; ein
abgebrochener früherer Versuch kann keinen zweiten Sender freigeben.

Der bestehende externe Webhook besitzt keinen zugesicherten Idempotenzvertrag.
Ein Provider-Timeout oder Prozessverlust nach externem Versand und vor einem
beständigen Beleg lässt sich damit nicht als garantiert einmaliger Versand
auflösen. Insbesondere bleibt die bestehende Wiederaufnahme einer veralteten
Fristerinnerungsreservierung nach zehn Minuten erhalten. Dieser Vertrag wird
durch die Kostenoptimierung nicht still geändert; eine absolute
At-most-once-Zusage wäre unzutreffend.

## Fehler, Prüfung und Betrieb

Technische Fehler laufen in die zentrale Diagnose unter `background-work`.
Gleiche Fehlercodes je Aktion werden dort auf einen Eintrag pro 15 Minuten
begrenzt; Functions-Logs bleiben verfügbar. Diagnosefehler verdecken den
ursprünglichen Fehler nicht. Mailinhalte, Providerantworten und Zugangsdaten
werden nicht übernommen. Fehlgeschlagene Projektionstrigger werden erneut
zugestellt; ausstehende Jobs und Aufbaufortschritt bleiben erhalten.

Lokale Prüfung: gezielte Unit- und echte Firestore-Emulatortests umfassen mehr
als 500 Quellen beziehungsweise fällige Fristen, unterbrochenen Aufbau,
konkurrierenden Neustart, automatische und frühe manuelle Starts, Abschluss,
Nachbearbeitung und Terminkorrektur, mehr als 400 priorisierte Konfigurationsjobs
mit unmittelbaren Folgetasks, doppelte Requests, Reviewstatus/Löschung ohne
unnötige Writes sowie Pause, Fehler und Empfängeränderung bei Erinnerungen.
Die Versandprüfung verwendet synthetische Daten, keine echten Mails.

Der Abschlussreview ergänzt deterministische Transaction-Retry-Prüfungen,
verschränkte Rebuildereignisse, frische Auftragsprüfung bei Terminänderung und
Löschung sowie echte Emulatorfälle für KI-Lesefehler, Applyfehler, fehlende
Commit-Antwort und parallelen manuellen Review. Die Wiederaufnahme in der
Mailansicht ist durch reine Timestamp-/ISO-/Statusprüfungen abgesichert; ein
echter Browserablauf mit abgelaufener KI-Reservierung steht noch aus.

Vor einer später freigegebenen Dev-Umstellung zusätzlich mit echtem Projekt prüfen:
Readiness vor Schedulerwechsel, echte Cloud-Tasks-Fortsetzung nach Policyänderung,
Aufholen nach Unterbrechung, Aktivierung vor regulärem Start, manueller Abschluss
während eines Versandvorgangs und zentrale Diagnose. Danach Read-Anzahlen,
Aufrufe, Laufzeiten, offene Jobs und Rebuild-Dauer gegen die bisherige Nutzung
vergleichen. Der lokale Befund ersetzt keine Rechnungsauswertung und keine
reale Kostenmessung.

## Vorbereitung auf aktuellem Dev-Stand

Die isolierte Releasevorbereitung basiert auf Dev-Commit
`5e9586145b2df0c939d10fa455f699653e1f40ba`. Sie übernimmt ausschließlich die
Kosten- und Reviewänderungen; sie ist weder ein Push noch eine Bereitstellung.
Die neueren Shared-Verträge für abgeschlossene Prognosen, die neutrale
Automatikpause und die unterdrückten operativen Hinweise nach Abschluss bleiben
erhalten. Die Attention-Arbeitszusammenfassung behält den tatsächlichen
Reviewstatus der eingegangenen Mails auch bei geschlossenem Tracking bei.

Die Mail-Wiederaufnahme wird in der bestehenden
`src/components/transport-orders/TransportOrderReceivedMails.jsx` ergänzt;
Datei, Komponentenname, CSS-Klassen und Navigation werden nicht umbenannt.
Der gemeinsam verwendete Partnerresolver ersetzt ausschließlich die zuvor
identischen, auf fünf Weiterleitungsschritte begrenzten Trackingresolver.
Andere Änderungen an Partnerzusammenführungen gehören nicht zu diesem Port.
