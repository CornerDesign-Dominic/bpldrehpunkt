# AGB-Prüfung aus persönlichen Postfächern

Stand: 30.10.2026. Für die gemeinsame Dev-Veröffentlichung mit der Rechnungsprüfung freigegeben.

„AGB prüfen“ startet beim Öffnen des Mail-Arbeitsdialogs direkt eine gemeinsame
Prüfung aller PDF-Dateianhänge. Links lassen sich Mail und PDFs ansehen; rechts
erscheint während der Prüfung die vorhandene Ladeüberlagerung. Die Mail selbst
ist keine Prüfquelle. Anhänge bleiben in Exchange; PDF-Bytes und Volltexte
werden nur für die laufende Extraktion verwendet, nicht in der Historie abgelegt.

Der Server prüft aktive Postfach-Bearbeitung, Eigentümer/verbundene Verbindung,
Dev-Projekt und AGB-Modulzugriff, bevor Graph aufgerufen wird. Er liest die
vollständige Anhangsliste und alle PDFs einschließlich als inline markierter
PDF-Dateien. Nicht-PDF-Anhänge werden nicht ausgewertet. Keine clientseitig
übermittelten Texte oder PDF-Auswahlen fließen in die Analyse ein.

Grenzen: 20 PDFs, 5 MiB pro PDF, insgesamt 20 MiB, 100 Seiten und 160.000
Textzeichen; höchstens 20 Prüfstarts pro Nutzer und Stunde. Nicht lesbare oder verschlüsselte PDFs sowie unvollständige Anhangslisten brechen
die gesamte Prüfung mit Hinweis ab. Es werden keine stillen Teilprüfungen
angelegt. Bildseiten werden automatisch per OCR gelesen; unsichere Stellen werden markiert.

Die vorhandene AGB-Analyse (Modell, Prüffelder, Normalisierung, Nutzungserfassung)
prüft den gemeinsamen extrahierten Text samt Dateinamen und Seitenmarkern.
Dauerhafte Bedingungen können auch in Auftrags-PDFs stehen. Die gemeinsame
Ergebnisdarstellung wird von AGB-Modul und Mailaktion verwendet. Ein Ergebnis
landet automatisch als ein Eintrag in agbCheckerHistory mit zugehörigem
Ergebnisdokument. Es enthält channel personal_mailbox und geprüfte Dateinamen/
Seitenzahlen, aber keine persönlichen Mailtexte oder Graph-Referenzen.

Keine automatische Kundenzuordnung: Unter einem eingeklappten optionalen
Bereich kann ein Nutzer mit Stammdaten-Leserecht einen bestehenden Kunden und
eine seiner Debitorenreferenzen auswählen. Der Server validiert reale Referenz,
Kundenrolle und Eigentümer des Historieneintrags transaktional. Die Zuordnung
wird getrennt von der aus dem Dokument erkannten Kundenidentität gespeichert;
die Historienkarte zeigt die Debitorennummer. Eine fehlende Zuordnung blockiert
weder Prüfung noch Speicherung.

Veröffentlichung separat: neue Functions analyzeMailboxAgb und
assignMailboxAgbCustomer sowie reportClientDiagnostic in db-bpl-drehpunkt-dev,
Frontend gemeinsam bereitstellen. analyzeMailboxAgb bindet MAILBOX_CLIENT_SECRET
und STATUS_MAIL_OPENAI_API_KEY aus Dev. Der eigenständige AGB-Upload behält
seinen bisherigen DREHPUNKT_AGB_CHECKER_KEY; es werden keine Produktionswerte kopiert. Die
zusätzliche Dev-Erlaubnis gilt nur für diesen expliziten Postfach-Analysepfad;
der normale AGB-Upload bleibt außerhalb der Produktion gesperrt. Keine neuen
Firestore-Regeln oder Indizes; Quota nutzt die bestehende serverprivate
mailboxTrackingQuotas-Collection. status@ bleibt unverändert.

Prüfung: gezielte Service-/Handler-Tests prüfen vollständige PDF-Auswahl,
zusammengeführte Extraktion ohne Mailtext, verweigerte Teilprüfung, Mengen- und
Quota-Grenzen, Modulrechte/Ownership und verifizierte optionale Kundenzuordnung.
Echte Graph-/KI-Auswertung und angemeldete Browserabnahme folgen nach gesonderter
Dev-Veröffentlichung. Es wurden keine echten Mails oder PDFs an KI gesendet.
