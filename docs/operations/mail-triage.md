# Maileinordnung und Qualitätsrückmeldungen

Stand: 05.11.2026. Erster Bau ausschließlich lokal, nicht auf Dev oder Produktion
veröffentlicht. Ergänzt bestehende Postfachaktionen, ersetzt keine Fachauswertung.

## Eingang und Entscheidung

Die vorhandene Webhook-Verarbeitung bleibt erhalten: nur neue Nachrichten in
aktivierten Postfächern, fünf Minuten Frischegrenze, keine Postfachsuche oder
rückwirkende automatische Auswertung. Gemeinsame Postfächer teilen die Einordnung.
Neue strukturierte Entscheidungen beantworten Thema, Mitteilungsart, erforderliche
Handlung, Termin/Frist und Referenzen. Antworten und bis zu drei Aktionsvorschläge
enthalten kurze validierte Originalfundstellen mit Quelle; die Einordnung behauptet
keine Datenbank-Aktenzuordnung. Mehrsprachige Inhalte bleiben zulässig; Fristen
und Referenzen werden wörtlich übernommen, keine Fristen erfunden oder berechnet.

Der aktuelle Mailtext ist führend. Bei ausdrücklichen Weiterleitungen wird der erste
weitergeleitete Block berücksichtigt; alter Antwortverlauf begründet keine neue
Handlung. Status unterscheidet Handlung erkannt, nur Information, unklar und
unvollständig. Technische Auswertungsfehler sind separat von fehlender Einordnung
sichtbar. Nur belegte Empfehlungen mit hoher Sicherheit färben Aktionsbuttons.

Bei fehlendem entscheidendem Kontext darf die begrenzte Anhangssichtung auch nach
sicherer Fachgebietserkennung erfolgen. Grenzen bleiben zwei Anlagen, bei PDF die
ersten zwei Seiten, 6.000 Zeichen je Auszug und der bisherige Zeit-/Größenrahmen.
Auszüge gelten ausdrücklich als teilweise berücksichtigt. Ausgelassene/unklare
Anhänge und abgeschnittener Mailtext werden kenntlich gemacht. Ein Anreicherungsfehler
erhält eine zuvor sicher erkannte Empfehlung und kennzeichnet Unvollständigkeit.
Es gibt weiterhin maximal zwei Einordnungsaufrufe pro Nachricht, keine freie Schleife.
Das strukturierte Ergebnis verwendet bis 2.400 Ausgabetokens statt früher 500.

Gespeichert wird genau eine aktuelle Einordnung am bestehenden Nachrichtenbeleg
unter mailboxRecommendationScopes/{scope}/messages/{messageHash}: Entscheidung,
begrenzter Betreff, stabile Entscheidungs-ID, Schema-/Promptversion, Modell und
Quellenumfang. Keine Originalmail oder Binäranhänge werden dafür kopiert.
Die bestehende Liste liefert weiterhin recommendations; zusätzlich decisions und
decisionStates. Alte Belege ohne strukturierte Daten bekommen keine erfundenen
Erklärungen. Bei fehlender Einordnung ist der manuelle Start weiterhin möglich.

## Vorschau und unveränderter Fachablauf

Ein erster Klick auf eine noch nicht gestartete Fachaktion öffnet die kompakte
Maileinordnung: Frage links, Ergebnis rechts; Fundstellen und Begründung aufklappbar.
Aktion starten bestätigt den ursprünglichen Handler, einschließlich bisheriger
Dateiauswahl-/Zuordnungsdialoge und Startparameter. Erst der anschließende bestehende
Aktionsjob wertet Originalmail und Anhänge fachlich aus. Die kurze Ersteinschätzung
ersetzt dabei keine vollständige Quellenprüfung oder Datenbankzuordnung.

Auch manuell gewählte Aktionen erhalten diese Vorschau. Bereits laufende Jobs,
vorhandene Ergebnisse, Übernahmeformulare und gezielte Neuauswertungen bleiben in
ihrem bisherigen Ablauf. Schreiben/Antworten gehören nicht zur Einordnungssperre.
Schließen oder Verwerfen startet keine Fachauswertung. Mehrfachklicks starten
keinen zweiten Job; ein Mailwechsel verwirft die offene Bestätigung. Fachliche
Übernahmen, Neuanlagen, Buchungen, Versand und Erinnerungen bleiben ausdrücklich
an ihre bestehenden Bestätigungen gebunden.

## Rückmeldung und Unterdrückung

Empfehlung verwerfen verlangt einen Auswahlgrund; bei Andere Aktion erforderlich
auch die richtige Aktion, bei Sonstiger Grund einen Kommentar. Ergänzung optional,
maximal 2.000 Zeichen. Bei manuellem Start kann eine übersehene Empfehlung gemeldet
werden. Die Rückmeldung kopiert ausschließlich die serverseitig gespeicherte,
begrenzte Entscheidung, keine clientseitig behaupteten Fundstellen. Veraltete
Entscheidungs-IDs werden abgewiesen. Fehlt bei einer übersehenen Empfehlung ein
Nachrichtenbeleg, wird die Existenz der Mail im eigenen Postfach überprüft.

mailboxTriageFeedback enthält diese Beispiele mit Betreff, Postfach, Ursache,
Korrektur, Version, Zeit, Bearbeitungsstand und Auswertungsnotiz. Keine opaque
Graph-Nachrichten-ID und kein Originalmail-Link werden an Qualität ausgegeben.
Die stabile ID verhindert doppelte Rückmeldungen bei Wiederholung. Kleine
nutzerspezifische Zustandsbelege unter mailboxTriageFeedbackStates unterdrücken
die verworfene Aktion weiterhin, auch nach Bereinigung der Rückmeldung. Andere
Nutzer und andere Empfehlungen derselben Mail bleiben unverändert.

## Qualitätsreiter und Rechte

/qualitaet/maileinordnung ist ein eigenständiger Fachreiter. mailTriageQuality=view
liest, edit bearbeitet Stand und Auswertungsnotiz. mailTriageCleanup=edit erlaubt
zusätzlich zur Lesefreigabe die Bereinigung. Beide Rechte starten bei none und
werden über die bestehende Rechteverwaltung vergeben; der bestehende
Superadmin-Vorbehalt der Rechtevergabe wird nicht erweitert. Qualität benötigt
keinen Postfachzugriff und erhält dadurch auch keinen solchen Zugriff, nur die
ausdrücklich freigegebenen gesammelten Auswertungsdaten. Originalmails bleiben im
normalen Postfachrecht. Direkter Firestorezugriff auf die beiden neuen Collections
ist selbst für Superadmins gesperrt; nur Callables verwenden die Daten.

Die Liste filtert Zeitraum (Berliner Kalendertage), Postfach, Aktion, Rückmeldungsart
und Stand. Sie liest höchstens 51 Belege je Anforderung in Dokument-ID-Reihenfolge,
filtert eine 50er-Seite und zeigt bei Bedarf einen nächsten Cursor, auch bei leerer
Filterseite. Geladene Anzahl ist keine Gesamtzahl. Es werden keine Vollscans oder
zusätzlichen zusammengesetzten Indizes benötigt. Einzelne oder höchstens 50
explizit ausgewählte geladene Beispiele können nach Anzahlbestätigung atomar
gelöscht werden. Revisionen verhindern veraltetes Bearbeiten/Löschen.

Bereinigung entfernt die Feedbackkopien, nicht Mails, aktuelle Postfacheinordnung,
Akten, Aktionsjobs oder eingeführte Verbesserungen. Die kleinen Unterdrückungs- und
Wiederholungsmarker bleiben bestehen; eine bereinigte Rückmeldung wird durch einen
identischen Retry nicht neu erzeugt. Es gibt keine automatische Löschfrist und
keine automatische Promptänderung oder Modellschulung durch eine Ablehnung.

## Diagnose und spätere Bereitstellung

Technische Fehler nutzen die bestehende zentrale Diagnose ohne Mail-/Kommentarinhalt:
mailboxes/recommendation-classification, triage-feedback, triage-quality;
mailTriageQuality/load, save, delete. Fachliche Validierung und Revisionskonflikte
werden nicht pauschal als technische Störung protokolliert.

Bei einer später freigegebenen Dev-Veröffentlichung gemeinsam berücksichtigen:
Frontend, Firestore-Rules, processMailboxRecommendationRun, listMailboxRecommendations,
submitMailboxTriageFeedback, listMailboxTriageFeedback, updateMailboxTriageFeedback,
deleteMailboxTriageFeedback, reportClientDiagnostic und die Benutzerverwaltung
(listManagedUsers, createManagedUser, updateManagedUser), damit die neuen Rechte
vollständig gelesen und vergeben werden. Keine neuen Secrets oder Microsoftrechte.
Die bereits lokal vorbereiteten Rechnungsänderungen benötigen bei gemeinsamer
Freigabe zusätzlich ihre dokumentierten Functions; sie sind hier nicht veröffentlicht.

## Lokaler Prüfstand

Abschlussprüfung: 239 gezielte Unit-/Regressionsprüfungen bestanden, keine
übersprungen. Vollständiges Lint, Vite-Build, Syntaxprüfung der Functionsexporte
und Abgleich von 46 deploybaren gemeinsamen Modulen erfolgreich. Echter Firestore-Emulatorlauf:
24 Tests erfolgreich ohne übersprungene Tests, einschließlich eigener Rules-Sperren,
Nutzertombstones, atomarer Bereinigung und weiter les-/bearbeitbarer Fachdatensätze
aller fünf Fall-/To-do-/Kalenderaktionen. Dateien laufen sequenziell, weil der
bestehende Subscription-Maintenance-Test bewusst alle aktiven Testscopes behandelt.
Vier echte Modellproben mit ausschließlich synthetischen Texten: Rechtsstreit mit
Termin/Aufgabe erkannt; erledigte Nachricht ohne Handlung; polnische Rechnung erkannt;
Anwaltssignatur ohne Gerichtszuordnung. Keine echten Fälle oder Mails angelegt.

Lokaler Browserlauf mit Testdaten und echten UI-/Storekomponenten bestätigt
Vorschau ohne Start, Verwerfen mit Grund, Qualitätsauswertung, gespeicherte Notiz,
Leserrechte, gezielte Bereinigung, weiter neutrale verworfene Aktion, manuellen Start
exakt einmal und bestehende Ergebnisbearbeitung einschließlich Abschluss/Wiederöffnung.
DE/EN und Light/Dark geprüft. Echte Ende-zu-Ende-Abnahme mit veröffentlichtem Backend
und neuen eingehenden Mails bleibt bis zur späteren Dev-Freigabe offen.
