# Fremdsprachige Rechnungen – Dev, 04.11.2026

Nutzerfreigabe: Verbesserung, Test mit FV0136_02_2026.pdf und Veröffentlichung
auf Dev; Main bleibt unverändert. Basis ea356e7, Main a4b274d.

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
Bereitstellungsnachweis wird nach Abschluss ergänzt. Alte Fehler werden durch
eine erneute Rechnungsprüfung ersetzt. Keine Aussage über die Ursache des
historischen Modelloutputs: dieser war beim Screenshot nicht verfügbar.
