# Fremdsprachige Rechnungen – Dev, 04.11.2026

Nutzerfreigabe: Verbesserung, Test mit FV0136_02_2026.pdf und Veröffentlichung
auf Dev; Main bleibt unverändert. Basis ea356e7, Main a4b274d. Parallel veröffentlichte Dev-Änderungen bis
2db9411 wurden konfliktfrei übernommen (73 zusätzliche Tests, danach Lint/Build).

Änderung: Sprachunabhängiger ausdrücklicher Prüfauftrag, Originalzitate ohne
Übersetzung; Wiederverankerung eines fehlerhaften allgemeinen Modellbelegs an
einer tatsächlich vorhandenen mehrsprachigen Rechnungsüberschrift auf denselben
Rechnungsseiten. Einzelwerte, Quellen, Seiten und Begleitdokumente bleiben streng
getrennt. Ungültige Transportlisten erhalten eine eigene verständliche Fehlermeldung.
Polnischer Kundenauftragsbezug Numer zlecenia od klienta ausdrücklich unterstützt.
Keine zusätzlichen Modellaufrufe, Rechte-, Rules-, Index- oder Secretänderungen.

Geprüft: 165 gezielte Tests, vollständiges Lint, Build und 45 gemeinsame Module.
Original-PDF mit echter zusätzlicher OCR und echter gpt-5.4-Extraktion getestet,
ohne Schreiben von Testaufträgen/Prüfberichten: eine Rechnungsseite, Faktura,
FV0136/02/2026, 450,00 EUR netto/brutto, 0,00 EUR USt., TA 260200713,
Rechnungsdatum 25.02.2026, Fälligkeit 11.04.2026, Differenz 45 Tage.
Regressionsfälle für übersetzte/zusammengesetzte Belege, fehlende Einzelwerte,
mehrere Sprachen sowie Ablehnung von Belegen aus fremden Anlagen/Seiten bestehen.

Benötigt ausschließlich Dev: reviewMailboxInvoices und processMailboxActionRun
im Projekt db-bpl-drehpunkt-dev; Git-Ziel dev. Frontend unverändert.
Veröffentlicht: Code-Stand d19d6c0 auf dev, Vercel erfolgreich
(Deployment 29767KctDnDFPhTwoWb4ggsusKqS). Beide Functions ACTIVE:
reviewmailboxinvoices-00018-qoh und processmailboxactionrun-00017-fud,
identischer Quellartefakt-MD5 zxoXgOP10Qv32g/2+YNxnA==. Alte Fehler werden durch
eine erneute Rechnungsprüfung ersetzt. Keine Aussage über die Ursache des
historischen Modelloutputs: dieser war beim Screenshot nicht verfügbar.


Live-Abnahme: Originalmail WG: 260200713 mit FV0136_02_2026.pdf und pod1/pod2/pod3
auf Dev erneut geprüft. Prüfung abgeschlossen und Ergebnis gespeichert: genau die
Rechnung FV0136/02/2026, TA 260200713 bestätigt, 450 EUR netto/brutto, 0 EUR Steuer,
45 Tage Zahlungsziel und EUR stimmen. 12 grüne Hauptprüfpunkte; ein roter Punkt ist
der bestätigte vorhandene DyCoS-Beleg derselben Nummer (keine technische Störung).
Begleit-PODs wurden nicht als weitere Rechnungen ausgegeben. Alle vier Dokumente
bleiben in der Quellenauswahl erhalten. Erneutes Öffnen nach vollständigem
Neuladen bestätigt das gespeicherte Ergebnis. Screenshot lokal unter
 tmp/invoice-foreign-language-dev.png. Main blieb a4b274d.
