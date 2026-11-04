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
Veröffentlicht: Code-Commit 0e8fdba auf dev, Vercel erfolgreich
(Deployment 26bePzCYwpjo1wAANDwhKprSf38o). Beide Functions ACTIVE:
reviewmailboxinvoices-00015-huq und processmailboxactionrun-00014-xoq;
identischer Quellartefakt-MD5 F3WfnkkgbQmj8IjQ2OgbFA==.
Ein zusätzlicher Firestore-Emulatortest (demo-drehpunkt-invoice-batch) bestätigt
atomare Speicherung, Idempotenz und unlesbare Zusatzanlage; erfolgreich, nicht übersprungen.
Angemeldete Dev-Browserprüfung eines gespeicherten Berichts erfolgreich:
zusätzliche Titelzeilen und separater Betragsbereich entfallen; Ext. Belegnummer
zeigt Bereits gebucht ohne Details; Zahlungsziel kompakt; Währung EUR ohne TA;
Netto-Details enthalten die Positionssummenprüfung.
Kein neuer KI-Live-Durchlauf und kein absichtlich ausgelöster technischer Fehler;
diese Benutzerprüfungen bleiben Teil der anschließenden Tests des Nutzers.
Main blieb a4b274d; keine Veröffentlichung im Produktions-Firebase-Projekt.
Für geänderte gespeicherte Bewertungen ist eine erneute Rechnungsprüfung nötig.
Rückweg: vorheriger Dev-Commit 2c291ae für Frontend und beide Functions gemeinsam.
