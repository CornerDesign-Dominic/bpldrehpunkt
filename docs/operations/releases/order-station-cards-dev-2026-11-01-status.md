# Stationskarten und zusätzliche Transportdaten: Dev-Release 01.11.2026

Ausdrückliche Nutzerfreigabe: Hervorhebungen auf Rand/linken Streifen begrenzen,
Palettentausch Ja ebenfalls markieren, FIX in der Uhrzeitschrift anfügen und
den gesammelten Stand auf Dev veröffentlichen. Main und Produktion bleiben
unberührt. Ziel: `https://dev.drehpunktlogistik.de`, Firebase
`db-bpl-drehpunkt-dev`, Region `europe-west3`.

## Umfang und Integration

- Lokale Folgecommits `d292736` und `92629fb`: Reiter „Auftrag“ / „Kunde & UTN“,
  deutliche allgemeine Auftragsdaten, getrennte Stationskarten sowie zusätzliche
  bestätigte DyCoS-Daten einschließlich Importhistorie.
- `d9430f1`: markierte Karten behalten dieselbe neutrale Fläche. Gelber Rand und
  linker Streifen gelten bei neutraler Abholung/Anlieferung für die Adresse,
  bei Fixtermin für den Termin und bei Palettentausch true für dessen Karte.
  Referenzen bleiben neutral. Die separate Fixtermin-Ja/Nein-Zeile entfällt;
  bestätigtes true ergibt „ - FIX“ nach der Uhrzeit. FIX hat dieselbe Schrift,
  Größe und Stärke wie die Uhrzeit, nur seine Farbe unterscheidet sich.
- Der veröffentlichte Reminderstand `445fa65` wurde in `bb67ca1` übernommen.
  Die während der Vorbereitung veröffentlichten Profilreiter `5b174b1` wurden
  zusätzlich in `f0039ed` erhalten; nur Frontend-/Dokumentationsdateien betroffen.
  Der ursprüngliche Desktop-Arbeitsstand wurde nicht verändert.

Warenbeschreibung je Auftrag/Station, Fahrzeughinweise, Gefahrgutkennzeichen,
separates Stations-Volumengewicht und getrennte DyCoS-Kilometer für Auftrag und
Tour werden übernommen. Unbekannt bleibt von 0/false getrennt. Kilometer sind
Quellenwerte und keine bestätigte tatsächliche Fahrstrecke; Volumengewicht ist
kein Ersatz für physisches Gewicht. Maße-/Temperatur-/Volumeneinheiten und
weitere unbestätigte Feldbedeutungen bleiben offen, siehe
[Feldklärung](../../reference/dycos-feldklaerung-2026-10-31.md).

## Releaseprüfungen

- 71 gezielte Backendprüfungen und 30 echte Firestore-Emulatorprüfungen
  erfolgreich, 0 Fehler/übersprungen. Demo-Projekt `demo-drehpunkt-order-fields`,
  Port 8193, anschließend beendet. Geprüfter Backendstand `bb67ca1`; die spätere
  Profilübernahme ändert keine Functions.
- 16 Client-/Darstellungsprüfungen erfolgreich. Vollständiges ESLint und Build
  nach Integration erfolgreich; alle 45 deploybaren Shared-Module abgeglichen.
  Bekannte Firebase-Bundlewarnung unverändert.
- Synthetischer Browserablauf mit echten Komponenten: Kartenflächen identisch,
  getrennte Randmarkierung für Adresse/Termin/Palettentausch, Referenz neutral,
  FIX direkt nach der Uhrzeit. Schriftfamilie, Größe 20 px und Stärke 700 von
  Uhrzeit und FIX stimmen überein; ausschließlich FIX-Textfarbe abweichend.
  Keine echten Testmails oder künstlichen Nutzerkonten.

## Bereitgestelltes Backend

```powershell
firebase deploy --only "functions:fetchDycosTransportOrder,functions:refreshTransportOrderWorkspace" --project db-bpl-drehpunkt-dev --non-interactive
```

Beide Functions erfolgreich aktualisiert und aktiv. Vorher-/Nachher-Abgleich:
187 Dev-Functions, genau die zwei genannten Codehashes geändert, übrige 185
unverändert. Keine Function hinzugefügt oder entfernt. Keine weiteren
Reminder-/Mail-Endpunkte, Rules, Indizes, Storage oder Secrets bereitgestellt.
Lesende Rechnungsprüfungs-Fallbacks werten diese Transportdetails nicht aus und
persistieren sie nicht; sie benötigen für diesen Umfang keinen neuen Rollout.

Die optionalen Zusatzfelder werden für bestehende Aufträge beim nächsten
Auftragsabruf nach Backendbereitstellung gespeichert. Kein Massenimport,
keine neue Routingberechnung, keine zusätzliche Flow-Anfrage eingeführt.

## Frontend und Rückweg

Frontend wird mit diesem Releasebeleg ausschließlich nach `dev` gepusht;
Vercel-Status am veröffentlichten Commit separat kontrollieren. Vorheriger
Remote-Dev-Stand: `5b174b10195dcb3a6e626852218be0396e49af90`, erfolgreicher
Vercel-Status vor dem Push bestätigt. Auf diesen Stand kann das Frontend
zurückgestellt werden; bei Bedarf dieselben zwei Importfunktionen daraus
gezielt erneut nach Dev bereitstellen. Bereits übernommene optionale Felder
und Historien nicht löschen. Frontend-Rückkehr setzt Backend nicht zurück.

Remote-`main` vor Beginn unverändert:
`230c2ad86af9700118e2f1456746292241461efc`. Keine Übernahme nach Main, kein
Produktionsdeploy und keine Änderung von Produktionsdaten/-konfiguration.

## Nachtrag: kompaktere Karten

Nach Rückmeldung aus der Dev-Abnahme wurde die bestehende Kartenstruktur in
`c5d35f5` verdichtet: kleinere Abstände/Schriften, Datum und Uhrzeit in einer
flexibel umbrechenden Zeile, Referenz und Palettentausch als schmale Einzelkarten.
Allgemeine Karten stehen bei ausreichender Breite nebeneinander; Quellenwerte,
Hinweise, Markierungsregeln und FIX-Typografie bleiben erhalten. Die währenddessen
bereits auf Dev vorhandenen Wissens-/Profiländerungen bis `67f2587` wurden
konfliktfrei übernommen, keine fremden Änderungen zurückgenommen.

Identische synthetische Daten: Kopfbereich 338 auf 181 Pixel, zwei Stationen
425/442 auf 261/273 Pixel. Lint und Build für den kombinierten Stand und der
Shared-Abgleich sind Teil der Vorprüfung; für diese reine Oberflächenkorrektur
werden keine Functions, Rules oder Indizes neu bereitgestellt. Der Frontend-Push
bleibt ausschließlich auf Dev, Vercel-Erfolg am veröffentlichten Commit prüfen.

## Aktualisierung in der Reiterleiste, 01.11.2026

Die fortlaufende Dev-Korrektur verschiebt Zeitpunkt und Aktualisierungsaktion
für Übersicht, Auftrag, Kunde & UTN und Finanzen nach rechts in die gemeinsame
Reiterleiste. Der Zeitpunkt bleibt nicht interaktiv; „Aktualisieren“ bleibt ein
Button mit bisherigen Bereichen, Rechten und Sperre während eines Abrufs.
Die separate Werkzeugzeile und deren Historienlink entfallen. Die Historie
bleibt über ihren Fachreiter erreichbar; der Hinweis bei fehlenden Finanzbelegen
nennt die neue Aktion. Trackingaktionen bleiben unverändert.

Prüfung dieses Folgestands: Lint, Build und Shared-Abgleich (45 Module) bestanden;
8 bestehende Tests zu Navigation und Aktualisierungsdarstellung bestanden.
Lokale Browserprüfung mit ausschließlich synthetischen Daten: Gesamtauftrag,
Geschäftspartner und Auftragsdaten über die neue Aktion abgerufen, die passenden
Historieneinträge und den Zeitpunkt bestätigt; Leserechte, Englisch/Light und
Dark geprüft. Bei 545 px Inhaltsbreite Umbruch ohne horizontalen Überlauf.
Keine neuen Backend-, Rules-, Index- oder Datenänderungen erforderlich.

## Linke Tracking-Aktionsspalte entfernt, 01.11.2026

Die bereits nach Finanzen/Übersicht verlegten Rechnungsprüfungen, Fälle,
Palettenbewegungen und To-dos werden im Trackingreiter nicht länger dupliziert.
Der bestehende DyCoS-Abruf sitzt jetzt rechts in der gemeinsamen Reiterleiste;
sein Importzeitpunkt ist reiner Text. Strecke und Pausieren/Fortführen/Abschließen
stehen kompakt direkt vor dem Zeitstrahl. Übrige Trackinginhalte bleiben erhalten.
Es handelt sich ausschließlich um Frontendänderungen; keine neuen Functions,
Rules oder Indizes und keine Datenmigration erforderlich.

Vor Zusammenführung geprüft: Lint, Build, Shared-Abgleich (45 Module), 7 bestehende
Tests zu Lebenszyklus, Importfeedback und Reitern erfolgreich. Lokale Browser-
prüfung ausschließlich mit synthetischen Daten: Pause/Fortführen/Abschluss samt
Bestätigung und deaktivierten Aktionen nach Abschluss, Abruf mit gesperrtem
Button während der Anfrage, genau eine Aktion nach Reiterwechsel, Strecke mit
470 km/Fahrzeitschätzung, Leserechte, Light/Dark und Umbruch bei 545 px ohne
horizontalen Überlauf. Keine echten Trackingzustände für die Prüfung verändert.

Der kombinierte Stand `8b113b2` enthält die bereits veröffentlichten Dev-Änderungen
bis `7cd3f25`, insbesondere den ausdrücklich gesetzten Abrufmodus `refresh`.
Nach Zusammenführung Lint, Build und Shared-Abgleich erneut erfolgreich;
Auftragsabruf in der lokalen Browserprüfung erneut bestätigt. Für diese reine
Layoutkorrektur erfolgt nur der Dev-Frontend-Push, kein weiterer Backenddeploy.

## Stationsinfos im Trackingstil und Reiterreihenfolge, 01.11.2026

Je Station stehen nun zwei Karten in den Abschnittsfarben der Sendungsverfolgung:
links Adresse, Termin und Referenz; rechts Bemerkung, Warenbeschreibung/Mengen,
Palettentausch und gegebenenfalls Lieferscheinnummer. Die vielen neutralen
Innenrahmen entfallen; gezielte gelbe Feldrahmen bleiben erhalten. Stationen
stehen weiterhin untereinander mit dezenten Trennlinien; Daten und Quellregeln
wurden nicht verändert.

Sichtbare Navigation: Übersicht, Auftrag, Sendungsverfolgung, Kunde & UTN,
Finanzen, Zugeordnete Mails, Historie. Die Routen behalten ihre stabilen Werte;
Mails bleibt eine separate Dialogaktion. Die Pfeilnavigation der Fachreiter
folgt der neuen fachlichen Reihenfolge.

Lint, Build, Shared-Abgleich (45 Module) und 11 bestehende Tests zu Reitern,
Stationsdarstellung und Hervorhebungen erfolgreich. Lokale Sichtprüfung mit
kompakten und umfangreichen Beispieldaten, gelben Akzenten ohne Flächenfärbung,
allen Mengen einschließlich null und einer 545-px-Ansicht ohne horizontalen
Überlauf. Ausschließlich Frontend; kein Backenddeploy, keine Datenmigration.

## Allgemeine Karte und gelbe Wörter, 01.11.2026

Die rechte Stationskarte heißt unabhängig vom Stationstyp „Hinweis & Ware“.
Die allgemeinen Auftragsdaten nutzen die Abschnittsfarbe und Feldtypografie
der Stationskarten, ohne zusätzliche neutrale Innenrahmen; alle vorhandenen
Fahrzeug-, Waren-, Mengen-, Hinweis- und Streckenwerte bleiben sichtbar.
Bei Palettentausch true wird zusätzlich das Wort „Ja“ gelb; Nein/unbekannt
bleiben neutral. FIX hinter der Terminzeit behält seine Schrift und gelbe Farbe.
Ein einzelnes Wort FIX in der Stationsbemerkung wird ebenfalls gelb dargestellt;
dies ist nur Textformatierung, ohne Änderung oder Ableitung des DyCoS-Flags.

Aktuellen Dev-Stand `3c322c0` vorher übernommen. Lint, Build, Shared-Abgleich
(45 Module) und 8 vorhandene Tests zu Stationshinweisen/-darstellung erfolgreich.
Lokale Browserprüfung mit strukturiertem Fixtermin, Freitext-FIX bei nicht gesetztem
Flag, Palettentausch true/false, vollständigen Hinweisen und optionalen DyCoS-
Streckendaten. Gelbe Texte in Light/Dark bestätigt; bei 545 px Inhaltsbreite kein
horizontaler Überlauf. Keine Backend-/Rules-/Indexänderung oder Datenmigration.

## Kompakte fehlende Feldwerte, 01.11.2026

Der Reiter Auftrag zeigt einzelne fehlende Werte einheitlich als „—“ statt
„Nicht übermittelt“ oder wiederholter langer Leertexte. Erklärung per title
und Screenreader; Englisch „Not provided“. Vorhandene Nullwerte und Nein bleiben
sichtbar. Globale Leerzustände und fachliche Quellwarnungen bleiben ausführlich.

Lint, Build, Shared-Abgleich (45 Module) und 8 vorhandene Darstellungs-/Hinweistests
bestanden. Lokale Browserprüfung: kompakte Platzhalter, title und unsichtbarer
Screenreadertext, englische Erklärung sowie unveränderte 0 kg/0 m/Nein.
Nur Frontend; keine Backend-, Rules-, Index- oder Datenänderung erforderlich.

## Zusatzhinweis zum Volumengewicht entfernt, 01.11.2026

Auf Nutzerwunsch entfällt „Zusätzlicher Quellwert; Berechnungsgrundlage nicht
übermittelt.“ unter den Stationswerten. Volumengewicht, Einheit und bisherige
Anzeige vorhandener Nullwerte bleiben unverändert. Unbenutzte Übersetzung und
Hinweisstil entfernt. Lint, Build und Shared-Abgleich (45 Module) erfolgreich;
kein Backend-/Rules-/Indexdeploy erforderlich. Aktuellen Dev-Stand ad72002 erhalten.

## Volumengewicht durch Maßfeld ersetzt, 01.11.2026

Volumengewicht wird in der Auftragsansicht nicht mehr ausgegeben. Dort steht
stattdessen „Maße (L × B × H): —“, ohne erfundene Maße oder Einheiten. Eine
Maßequelle ist noch offen: 13 vorhandene JSON-Exporte enthalten 22 leere
Stationsfelder Masse und keine eigenen befüllten Längen-/Breiten-/Höhenfelder.
Maße in Bemerkungen bleiben vollständig. Bestehende importierte Daten und
Historien werden nicht gelöscht, Backendmapping unverändert.

Aktuellen Dev-Stand f33c06a vorab erhalten. Lint und Build nach Bereinigung eines
doppelten Übersetzungseintrags erfolgreich; Shared-Abgleich (45 Module) ebenfalls
bestanden. Keine Functions, Rules oder Indizes für diese Anzeigeänderung nötig.
Ein befülltes echtes DyCoS-Beispiel wurde zur Klärung von Quelle/Einheit angefragt.
