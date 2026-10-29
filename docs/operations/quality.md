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
Handbucheinträge werden mit Titel und Prozess/Handlung angelegt. „Anlegen und
öffnen“ führt direkt zur eigenen Detailseite unter `/qualitaet/handbuch/{entryId}`.
Situation, Folgen, Vorgehen und Vorbeugung werden dort jeweils einzeln bearbeitet;
Titel und Prozess sind über „Eintrag bearbeiten“ erreichbar. Der bestehende
Datenvertrag, Revisionsverlauf und Modulzugriff `handbook` bleiben erhalten.
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
