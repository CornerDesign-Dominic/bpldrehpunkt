# Mailbasierte Vorgänge

Stand: 01.11.2026. Nur Dev, Firebase `db-bpl-drehpunkt-dev`.

## Bedienung

Die Aktionen To-do, Schaden, Inkasso, Gericht und Kalender analysieren die
Eingangsmail und unterstützte Anhänge im Hintergrund. Die neueste Nachricht hat
Vorrang. Laufende Aktionen zeigen blaue Ladekreise und gesperrte Buttons; fertige
Vorschläge gelbe Koffer. Es öffnet sich niemals automatisch ein Dialog.

Beim bewussten Öffnen stehen Mail und Dokumente links, Zuordnung und Vorschläge
rechts. Der Nutzer entscheidet zwischen Neuanlage und bestehendem Eintrag.
Automatische Treffer sind Vorschläge; eine manuelle Suche mit Folgeseiten steht
zusätzlich bereit. Der automatische Abgleich umfasst höchstens 500 Einträge pro
Kategorie bzw. 500 Termine je bearbeitbarem Kalender, höchstens 20 Kalender.
Eine Begrenzung wird angezeigt.

Bei bestehenden Einträgen stehen bisherige und vorgeschlagene Werte paarweise
auf gleicher Höhe. Nur ausgewählte Felder werden geändert. Alternativ kann der
Nutzer lediglich dokumentieren oder ausdrücklich abschließen. Schadenabschluss
bedeutet wirtschaftlich erledigt. Terminabsagen kennzeichnen den vorhandenen
Termin als abgesagt und löschen ihn nicht. Neue To-dos sind dem Nutzer selbst
zugewiesen. Kalenderaktionen schreiben ausschließlich in Drehpunkt.

Erst die ausdrückliche Bestätigung speichert. Danach sind Koffer und Button grün;
das Ergebnis mit übernommenen Werten und Verknüpfung bleibt abrufbar. Schließen
erhält Vorschläge, Verwerfen setzt offene Vorschläge auf neutral zurück.

## Quellen und Grenzen

PDFs verwenden Texterkennung und bei fehlendem Text OCR über den vorhandenen
PDF/OCR-Dienst. Bilder (PNG, JPEG, WebP) werden auf sichtbare Angaben ausgewertet;
Textdateien werden gelesen. Erkennbare eingebettete Signaturbilder werden
übersprungen, unbekannte eingebettete Fotos und PDFs nicht. Nicht unterstützte
oder unlesbare Anhänge erzeugen ausdrückliche Hinweise, die vor der Übernahme
bestätigt werden müssen. Die Quellenübersicht kennzeichnet reine OCR.

Grenzen: 20 Anhänge, 5 MB je Datei, 20 MB insgesamt, 100 PDF-Seiten, 160.000
Quellzeichen und 20 Vorgangsauswertungen je Nutzer und Stunde. Überlange bzw.
unvollständige Anhängelisten werden nicht stillschweigend gekürzt. Herkunft und
wörtlicher Quellenbeleg werden je KI-Feld geprüft; unbelegte oder ungültige
Werte entfallen mit Hinweis. Datums-, Zeit- und Betragsformate werden validiert.
Fehlende Umsatzsteuer wird nicht automatisch als null angenommen.

Anhänge bleiben in Outlook. Binärdateien werden nur zur Auswertung abgerufen,
nicht in Vorgangsdatensätzen oder Auswertungsbelegen gespeichert. Es werden
Quellenmetadaten, bestätigte Werte und relevante Belegauszüge gespeichert.

## Fachliche Speicherung und Rechte

Vorgänge verwenden die vorhandenen nativen Collections, Schemas und Jahreszähler.
Die bestehenden Firestore-Regeln bleiben unverändert. Bearbeitungsrechte des
Zielmoduls sind erforderlich; To-do-Sichtbarkeit und Bearbeiterrechte sowie
individuelle Kalenderfreigaben werden zusätzlich geprüft. Systemkalender sind
ausgeschlossen. Für neue Inkassofälle wird ein vorhandenes Unternehmen mit
bestätigter Rolle aus den Stammdaten ausgewählt.

Inkassorechnungen werden als native Rechnungszeilen mit Netto, Umsatzsteuer und
Brutto angelegt. Bestehende Rechnungen und Zahlungen bleiben erhalten; doppelte
Rechnungsnummern werden abgewiesen. Forderungssummen werden atomar angepasst.
Fristen werden in den vorhandenen Untercollections gespeichert. Erinnerungen
sind zunächst deaktiviert; die Aktion versendet keine Nachrichten.

Private `mailboxRecordPreviews` binden Vorschläge an Nutzer, Postfach, Nachricht
und aktuellen Aktionsjob. `mailboxRecordApplications` speichern dauerhafte
Übernahmebelege mit Herkunft KI, bestätigendem Nutzer, Vorher-/Nachher-Werten und
Quellenbelegen. Direkte Clientzugriffe sind gesperrt. Die Übernahme prüft aktuelle
Rechte und Versionen erneut und schreibt Vorgang, Rechnungen, Notizen, Fristen
und Aktionsstatus in einer Transaktion. Wiederholungen erzeugen keine Duplikate;
veraltete, verworfene oder ersetzte Ergebnisse können nicht übernommen werden.
Historische `status@`-Verarbeitung bleibt unverändert.

## Veröffentlichung und Prüfung

Neue Callables: `searchMailboxRecordTargets`, `applyMailboxRecord`.
Angepasst: `startMailboxAction`, `getMailboxAction`, `listMailboxActions`,
`updateMailboxAction`, `processMailboxActionRun`, `cleanupMailboxConnections`.
Die Vorschauerstellung ist nur intern im Worker aufrufbar. Der Worker verwendet
die vorhandenen Mailbox- und KI-Secrets. Keine zusätzlichen Microsoft-Rechte.

Geprüft mit automatisierten Unit- und Regressionstests, einem echten
Firestore-Emulatortest aller fünf Kategorien einschließlich anschließendem
Lesen/Bearbeiten, Rechnungen und Fristen unter normalen App-Regeln sowie
Browserläufen mit synthetischen Daten. Eine eigens erzeugte Bild-PDF ohne
Textschicht wurde tatsächlich per OCR und KI für alle fünf Kategorien geprüft;
die Betragsnormalisierung wurde dabei korrigiert und erneut erfolgreich getestet.
Im Browser wurden parallele Auswertungen ohne automatische Dialoge, Zuordnung,
Feldvergleich, Dokumentation, Terminabsage, Inkassorechnungen, Verwerfen und
gespeicherte Ergebnisse geprüft. Keine echten Fälle oder E-Mails für Tests angelegt.
