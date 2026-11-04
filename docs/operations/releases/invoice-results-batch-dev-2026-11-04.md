# Gesammelte Rechnungsanpassungen – Dev, 04.11.2026

Freigabe: Nutzerauftrag, das gesammelte Paket auf Dev zu veröffentlichen.
Basis: Dev 2c291ae; Produktion/main a4b274d bleibt unverändert.

Umfang: rotes Mail-Icon und neutraler Wiederholungsbutton bei technischem Fehler;
keine wiederholte Rechnungsnummer-/Ausstellerzeile; Netto/USt./Brutto mit zugeordneten
Details statt separatem Betragsbereich; kompakte Zahlungszielzeile ohne Erklärtext;
gleiche ausdrücklich erkannte Tagesfristen auch ohne wiederholten Fristbeginn grün;
Ext. Belegnummer ohne Details mit rot/gelb/grün und anderen aktiven Nummern gelb;
einmalige EUR-Prüfung pro Rechnung ohne TA-Unterzeile.

Geprüft: 169 gezielte Node-Tests, vollständiges Lint, Vite-Build und 45 gemeinsame
Module. Keine Änderungen an Rules, Indizes, Secrets oder Berechtigungen.
Backendziel ausschließlich db-bpl-drehpunkt-dev: reviewMailboxInvoices und
processMailboxActionRun. Frontend ausschließlich dev / Vercel Preview.
Veröffentlichung und Browserkontrolle werden nach Abschluss hier ergänzt.
Für geänderte gespeicherte Bewertungen ist eine erneute Rechnungsprüfung nötig.
Rückweg: vorheriger Dev-Commit 2c291ae für Frontend und beide Functions gemeinsam.
