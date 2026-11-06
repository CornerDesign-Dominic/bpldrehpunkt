# Vertragsakten

Stand: 05.11.2026. Vertragsliste und erweiterte Vertragsakte sind auf Dev
veröffentlicht und im echten Browserablauf geprüft. Der konkrete Nachweis steht
im [Dev-Abschlussbeleg](releases/contracts-file-dev-2026-11-05.md).
Die Ergänzungen zu Zahlung, Bemerkung und Kostenzuordnung wurden am 06.11.2026
mit dem vollständigen Release zusammengeführt. Der alte Dev-Beleg beschreibt
den davor veröffentlichten Stand; die neue Abnahme und Bereitstellung stehen
im [Releasebeleg vom 06.11.](releases/production-2026-11-06-status.md).
Führende Zugriffsregeln stehen in
[FIRESTORE_ACCESS.md](../../FIRESTORE_ACCESS.md).

## Fachlicher Umfang

Vertragsmanagement führt betriebliche Begleitverträge, beispielsweise Miete,
Mobilfunk, Internet und Versicherungen. Es ist kein Modul für Transportverträge.
Die Akten besitzen ausschließlich die fachliche Kalenderanbindung: keine
Auftrags-, Fall-, To-do-, CRM- oder Geschäftspartnerverknüpfungen. Die
Vertragspartnerbezeichnung ist Freitext. Unbekannte Verknüpfungsfelder werden
von der serverseitigen Eingabevalidierung abgewiesen.

Ein Vertrag besitzt einen frei erfassten Vertragspartner. Vertragsnummer und
Kundennummer sind optionale Angaben; die Kundennummer bezeichnet die eigene
Nummer beim jeweiligen Vertragspartner und ist keine automatische Verknüpfung
mit Kundenstammdaten oder DyCoS. Eine Beschreibung ergänzt den Aktenkopf.
Erstellungszeitpunkt bleibt erhalten, Änderungen zeigen Zeitpunkt und Bearbeiter.

Jede Vertragsposition enthält Bezeichnung, Bruttobetrag in EUR, Rhythmus und
Bezugsdatum. Beispielsweise werden fünf Handyverträge als fünf Zeilen erfasst.
Unterstützt sind monatlich, vierteljährlich, halbjährlich, jährlich und einmalig.
Geldbeträge werden als ganzzahlige Centwerte gespeichert und mit höchstens
zwei Nachkommastellen eingegeben. Summen bleiben nach Rhythmus getrennt;
einmalige Kosten werden nicht als laufende Monatskosten ausgegeben.

Die nächste Fälligkeit folgt dem ursprünglichen Bezugsdatum. Fehlt dessen Tag
in einem Zielmonat, wird dessen letzter Tag verwendet; nach Februar kehrt eine
am 31. verankerte Position im März wieder zum 31. zurück. Einmalige Positionen
behalten ihr Bezugsdatum. Die Anzeige ist kein Zahlungs- oder Buchungsnachweis.

Termine und Fristen sind eigene Akteneinträge: Bezeichnung, Art, Datum, optionale
Uhrzeit und Hinweis sowie Erledigt-Status. Offene Einträge erscheinen zusätzlich
im virtuellen Systemkalender **Vertragsmanagement**, erledigte nur in der Akte.
Kalenderereignisse führen zum konkreten Eintrag; bearbeitet wird die Quelle in
der Akte. Es werden keine zweiten Kalenderdokumente erzeugt. Positionen erzeugen
keine zusätzlichen Zahlungsereignisse im Kalender. Automatische Mails oder
Erinnerungen sind nicht Teil dieses Ausbaus.

PDF-Dokumente bis 20 MiB können hochgeladen, angesehen, heruntergeladen,
umbenannt/beschrieben und bestätigt gelöscht werden. Notizen sind unveränderlich
und ergänzen den serverseitigen Änderungsverlauf. Die Oberfläche zeigt jeweils
die letzten 50 Notizen und Historieneinträge an und kennzeichnet diese Grenze.

## Zahlung, Bemerkung und Kostenzuordnung

Die Bemerkung ist ein bearbeitbares Freitextfeld oben in der Akte und ergänzt
Beschreibung sowie unveränderliche Notizen. Der Schriftzug „Vertragsakte“ im
Aktenkopf entfällt; der Vertragspartner bleibt die Überschrift. Dokumente laden
nach Änderungen automatisch neu; ein regulärer Aktualisieren-Button entfällt.
Bei einem Ladefehler bleibt die Möglichkeit zum erneuten Laden erhalten.

Ein eigener Zahlungsrhythmus am gesamten Vertrag enthält `paymentCycle` und
`paymentAnchorDate`. Beide Angaben werden zusammen hinterlegt oder zusammen
geleert. Unterstützte Rhythmen und Monatsendregel entsprechen den Positionen.
Dies dokumentiert den erwarteten Zahlungstag, ohne Buchungen oder zusätzliche
Kalenderereignisse zu erzeugen. Die Rhythmen einzelner Positionen bleiben erhalten.

Der Fachreiter **Einstellungen** gehört nur zum Vertragsmanagement. Dort werden
Kostenpositionen wie Disposition oder Buchhaltung angelegt, umbenannt und
aktiviert/deaktiviert. Es erfolgt keine Verknüpfung mit Personalabteilungen,
Transportaufträgen oder Fallakten. Lesen erfordert `contracts:view`, Änderungen
`contracts:edit` (bzw. Superadmin). Namen sind im Katalog eindeutig; Deaktivieren
bewahrt stabile Referenzen und ermöglicht späteres Reaktivieren.

Die Karte **Kostenzuordnung** verteilt den Gesamtbetrag der Vertragsakte nach
Prozenten, zum Beispiel 70 % Disposition und 30 % Buchhaltung. Es gibt keine
Zuordnung einzelner Vertragszeilen. Eine Zuordnung ist optional; sofern vorhanden,
muss sie genau 100 % ergeben. Positive Anteile mit bis zu zwei Nachkommastellen
werden als ganzzahlige Basispunkte gespeichert (100 % = 10000). Jede Kostenposition
kommt höchstens einmal vor. Neue oder veränderte Anteile dürfen nur aktive
Kostenpositionen verwenden; bestehende inaktive Anteile können unverändert
beibehalten werden. Unbekannte Referenzen werden sichtbar angezeigt und müssen
vor dem Speichern aufgelöst werden. Kosten verschiedener Rhythmen werden weiterhin
getrennt dargestellt; es wird keine fachlich unbelegte Gesamtsumme gebildet.
Die Zuordnung ist eine Grundlage für spätere Kostenauswertungen und führt selbst
keine Buchung aus.

## Speicherung und Konflikte

- `contracts/{id}`: initiale Identität und Erstellungsdaten; danach zusätzlich
  `contractNumber`, `customerNumber`, `description`, `remark`, `paymentCycle`,
  `paymentAnchorDate`, `allocations: [{categoryId, basisPoints}]`, `revision`,
  `updatedAt`, `updatedBy`, `updatedByName`.
- `contractCostCategories/{id}`: modulspezifischer Kostenpositionskatalog mit
  `name`, `active`, Revision und Auditfeldern; nur serverseitig beschreibbar.
  Private Namens- und Wiederholungsbelege sind für Clients gesperrt.
- `positions/{id}`: `title`, `grossAmountCents`, `billingCycle`, `anchorDate`,
  `note` und serverseitige Revisions-/Auditfelder.
- `deadlines/{id}`: `title`, `type`, `date`, `time`, `note`, `completed` und Audit.
- `notes/{id}`, `history/{mutationId}`: unveränderliche Einträge.
- `documents/{id}`: PDF-Metadaten und Verarbeitungsstatus.
- `mutations/{mutationId}`: für Clients gesperrter Wiederholungsbeleg.

`mutateContract` nimmt genau eine validierte Aktion mit Vertrags-ID, stabiler
Mutations-ID und erwarteter Revision an. Details verwenden die Vertragsrevision,
Positionen/Fristen/Dokumente die eigene Revision. Jede bestätigte Änderung
erhöht auch die Vertragsrevision und erzeugt einen Historieneintrag.
Wiederholung derselben Anfrage gibt dasselbe Ergebnis zurück. Wiederverwendete
Anfrage-IDs mit anderen Inhalten und veraltete Revisionen werden abgewiesen;
die Oberfläche erhält die Eingaben und fordert zum Abgleich auf.

## PDF-Verarbeitung und Wiederaufnahme

Reservierung → unveränderlicher Storage-Upload → serverseitige Prüfung → `ready`.
Die Prüfung bindet Größe, PDF-Inhaltstyp, Vertrags-/Dokument-ID und Generation.
Löschen sperrt den Datensatz zunächst als `deleting`, löscht die konkrete
Storage-Generation und bestätigt danach Metadatenänderung/History atomar.

Storage-Zugriffe lesen ausschließlich das aktuelle Benutzerprofil und die
Vertragswurzel. Deren serververwaltetes `documentStorageAccess` enthält je PDF
nur Status und Dateigröße; Slot und Dokumentmetadaten werden in denselben
Transaktionen fortgeschrieben. So bleiben der bestehende Vertrag und aktuelle
Modulrechte prüfbar, ohne das [Firebase-Limit](https://firebase.google.com/docs/rules/rules-behavior)
von zwei unterschiedlichen Firestore-Dokumenten je Storage-Anfrage zu überschreiten. Ein fehlender Slot
gewährt keinen Zugriff; eigene ältere Reservierungen reparieren ihn bei der
Wiederaufnahme aus dem autoritativen Dokumentdatensatz.

Unklare Antworten wiederholen dieselbe Aktion. Ein bloßer Verbindungsfehler
löscht keine möglicherweise bereits erfolgreich gespeicherte Datei.
Offene `pending`-, `finalizing`- und `deleting`-Vorgänge bleiben nach einem
Neuladen sichtbar. Eigene Vorgänge lassen sich mit ursprünglicher ID/Revision
fortsetzen; eine fehlende PDF kann ausdrücklich entfernt und neu hochgeladen
werden. Fremde laufende Vorgänge zeigen ihren Status und werden nicht durch
Übernahme fremder Mutations-IDs fortgesetzt. Ein erfolgreicher Schreibvorgang
wird bei anschließendem Ladefehler weiterhin als gespeichert ausgewiesen.

## Prüfstand und Veröffentlichung

Geprüft wurden Feldvalidierung, Revisionskonflikte, Wiederholungen und
unterbrochene Dokumentübergänge sowie erlaubte/verweigerte Firestore- und
Storage-Zugriffe im expliziten Demo-Emulator. Lokale Browserprüfung mit echten
Komponenten und synthetischen API-Grenzen: Vertrags-/Kundennummer, fünf
Handypositionen, Einmalkosten, Bezugsdatum, Frist, Kalenderziel, Notiz,
PDF-Upload/-Bearbeitung/-Download, Löschen, Neuladen, ungespeicherte Eingaben,
Leserechte, Deutsch/Englisch und Light-/Dark-Mode. Anschließend wurde der echte
Dev-Ablauf einschließlich Kalender, PDF-Wiederaufnahme, Download und Neuladen
geprüft; dabei wurde das Storage-Abfragebudget korrigiert. Details und Grenzen
stehen im verlinkten Abschlussbeleg.

Auf `db-bpl-drehpunkt-dev` bereitgestellt: Frontend, neue Callable
`mutateContract`, aktualisierte `listSystemCalendarSources`/Diagnose-Functions
und Firestore-/Storage-Rules.
Die Vertragsfristen sind keine Quelle der automatischen Erinnerungsabläufe.
Zusätzliche Indizes, Secrets und Datenmigrationen sind nicht erforderlich.
Bestehende Dreifeld-Verträge
werden mit Revision 0 weitergeführt; die Original-Erstellungsdaten bleiben.

## Prüfung der lokalen Ergänzungen vom 05.11.2026

Lint, Build und Functions-Shared-Abgleich erfolgreich. 25 Backend-/Rules-Tests
bestanden (einschließlich echter Firestore-Emulatorläufe mit Rollen, verweigerten
Zugriffen, Konkurrenz, Wiederholung, Parentrevisionen und inaktiven Referenzen).
Weitere 11 Frontend-Helfer-/Übersetzungstests bestanden. Im lokalen Browser mit
synthetischen Daten geprüft: Katalog anlegen, Bemerkung speichern, Zahlungsdatum
am 31. mit nächstem Monatsende, 70/30 speichern/neuladen, 90 % abweisen,
Leseansicht ohne Mutation sowie Deutsch/Englisch und Light/Dark. Keine
Browser-Konsolenfehler. Dies ist keine Abnahme der Ergänzungen auf Dev.

Für deren spätere Dev-Veröffentlichung werden Frontend, `mutateContract`,
`saveContractCostCategory` und Firestore Rules gemeinsam benötigt. Storage Rules
und Indizes wurden für diese Ergänzung nicht verändert.
