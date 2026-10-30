# Mailaktionen im Hintergrund

Stand: 30.10.2026. Ausschließlich Dev (`db-bpl-drehpunkt-dev`).

## Bedienung

Auftragserfassung, Sendungsstatus, AGB- und Rechnungsprüfung starten ohne Dialog.
Jede Aktion hat einen eigenen Zustand pro persönlichem Postfach und Nachricht;
mehrere Aktionen können gleichzeitig laufen. In der Mailliste erscheinen nur
Symbole, ohne Ergebnistext oder Warnungszähler. Der entsprechende Aktionsbutton
übernimmt Zustand und Beschriftung:

- Laufend: blauer Ladekreis; Button gesperrt.
- Auftrag/Sendungsstatus zur Bestätigung: gelbes Formular/Uhrsymbol.
- AGB/Rechnung fertig oder Auftrag/Status übernommen: grünes Aktionssymbol.
- Fehler: verständliche Meldung und erneuter Start bzw. gezieltes Ergebnisladen.

Grün bedeutet abgeschlossen, unabhängig vom fachlichen Prüfungsergebnis. Dieses
steht ausschließlich im bewusst geöffneten Ergebnisdialog. Fertigstellungen
öffnen niemals automatisch Dialoge, auch nicht bei unveränderter Nachricht.
Schließen erhält das Ergebnis. Verwerfen offener gelber Ergebnisse entfernt das
Symbol und setzt den Button zurück. Abgeschlossene Prüfarchive werden dadurch
nicht gelöscht. Die Auftragserfassung heißt beim letzten Schritt „Auftrag
anlegen“; der unmittelbar darunter angezeigte Hinweis erklärt den aktuellen
XML-Download statt der noch ausstehenden automatischen Übergabe. Nach
bestätigter Erstellung wird der Button grün und verhindert eine zweite Anlage.

## Verarbeitung und Datenhaltung

`startMailboxAction` legt atomar einen persönlichen Aktionsplatz und einen
`mailboxActionRuns`-Auftrag an. Laufende Doppelstarts verwenden denselben Job.
Der Firestore-Worker `processMailboxActionRun` beansprucht ihn einmal und ruft
die vorhandene serverseitige Mailauswertung auf. Rechte und die persönliche
Postfachbindung werden vor und nach der Auswertung geprüft; Rohdaten und
Anmeldesecrets werden weder an den Browser noch in die Jobmetadaten übertragen.

`listMailboxActions` liefert nur Statusmetadaten der angefragten Nachrichten;
`getMailboxAction` lädt das Ergebnis der ausgewählten Mail. Der gemeinsame
Frontend-Store hält die Anzeige unabhängig von montierten Ergebnisdialogen.
Auswertungen laufen nach Mailwechsel, Verlassen der Seite und Neuladen serverseitig
weiter. Der Browser fragt laufende Zustände häufiger ab und lädt große Ergebnisse
nur für ausgewählte Aktionen. Ein Benutzerwechsel leert den privaten Browsercache.

Aktionsplätze unter `mailboxActionScopes/<owner-and-connection-hash>/actions`
und die Run-Collection sind für direkte Clientzugriffe gesperrt. Alle öffentlichen
Aufrufe benötigen Anmeldung, App Check und passende Modulrechte. Die dauerhaften
Ergebnisse haben keine einstündige Vorschaufrist. Zugehörige Order-/Tracking-
Vorschauen sind an den Job gebunden; verworfene oder ersetzte Vorschauen werden
abgelaufen markiert und von der bestehenden Bereinigung entfernt. Kurzlebige
Run-Einträge werden ebenfalls bereinigt.

`updateMailboxAction` setzt Auftrag und Status nur nach einem passenden
serverseitigen Export-/Übernahmebeleg auf abgeschlossen. Bestehende Apply-/Export-
Transaktionen prüfen die aktuelle Jobbindung. Gleichzeitiges Verwerfen, Neustarten
und Übernehmen wird durch Transaktionen gegen widersprüchliche Zustände geschützt.
Historische `status@`-Verarbeitung bleibt unverändert.

## Veröffentlichung und Prüfung

Dev benötigt die vier neuen Callables, den Firestore-Worker sowie die angepassten
Funktionen `cleanupMailboxConnections`, `exportMailboxOrder`,
`applyMailboxTracking` und die Firestore-Rules. Keine Microsoft-, Secret- oder
Produktionskonfiguration wurde für dieses Verhalten verändert.

Unit-Tests prüfen Zustandsübergänge, unabhängige Jobs, Rechte, Wiederholungen,
stale Antworten, private Cache-Grenzen und Quellen-/Exportverhalten. Echte
Firestore-Emulatortests prüfen Worker-Claim, parallelen Start und den Konflikt
zwischen Trackingübernahme und Verwerfen. Die Rules wurden gegen Eigentümer,
andere Benutzer und Superadmin geprüft. Browserläufe mit synthetischen Daten
decken alle vier parallelen Aktionen, Mailwechsel, Neuladen, explizites Öffnen,
Schließen, Verwerfen, bestätigte Übernahme und helle/dunkle Darstellung ab.
Dabei wurden keine echten Aufträge angelegt und keine E-Mails versandt.
