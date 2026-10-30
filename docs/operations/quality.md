# Qualität: K.V.P. und Handbuch

Stand: 29.10.2026. Dev-Release für K.V.P. und Handbuch. Produktionsfreigabe besteht nicht.

## Fachlicher Ablauf

Besprechungen werden mit Titel und Datum kurz angelegt und direkt unter
`/qualitaet/kvp/besprechungen/{meetingId}` geöffnet. Auf der Detailseite lassen
sich Protokoll, Teilnehmer und Themenzuordnung separat bearbeiten. Ein Protokoll
kann mehrere Themen derselben Abteilung betreffen. Beim Anlegen aus einer
Themenseite bleibt dieses Thema vorausgewählt; die Zuordnung wird erst auf der
Protokollseite erweitert. Listen und Themenseiten öffnen dieselbe Detailseite.
Der Datenvertrag, die Revisionssicherung und das Modulrecht `kvp` bleiben bestehen.

Die Oberfläche verwendet kurze Feld- und Aktionsnamen ohne dauerhafte Erklärtexte.
Handbuchartikel werden mit Titel und Kapitel angelegt. „Anlegen und
öffnen“ führt direkt zur eigenen Detailseite unter `/qualitaet/handbuch/{entryId}`.
Situation, Folgen, Vorgehen und Vorbeugung werden dort jeweils einzeln bearbeitet;
Titel und Kapitel sind über „Artikel bearbeiten“ erreichbar. Der bestehende
Revisionsverlauf und Modulzugriff `handbook` bleiben erhalten.
Die vier Inhaltskarten stehen untereinander. Darunter zeigt eine fünfte Karte
serverseitige letzte Bearbeitung und Bearbeiter sowie die separat
bearbeitbaren Kontrolltermine. Optionale Handbuchfelder `lastReviewedDate` und
`nextReviewDate` enthalten reale ISO-Daten; nächste Kontrolle darf nicht vor der
letzten liegen. Fehlende Felder aus Alt-Clients bleiben bei Speicherung erhalten.
Jede Speicherung erhöht wie bisher die technische Revision, auch bei Terminänderungen.
Eine Textänderung setzt kein Kontrolldatum automatisch.
Die optionale Zuständigkeit (`owner`, Freitextname bis 500 Zeichen) wird in
derselben Karte bearbeitet und über die Katalogsuche gefunden.
Ein gesetztes nächstes Kontrolldatum vor dem heutigen Berliner Kalendertag
markiert den Eintrag in Übersicht und Detail mit farbigem Rahmen und
„Kontrolle überfällig“. Heute fällige und undatierte Einträge bleiben unmarkiert.
Offene Seiten aktualisieren die Tagesgrenze minütlich und beim Fensterfokus.
Ältere Clients erhalten gespeicherte Zuständigkeiten bei ihren Änderungen;
Kontrolltermine und Zuständigkeit verleihen keine zusätzlichen Zugriffsrechte.

Die Startseite ist ein Katalog: standardmäßig alle Abteilungen, Volltextsuche über
die aktuellen Artikel, optionaler Abteilungsfilter und alphabetische Kapitel mit
kompakten, alphabetischen Artikellisten. Die Suche berücksichtigt auch Artikeltext
und Zuständigkeit. Ergebnisse nennen bei abteilungsübergreifender Ansicht die
Abteilung; überfällige Kontrollen bleiben markiert. Katalogsuche und Filter stehen
in der URL und bleiben beim Öffnen eines Artikels und Zurückkehren erhalten.
Kapitel nutzen das bestehende Feld `process`; vorhandene Inhalte werden unverändert
übernommen. Beim Anlegen und Zuordnen lassen sich bestehende Kapitel derselben
Abteilung auswählen oder neue Namen eingeben. Es gibt keinen separaten Kapitel-
Datenspeicher und keine Migration. Neue Artikel verlangen eine aktive Abteilung.
Die Revisionsnummer ist nur im separaten „Änderungsverlauf“ sichtbar. Auch Leser
können dort vollständige frühere Fassungen ansehen; Speichern ist dort gesperrt.
Der Katalog liest nur aktuelle Wurzeldokumente, keine historischen Fassungen.
Neue Themen werden nur mit Titel und optionaler Kurzbeschreibung angelegt und
anschließend direkt auf der Themenseite geöffnet. Die Kurzbeschreibung bildet
den ersten Plan-Text; sie führt kein zusätzliches Datenfeld ein.
Die Themenseite zeigt alle Durchläufe chronologisch untereinander. Jeder Durchlauf
hat eine eigene kompakte SMART-Karte mit S (spezifisch), M (messbar), A (erreichbar /
achievable), R (relevant) und T (terminiert). Die Eingabe erfolgt in einem Modal.
Plan enthält Problem und Ursachen; Do Maßnahmen, Verantwortung und Umsetzungszeitraum;
Check Erkenntnisse; Act die Entscheidung Korrigieren, Verwerfen oder Etablieren,
ein optionales Datum und Bemerkungen. Fragezeichen öffnen kurze
QMS-Hilfen, fachlich nach [ASQ](https://asq.org/quality-resources/pdca-cycle).
Die SMART-Begriffe folgen [SMART beim CDC](https://www.cdc.gov/training-development/php/about/design-training-learning-objectives.html).

Der Zyklusstart ist ein eigenes Datum und wird in der oberen Themenkarte sowie
am Durchlauf angezeigt. Er bezeichnet nicht den Do-Umsetzungszeitraum. „Erledigt“
schließt das gesamte Thema ab; zum Fortsetzen ist „Wieder öffnen“ erforderlich.
Lange Phasentexte lassen sich aufklappen. Frühere Durchläufe bleiben lesbar.

Die Menügruppe **Qualität** enthält zwei eigenständige Module:

- **K.V.P.** unter `/qualitaet/kvp`: Abteilung auswählen, eine Zeile je Problem,
  vier Spalten Plan, Do, Check und Act. Plan beschreibt Problem, Ursachen und
  Lösungsansatz sowie SMART-Ziel und Messkriterium. Do dokumentiert Maßnahmen
  und Durchführung, Check Ergebnisse und Wirksamkeit, Act die Entscheidung
  über Übernahme, Anpassung oder Verwerfen. Verantwortlicher, Beginn und
  Zieltermin gehören zum aktuellen Durchlauf. Probleme können aktiv, pausiert oder
  abgeschlossen sein. Jede Zeile öffnet die eigene Problem-Detailseite unter
  `/qualitaet/kvp/{problemId}`. Die Übersicht zeigt stets den aktuellen Durchlauf.
- **Handbuch** unter `/qualitaet/handbuch`: eigenständige Einträge nach Abteilung
  und Prozessabschnitt/Handlung, durchsuchbar auch nach Inhalten. Einträge enthalten
  Situation/Entstehung, mögliche Folgen, konkretes Vorgehen und Prävention/Milderung.
  Es gibt keine verpflichtende oder automatische K.V.P.-Verknüpfung.

Besprechungsprotokolle erfassen Datum, Teilnehmer und Freitext. Sie können mehrere
Probleme derselben Abteilung referenzieren. Die Verknüpfung betrifft den stabilen
Problemvorgang und bleibt auch bei weiteren PDCA-Durchläufen bestehen. Beim
Folgetreffen entsteht ein neues Protokoll; bestehende Probleme werden weitergepflegt.
Abteilungen stammen aus der
zentralen Abteilungsverwaltung, nicht aus einem zweiten Kategorienkatalog.

Ein neuer PDCA-Durchlauf erhöht die Durchlaufnummer, ergänzt eine weitere Zeile
und leert Phasen, SMART-Angaben, Act-Entscheidung und Umsetzungstermine. Der
Zyklusstart wird auf den aktuellen Berliner Kalendertag vorbelegt und ist bearbeitbar. Titel und Verantwortlicher bleiben erhalten. Vorherige
Fassungen sind im Änderungsverlauf vollständig lesbar. Auf der Detailseite sind
alle Durchläufe auf derselben Seite sichtbar: Der aktuelle Durchlauf lässt sich bearbeiten,
frühere Durchläufe sind nur lesbar. Für jeden Durchlauf wird seine jüngste
gespeicherte Fassung gezeigt; die einzelnen Bearbeitungen bleiben zusätzlich im
Änderungsverlauf erhalten. Bereits vorhandene Durchläufe werden aus den bestehenden
vollständigen Revisionsständen abgeleitet. Es wird kein zweiter Datenspeicher für
Durchläufe angelegt und es werden keine fehlenden Durchläufe erfunden.
Es gibt zunächst direkte
Speicherung ohne gesonderten Freigabeschritt und keine Löschfunktion.

## Speicherung und Rechte

`qualityTopics` und `qualityMeetings` verlangen Modulrecht `kvp`; `qualityHandbook`
verlangt `handbook`. `view` erlaubt Lesen einschließlich Verlauf, `edit` zusätzlich
Speichern. Aktives Profil erforderlich; Admin hat keinen allgemeinen Override.
Superadmin folgt dem bestehenden allgemeinen Moduloverride. Modulrechte gelten
für alle Abteilungen; dies führt keine zusätzliche Abteilungsberechtigung ein.
Neue Rechte werden bestehenden Nutzern nicht automatisch zugeteilt.

Direkte Browser-Schreibzugriffe bleiben gesperrt. Die App-Check-geschützte Callable
`saveQualityRecord` validiert erlaubte Felder, Längen, reale Datumswerte, Status,
Abteilung und Themenzuordnungen. Eine Transaktion prüft das aktuelle aktive Profil,
Bearbeitungsrecht und die erwartete Revision. Parallele Änderungen überschreiben
sich nicht still. Jede Speicherung erzeugt atomar eine vollständige unveränderliche
Fassung unter `revisions/{revision}` mit serverseitiger Zeit und Bearbeiter.
Abteilungszuordnungen bestehender Datensätze sind unveränderlich.

Optionale Themenfelder: `cycleStartDate`, `smartSpecific`, `smartMeasurable`,
`smartAchievable`, `smartRelevant`, `smartTimeBound`, `actDecision` und `actDate`.
Bisherige Ziel-/Messangaben bleiben als Ausgangswerte für S/M sichtbar; neue
SMART-Speicherungen halten die bisherigen Felder `goal`/`measure` für die Übersicht
konsistent. Bereits leere strukturierte Werte gelten als bewusst geleert.
Alt-Clients dürfen die neuen Felder weglassen: Im selben Durchlauf bleiben sie
erhalten; bei einem neuen Durchlauf werden sie zurückgesetzt. Bestehende
Revisionsstände bleiben unverändert. Datumswerte und Act-Entscheidungen werden
serverseitig geprüft; ein Act-Datum verlangt eine ausgewählte Entscheidung.

Technische Lade-, Speicher- und Verlaufsfehler laufen über die zentrale Diagnose
mit getrennten Modulen `kvp`/`handbook`, festen Aktionen und technischen IDs.
Protokollinhalte werden nicht in Diagnosemeldungen übertragen.

## Bereitstellung und offene echte Abnahme

### PDCA-Zeilen und SMART am 29.10.2026

20 gezielte Unit-Tests und 6 echte Firestore-Emulatorprüfungen erfolgreich,
zusätzlich Lint, Build und Shared-Abgleich (33 Module). Im lokalen Browser mit
Beispieldaten geprüft: drei Durchläufe auf derselben Adresse untereinander,
SMART-Bearbeitung mit Erhalt früherer Inhalte, QMS-Hilfe, Act-Entscheidung mit
Datum sowie Abschließen mit erhaltener Durchlaufhistorie. Keine echte
Benutzerabnahme oder flächendeckende visuelle Prüfung behauptet.
`saveQualityRecord` wurde gezielt in `db-bpl-drehpunkt-dev` aktualisiert.
Frontend folgt über Branch `dev`; Rules, Indizes und Produktion bleiben unverändert.

### Dev-Release am 29.10.2026

Der Release wurde getrennt von anderen lokalen Änderungen auf Basis von
`cf87cb8` zusammengestellt. Aktuelle Releaseprüfungen: Lint, Build,
`check:functions-shared` (29 Module), 53 gezielte Unit-/Vertragstests und
5 Firestore-Emulatorprüfungen gegen `demo-drehpunkt-quality` erfolgreich.
Der Build meldet weiterhin den bestehenden Hinweis zu großen Bundles.
Vor dem Push wurde der zwischenzeitlich aktualisierte Dev-Stand übernommen.
Danach waren Lint, Build, Shared-Abgleich (30 Module) und 24 gezielte Tests
erneut erfolgreich; die hinzugekommenen DyCoS-Änderungen bleiben erhalten.

Erfolgreich bereitgestellt in **`db-bpl-drehpunkt-dev`**, Region `europe-west3`:

- `saveQualityRecord`
- `reportClientDiagnostic` und `listDiagnosticsPage`
- `createManagedUser`, `updateManagedUser` und `listManagedUsers`
- Firestore Rules mit den drei Qualitätscollections und ihren Revisionsständen.

Die vorherigen live bereitgestellten Dev-Rules entsprachen dem Git-Ausgangsstand;
es wurden nur die Qualitätsregeln ergänzt. Nicht angemeldete Aufrufe von
`saveQualityRecord` und `reportClientDiagnostic` werden live mit HTTP 401 abgewiesen.
Neue Indizes, Storage-Regeln, Secrets oder Datenmigrationen sind nicht erforderlich.

Frontend-Ziel des Dev-Pushs: **`https://dev.drehpunktlogistik.de`**, Vercel-Branch
`dev`, Preview-Konfiguration mit `VITE_FIREBASE_PROJECT_ID=db-bpl-drehpunkt-dev`.
Vercel-Deploymentstatus und Auslieferung sind nach dem Push zu kontrollieren.
Der echte Ablauf mit angemeldetem Benutzer bleibt ausdrücklich zur Abnahme offen.
Modulrechte werden bestehenden Benutzern nicht automatisch erteilt; Superadmins
besitzen den vorhandenen Moduloverride. Produktion wird durch diesen Release nicht verändert.

### Vorherige lokale Implementierungsprüfungen

Lokal geprüft am 29.10.2026: Lint und Build für die Erweiterung um Problem-Detailseiten
erfolgreich (Build mit dem bestehenden Hinweis zu großen Bundles). Die 11 gezielten
Tests für Durchlaufgruppierung, Links, Datenvalidierung, Revisionskonflikte und
Besprechungszuordnung sind erfolgreich. Bei der ursprünglichen Modulimplementierung
liefen 55 Unit-/Vertragstests sowie die Qualitäts-Rechteprüfung im Firestore-Emulator gegen
`demo-drehpunkt-quality` erfolgreich: 5 Tests einschließlich Untertests, keine
übersprungen. Sie prüft Lesen/Listen/Verlauf, verweigerte direkte Schreibzugriffe
und transaktionale Speicherung bei inaktiven Abteilungen.

Die Oberfläche wurde im Browser mit lokalen Beispieldaten und ersetzten
Datenzugriffen geprüft: vier Spalten, direktes Öffnen der Check-Phase,
Protokollzuordnung, Handbuchformular, Deutsch/Englisch, helles/dunkles Theme,
Escape-Rückfrage bei Änderungen und Fokusrückkehr. Dies ist keine echte
Anmeldung oder End-to-End-Prüfung der Dev-Functions.

Die Erweiterung wurde zusätzlich im Browser mit lokalen Beispieldaten geprüft:
Übersicht → eigene Problemadresse → Rückkehr zur ausgewählten Abteilung,
Auswahl früherer Durchläufe ohne Bearbeitungsaktionen, Anlegen eines dritten
Durchlaufs mit unveränderten früheren Inhalten, Anlegen eines zweiten Problems
mit eigener Adresse sowie ein gemeinsames Protokoll für beide Probleme mit
Navigation zwischen den Vorgängen. Detailseite in Deutsch/Englisch und beiden
Themes geprüft. Die Datenzugriffe waren dabei ersetzt; echte Dev-Abnahme bleibt offen.

Für eine beauftragte Dev-Veröffentlichung gemeinsam berücksichtigen: Frontend,
`saveQualityRecord`, `reportClientDiagnostic`, Kontenverwaltung mit neuer Modulliste
und Firestore Rules. Ziel ausdrücklich `db-bpl-drehpunkt-dev`; keine automatische
Veröffentlichung durch diese Implementierung. Abteilungsfilter verwenden einfache
Firestore-Abfragen ohne zusätzlichen zusammengesetzten Index. Die Problem-Detailseite
lädt Besprechungen über den einfachen `array-contains`-Index auf `topicIds`.
Keine neuen Storage-Pfade. Die aktuellen optionalen Zyklusfelder erfordern die aktualisierte Callable
`saveQualityRecord`; Berechtigungen und Rules bleiben unverändert.

Vor echter Abnahme prüfen: Themen und Protokolle mit mehreren Themen anlegen,
Folgetreffen dokumentieren, Phasen bearbeiten, zweiten Durchlauf und Verlauf öffnen,
Handbuch pflegen/suchen, Parallelbearbeitung und verweigerte Schreibzugriffe,
ungespeicherte Eingaben, Tastaturbedienung sowie Deutsch/Englisch und beide Themes.
Ein erfolgreicher Build bestätigt diese echten Benutzerabläufe nicht.


### Handbuch-Karten und Kontrolltermine am 30.10.2026

Vier Inhaltskarten untereinander, darunter Revision/Bearbeitungsdaten und
Kontrolltermine. Lint, Build, Shared-Abgleich (38 Module) und 21 gezielte
Unit-Tests erfolgreich. Die sechs bestehenden Emulatorprüfungen bestanden;
der Emulator meldete beim anschließenden Herunterfahren einen Requestfehler.
Ein angemeldeter Browserdurchlauf für die neuen Kontrolltermine steht noch aus.

### Zuständigkeit und überfällige Kontrollen am 30.10.2026

Optionale Zuständigkeit sowie farbige und textliche Überfällig-Markierung in
Handbuchübersicht und Detail ergänzt. 22 gezielte Unit-Tests und sieben echte
Firestore-Emulatorprüfungen einschließlich alter Clients, unveränderlicher
Revisionen, Paralleländerungen und verweigerten Schreibrechten erfolgreich.
Lint, Build und Shared-Abgleich (38 Module) erfolgreich. Ein angemeldeter
Browserdurchlauf ist weiterhin offen. Dev benötigt Frontend und die aktualisierte
`saveQualityRecord`; Rules, Indizes und Produktion werden nicht geändert.

### Handbuchkatalog am 30.10.2026

Katalog mit Kapiteln und Artikellisten, Volltextsuche, Abteilungsfilter,
Kapitelvorschlägen und separatem lesbarem Änderungsverlauf umgesetzt. Bestehende
Artikel und Fassungen unverändert erhalten. 23 gezielte Unit-Tests, sieben
Firestore-Emulatorprüfungen, Lint, Build und Shared-Abgleich (39 Module) erfolgreich.
Lokaler Browser mit Beispieldaten: Suche, Abteilungsfilter, Artikelerstellung,
vorhandenes/neues Kapitel, Rückkehr mit Suchzustand und frühere Fassung geprüft;
Deutsch und Englisch textlich geprüft, ohne Bildvorschauen. Angemeldeter
Dev-Browserdurchlauf bleibt offen. Nur Frontend-Veröffentlichung erforderlich;
Backend, Rules, Indizes und Datenmodell bleiben unverändert.
