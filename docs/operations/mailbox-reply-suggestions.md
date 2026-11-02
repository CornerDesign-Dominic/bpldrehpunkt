# Antwortvorschläge in persönlichen Postfächern

Nur Dev (`db-bpl-drehpunkt-dev`). Im Antwortfenster startet „Vorschläge“ genau eine Formulierung; „Neu formulieren“ berücksichtigt die Anweisung, den aktuellen Antworttext und den vorherigen Vorschlag. Anhänge werden nicht gelesen. Der geschriebene Text bleibt bis „Übernehmen“ erhalten. Übernehmen ersetzt den gesamten Text, Rückgängig stellt den vorherigen Text wieder her. Empfänger und Versand werden nicht von der KI verändert.

Vorschlag und Anweisung gehören zum bestehenden, versionierten Antwortentwurf und werden mit „Entwurf speichern“ gespeichert. Nach erfolgreichem Versand werden Antworttext, Vorschlag und Anweisung geleert; der Versandbeleg bleibt bestehen. Ein unbekannter Versandstatus bleibt gesperrt.

`suggestMailboxReply` prüft aktive Profilrechte und Postfachbesitz, liest die Nachricht über Graph als Text und ruft die bestehende OpenAI-Anbindung auf. Der neueste Text am Anfang hat Vorrang. Maximal 300 Wörter je Vorschlag, 1.000 Zeichen Anweisung, 20 Versuche je Nutzer in einem gleitenden Stundenfenster. Pro Nachricht läuft höchstens eine Anfrage gleichzeitig. Die serverseitigen Quoten enthalten keine Mailinhalte; die bestehende Bereinigung entfernt abgelaufene Einträge. KI-Nutzung wird ohne Inhalte unter `mailbox_reply_suggestion` erfasst.

Prüfung: `node --test functions/mailboxes.test.js functions/mailboxReplySuggestions.test.js`. Zusätzlich lokaler Oberflächentest für Laden, Übernehmen, Rückgängig, Neuformulieren, Fehlererhalt, Speichern/Neuladen und den simulierten Versandabschluss. Echte Mails werden dabei nicht versendet.
