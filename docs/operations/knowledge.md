# Wissensmanagement und KI-Antwortentwürfe

Stand: 31.10.2026. Veröffentlichung ausschließlich auf Dev freigegeben.

## Fachlicher Ablauf

Unter Qualität liegen Handbuch, Grundregeln und Wissenslücken. Das Handbuch ist
nach Prozessen mit optionalem Thema und Suchbegriffen gegliedert; Abteilungen sind
keine Pflicht und keine Hauptordnung. Ein Situationsartikel beschreibt Erkennen,
Prüfungen, Vorgehen, Beachten/Eskalieren, optionale Antwortvorlage und Abschluss/
Nachverfolgung. Grundregeln beschreiben Geltungsbereich, Vorgaben, Vermeiden,
Ausnahmen/Rücksprache und Beispiele. Adressaten sind allgemein, Kunden,
Unternehmer, Finanzamt, Anwälte, Inkasso oder sonstige. Artikel verweisen auf
Grundregeln, statt deren Inhalt zu duplizieren.

Jeder Eintrag ist Entwurf, gültig oder archiviert. Gültige Artikel verlangen
Situation und Vorgehen, gültige Grundregeln Geltungsbereich und Vorgaben.
Zuständigkeit, Prüfdatum und nächster Prüftermin sowie die vollständige
Revisionshistorie bleiben verfügbar. Bearbeitung verwendet große, scrollbar
bleibende Modale und automatisch wachsende Textfelder. Historische Fassungen
sind nur lesbar; Quellenlinks können eine konkrete Revision öffnen.

Die neuen Kataloge verwenden `knowledgeArticles` und `knowledgeRules`.
Alte `qualityHandbook`-Inhalte werden nicht übernommen und erscheinen nicht im
neuen Handbuch. Es wird keine Löschung alter Datensätze und keine automatische
Übernahme alter Texte in fachlich andere Abschnitte durchgeführt. K.V.P. und
Besprechungen bleiben im bestehenden Datenmodell.

## Zugriff und Speicherung

Handbuch und Grundregeln verwenden das Modulrecht `handbook`. Die zentrale
Sammlung der Wissenslücken und Antwortbelege verwendet ausschließlich das eigene
Modulrecht `knowledgeGaps` (`none/view/edit`), ohne Handbuch-Fallback. Bestehenden
Nutzern wird dieses Recht nicht automatisch erteilt; die Benutzerverwaltung kann
es den zuständigen Personen gezielt zuordnen. Der bestehende Superadmin-Override
bleibt erhalten.
Lesen verlangt aktives Profil und view/edit bzw. den bestehenden Superadmin-
Override. Bearbeiten und Gültigsetzen verlangen edit; Admin hat keinen pauschalen
Override. Direkte Browser-Schreibzugriffe sind gesperrt.

`saveKnowledgeRecord` prüft Daten, gültige Verknüpfungen, aktuelle Rechte und
erwartete Revision transaktional und schreibt eine vollständige unveränderliche
Fassung nach `revisions/{revision}`. `updateKnowledgeGap` ändert den Bearbeitungs-
status mit Revisionsschutz. Wissenslücken lassen sich ohne Artikelzuordnung als
erledigt abhaken. Bearbeiter und Zeitpunkt werden festgehalten und beim
Wiederöffnen entfernt. Artikelverknüpfungen sind optional; eine neue Zuordnung
verlangt zusätzlich Handbuch-Leserecht. Neue Inhalte werden nicht durch die KI
gültig gesetzt.
Ein gültiger Artikel darf nur gültige Grundregeln referenzieren. Die KI prüft
vor Rückgabe nochmals aktuelle Rechte sowie Status und genaue Revision aller
verwendeten Quellen; zwischenzeitliche Änderungen verwerfen den Vorschlag.

## Postfach: Vorschlag machen

Der vorhandene Ablauf `suggestMailboxReply` bleibt ein Entwurfsablauf. Es gibt
keinen automatischen Versand, keine automatische Übernahme in die Antwort und
keine Ausführung von Handbuchschritten. Ein Mensch prüft und übernimmt den
Vorschlag und betätigt gegebenenfalls den vorhandenen separaten Versandknopf.

Mit Handbuch-Leserecht werden aktuelle gültige Artikel und Grundregeln für die
Situation ausgewählt. Allgemeine sowie passende und verknüpfte Grundregeln dienen
als Kontext. Entwürfe, archivierte und frühere Fassungen dienen nicht als neue
Wissensgrundlage. Der Vorschlag zeigt Quellen mit Titel und verwendeter Revision.
Die Auswahl erfolgt semantisch anhand eines begrenzten aktuellen Katalogs,
anschließend wird der vollständige ausgewählte Kontext zum Formulieren verwendet.
Das sind bis zu zwei Modellaufrufe pro Vorschlag innerhalb des bestehenden
Stundenlimits. Eine bestehende Signatur wird weiterhin nicht von der KI ergänzt.
Eine Mail oder deren Zitate dürfen keine Systemanweisungen oder betrieblichen
Vorgaben überschreiben. Fehlende betriebliche Regeln werden nicht erfunden;
fehlende konkrete Vorgangsdaten sind von fehlendem Firmenwissen zu unterscheiden.

Ohne Handbuch-Leserecht bleibt der vorhandene generische Entwurf möglich,
ohne geschützte Quellen oder globale Lückenmeldung.
Technische Such-/Modellfehler sind keine Wissenslücken. Bei begrenztem Katalog
darf keine sichere Vollständigkeit behauptet werden.
Die erste Ausbaustufe berücksichtigt bis zu 200 gültige Artikel und 100 gültige
Grundregeln pro Zuordnung. Bei größerem Katalog werden daraus keine Lücken gezählt.
Das ist keine Volltext-/Vektorsuchplattform für unbegrenzt große Bestände.

## Wissenslücken als Arbeitsvorrat

Wissenslücken werden kurz unter `knowledgeGaps` gesammelt. Die Häufigkeit zählt
unterschiedliche Quellmails; Wiederholen oder Neuformulieren für dieselbe Mail
erhöht sie nicht erneut. Private, gehashte Ereignisbelege verhindern Doppelzählung
auch bei Wiederholung und parallelen Aufrufen. Browser dürfen diese Belege nicht
lesen oder schreiben. Globale Lücken enthalten keine Mailtexte, Empfänger,
Absender, Auftragsnummern oder privaten Postfachlinks.
Wissenslücken, IDs, Häufigkeiten und entsprechende Hinweise werden weder bei
„Vorschlag machen“ noch beim Laden eines Mailentwurfs an den Nutzer ausgegeben.
Die Handbuchsuche liest keine Kuratorenmeldungen ein. Im Entwurf verbleiben nur
die verwendeten Wissensquellen und der allgemeine Hinweis auf menschliche Prüfung.

Antwortbelege werden getrennt unter `knowledgeGapEvidence` gespeichert und nur
mit `knowledgeGaps`-Leserecht zugänglich gemacht. Pro gezählter Quellmail werden
der letzte KI-Vorschlag sowie die tatsächliche manuelle Antwort getrennt erfasst.
Der Vorschlag ist ausdrücklich kein Nachweis einer gelösten Situation. Vor dem
Versandversuch wird der genaue Antworttext gesichert, zunächst mit unklarem
Versandstatus; erst eine angenommene Graph-Versandanforderung markiert den Beleg
als angenommen. Das ist kein Zustellnachweis. Belegfehler nach angenommenem
Versand dürfen keinen erneuten Versand auslösen. Kein eingehender Mailtext wird
zusätzlich gesammelt; Antworttexte können fachliche/personenbezogene Angaben
enthalten und liegen deshalb hinter dem separaten Recht.
Situation und fehlende Wissensaspekte werden aus einer festen serverseitigen
Taxonomie gebildet; das Modell darf keine frei formulierten Maildetails in die
globale Liste schreiben. Es gibt 33 Situations- und sechs Bedarfs-Kategorien.
Das ist eine bewusste erste Ausbaustufe, keine unbegrenzte semantische Clusterung.
Weitere/unklare Situationen werden als breite Prüfkategorie gekennzeichnet;
deren Aufkommen bedeutet nicht, dass alle zugehörigen Mails denselben Fall haben.
Die Kategorien können nach echten Nutzungserfahrungen gezielt erweitert werden.

Die Liste priorisiert nach Häufigkeit und letzter Sichtung. Häufigkeit ist ein
Bedarfssignal und keine automatisch festgestellte fachliche Dringlichkeit.
Bearbeitungsstatus: offen, in Bearbeitung, erledigt, zurückgestellt. Aus einer
Lücke lässt sich ein Artikelentwurf anlegen; ein Mensch ergänzt und prüft ihn.
Ein erneutes Auftreten nach Erledigung öffnet die Meldung erneut.

## Dev-Beispiele

Am 31.10.2026 wurden drei gültige Beispielartikel zum Lieferstatus (bestätigter
Stand, fehlende aktuelle Bestätigung, fehlende Referenz) und eine gemeinsame
gültige Kommunikationsregel angelegt. Titel kennzeichnen sie als Dev-Beispiele;
sie enthalten keine echten Transportdaten oder erfundenen betrieblichen Fristen.
`scripts/knowledge-dev-examples.mjs` validiert den Datenvertrag, lässt nur das
Dev-Projekt zu und verwendet stabile IDs. Erneutes Anlegen überschreibt keine
vorhandenen Datensätze und erstellt keine Duplikate. Jede Anlage enthält Revision 1.

Die Orientierung ist Knowledge-Centered Service: Wissen in der Arbeit erfassen,
strukturiert wiederverwenden und nach tatsächlichem Bedarf verbessern. Das Muster
unbeantworteter Fragen und gruppierter Themen findet sich auch in Copilot Studio.

- [KCS Solve Loop](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030)
- [Copilot Studio: Themenanalyse](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-themes)

## Bereitstellung und Prüfung

Benötigt: Frontend, Functions `saveKnowledgeRecord`, `updateKnowledgeGap`,
`suggestMailboxReply` und für die serverseitige Quellenprovenienz die betroffenen
Entwurfs-Callables; Firestore-Rules für die neuen Sammlungen. Keine neue externe
Suchplattform, kein automatischer Mailversand, kein Produktionsdeploy.
53 gezielte Unit-Tests und sechs echte Firestore-Emulatorprüfungen erfolgreich;
darunter aktuelle Rechte, Revisionskonflikte, Publikationsregeln, Zugriff auf
Wissenssammlungen, gültige Quellen, Datenschutz sowie parallele Wiederholungen
derselben Mail ohne Doppelzählung. Lint, Build und Shared-Abgleich (42 Module)
erfolgreich. Lokaler Browser mit Beispieldaten: Prozessartikel ohne Abteilung,
sechs Abschnitte, Gültigkeitsprüfung, exakte Quellenrevision, Grundregelkatalog,
gezählte Lücke und Artikelentwurf mit Zuordnung geprüft. Kein angemeldeter
Dev-Durchlauf mit echter Mail und echtem Modellaufruf durchgeführt. Kein Versand
als Test ausgelöst. Aktive Dev-Rules vor Veröffentlichung mit Git-Basis abgeglichen.

### Getrennte Pflege und Antwortbelege am 31.10.2026

Eigenes Modulrecht `knowledgeGaps`, keine Lückenhinweise im Mailentwurf,
Antwortbelege und unabhängiges Abhaken umgesetzt. 82 gezielte Unit-Tests und
sechs echte Emulatorprüfungen erfolgreich, einschließlich Rechte-Trennung,
Antwortbelegen, paralleler Zählung und fehlertoleranter Versandbestätigung.
Lint, Build und Shared-Abgleich (42 Module) erfolgreich. Lokaler Browser als
Kurator ohne Handbuchrecht: Antworten ansehen, unterschiedliche Versandzustände,
Erledigen ohne Artikel, Abschlussbearbeiter/-datum und Wiederöffnen geprüft.
Die vier Dev-Beispiele wurden tatsächlich angelegt; ein zweiter Lauf bestätigte
die idempotente Anlage ohne Überschreiben. Keine Mail wurde als Test versendet.
Der angemeldete Dev-Durchlauf mit echter Mail und Modell bleibt offen.

Zusätzlich bereitzustellen: `updateKnowledgeGap`, `suggestMailboxReply`,
`getMailboxDraft`, `saveMailboxDraft`, `sendMailboxReply`, die drei Benutzer-
verwaltungs-Callables und beide Diagnose-Callables sowie Firestore-Rules.
