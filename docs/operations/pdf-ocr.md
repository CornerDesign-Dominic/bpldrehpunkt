# Automatische OCR für PDF-Bildseiten

Stand: 30.10.2026. Ergänzung zur ausdrücklich beauftragten Rechnungsprüfung;
Dev-Veröffentlichung, Produktion bleibt unverändert.

functions/pdfOcr.js ist der gemeinsame Textextraktionsweg für Rechnungsprüfung,
AGB-Mailaktion und Auftragserfassung. Auch der Quellcode des bisherigen
AGB-Einzeluploads nutzt denselben Weg; dessen produktive Function wird mit
diesem Dev-Release nicht verändert. Normale Textseiten bleiben unverändert.
Leere, defekte Textebenen oder kurze Scannertexte über Bildern werden seitenweise
erkannt. Gemischte PDFs behalten ihre Seitenreihenfolge. Nur betroffene Seiten
werden mit pdfjs-dist und @napi-rs/canvas (explizite Laufzeitabhängigkeit) in
hochaufgelöste PNGs gerendert und in genau einem OCR-Aufruf pro PDF gelesen.
Die höchste Kantenlänge ist 3.200 Pixel, die Bilder zusammen höchstens 20 MiB.

OCR verwendet die bestehende OpenAI Responses-Schnittstelle mit gpt-5.4,
input_image detail:high und store:false. Die Mailaktionen binden ausschließlich
das bestehende Dev-Secret STATUS_MAIL_OPENAI_API_KEY. OCR-Aufwand wird über
executeAiOperation unter mailbox_pdf_ocr protokolliert, ohne Inhalte/Tokens.
Es gibt keinen zusätzlichen OCR-Dienst, kein neues Secret und keine
volltextbasierte OCR-Speicherung. Identische Dokumente werden innerhalb eines
Aufrufs anhand ihres Hashs wiederverwendet. Keine automatische OCR-Wiederholung.

Die Ausgabe muss jede angeforderte Seite genau einmal liefern. Fremde,
fehlende, doppelte oder abgeschnittene Seiten werden nicht akzeptiert. Leere
Seiten können ausdrücklich als leer erkannt werden; vollständig leere PDFs
führen nicht zu einem fiktiven Prüfergebnis. Unleserliche Zeichen dürfen nicht
geraten werden. OCR-Markierungen und Unsicherheit bleiben im Ergebnis erhalten.
Bei unsicheren Rechnungsseiten verhindert ein zusätzlicher Prüfpunkt einen
grünen Transportstatus. Auftragsbelege solcher Seiten bleiben ausdrücklich
unverifiziert; AGB-Ergebnisse enthalten den Originalprüfhinweis und OCR-Seiten.

Vollständiger OCR-Text verbleibt im laufenden Arbeitsspeicher. Gespeichert werden
nur die bisherigen fachlichen Ergebnisse/Belege sowie OCR-Seitennummern und
Unsicherheitskennzeichnung. Die Original-PDFs werden weder verändert noch mit
einer neuen Textebene überschrieben und bleiben in Exchange.

Der Ladehinweis nennt OCR bei Bedarf. Die Zeitgrenzen der Mail-AGB-Prüfung und
Auftragserfassung steigen für OCR plus Fachauswertung auf 540 Sekunden. Die
bestehenden Dateigrößen-/Seiten-/Text- und Nutzerquoten gelten weiter. Bei Fehlern
wird keine stille Teilprüfung als vollständig gespeichert.

Prüfung: sieben gezielte OCR-Tests prüfen Auslöser, unveränderte Textseiten,
gemischte Seitenreihenfolge, genau einen Aufruf, Wiederverwendung innerhalb des
Aufrufs, leere/fehlende/doppelte Seiten und unvollständige Providerantworten.
Weitere Regressionstests verhindern grünen Rechnungsstatus bzw. verifizierte
Auftragsbelege bei unsicherer OCR. Eine reine Bildkopie einer der bereitgestellten
Rechnungen wurde lokal erstellt, visuell geprüft und ohne Textebene bestätigt.
Im echten OCR- plus Rechnungs-Auswertungslauf wurden TA, Rechnungsnummer,
EUR-Nettobetrag, Orte, Termine und Kennzeichen mit dem Original abgeglichen.
Der erste Test mit direkter PDF-Übergabe war bei kleinen Ziffern unzureichend;
die freigegebene Umsetzung verwendet deshalb hochaufgelöste Seitenbilder.
Test-PDF, Bilder, Extraktionen und Secret-Werte werden nicht eingecheckt.

Gezielter Dev-Deploy: reviewMailboxInvoices, analyzeMailboxAgb und
previewMailboxOrder; anschließend Frontend. analyzeCustomerOrderTerms in
Produktion bleibt unangetastet. Keine Rules-, Index- oder IAM-Erweiterung.

Releaseprüfung: 93 gezielte Tests, vollständiger Lint, Build und Abgleich der
38 deploybaren Shared-Module erfolgreich. Der echte OCR-/Rechnungsdurchlauf
mit einer Bild-PDF hat genau einen OCR-Aufruf verwendet.
