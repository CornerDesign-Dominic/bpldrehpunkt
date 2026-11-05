# Vertragsakten

Stand: 05.11.2026. Die erste Vertragsliste/Anlage wurde auf Dev veröffentlicht.
Der hier beschriebene Aktenausbau ist lokal implementiert und geprüft, noch
nicht veröffentlicht. Führende Zugriffsregeln stehen in
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

## Speicherung und Konflikte

- `contracts/{id}`: initiale Identität und Erstellungsdaten; danach zusätzlich
  `contractNumber`, `customerNumber`, `description`, `revision`,
  `updatedAt`, `updatedBy`, `updatedByName`.
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

## Prüfstand und spätere Veröffentlichung

Geprüft wurden Feldvalidierung, Revisionskonflikte, Wiederholungen und
unterbrochene Dokumentübergänge sowie erlaubte/verweigerte Firestore- und
Storage-Zugriffe im expliziten Demo-Emulator. Lokale Browserprüfung mit echten
Komponenten und synthetischen API-Grenzen: Vertrags-/Kundennummer, fünf
Handypositionen, Einmalkosten, Bezugsdatum, Frist, Kalenderziel, Notiz,
PDF-Upload/-Bearbeitung/-Download, Löschen, Neuladen, ungespeicherte Eingaben,
Leserechte, Deutsch/Englisch und Light-/Dark-Mode. Die lokale UI-Datenquelle
ersetzt keine noch ausstehende echte Dev-Abnahme des neuen Backends.

Für eine spätere freigegebene Dev-Veröffentlichung gemeinsam bereitstellen:
Frontend, neue Callable `mutateContract`, aktualisierte
`listSystemCalendarSources`/Diagnose-Functions und Firestore-/Storage-Rules.
Die Vertragsfristen sind keine Quelle der automatischen Erinnerungsabläufe.
Zusätzliche Indizes, Secrets und Datenmigrationen sind nicht erforderlich.
Bestehende Dreifeld-Verträge
werden mit Revision 0 weitergeführt; die Original-Erstellungsdaten bleiben.
