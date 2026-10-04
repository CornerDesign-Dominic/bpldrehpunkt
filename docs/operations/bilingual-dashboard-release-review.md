# Prüfung: Bedienoberfläche in Deutsch/Englisch und Dashboard

Stand: 2026-10-01. Release-Zuordnung: gezielter Cherry-pick von `dev` nach `main` (Production). Der Nutzer hat die Übernahme beider Änderungen nach `main` beauftragt.

## Umfang und Benutzerabläufe

- Das Dashboard zeigt vier gleich große Felder: Begrüßung oben links, Updates unten links, zwei leere Felder. Die Update-Liste sortiert nach Datum, scrollt bei Bedarf und begrenzt Einträge auf drei Zeilen.
- Die Sprache der Bedienoberfläche wird im eigenen Profil gewählt. Bestehende Profile ohne Sprachwert bleiben auf Deutsch. Die Auswahl wird im Profil gespeichert und beim nächsten Aufruf wieder geladen.
- Automatische E-Mails, PDF-Ausgaben, Vorlageninhalte, gespeicherte Historie und Freitext werden nicht übersetzt. Die Firebase-Auth-Sprache bleibt unverändert.
- Die derzeitige Englisch-Fassung hat noch bekannte Lücken bei einzelnen UI-Texten, insbesondere in Dialogen der Sendungsverfolgung und bei Datumsformaten. Diese wurden im vorherigen UI-Audit festgehalten; eine vollständige Übersetzung ist mit diesem Release nicht bestätigt.

## Berechtigungen und Datenzugriff

- Das einzige neue Profilfeld ist `users/{uid}.language` mit `de` oder `en`. Es gibt keine Änderung an Rollen, Modulrechten, Firestore- oder Storage-Rules und keine neue Storage-Struktur.
- Der Client schreibt geschützte Profile weiterhin nicht direkt. Die App-Check-geschützte Callable `updateOwnLanguage` verlangt ein aktives, angemeldetes Profil, akzeptiert nur den Sprachparameter und aktualisiert nur das eigene Profil. Fremde Benutzerprofile, Rollen und Rechte sind über diesen Ablauf nicht veränderbar.
- Die Callable muss vor dem Production-UI-Release im Firebase-Projekt `db-bpl-drehpunkt` bereitstehen. Die Client-Konfiguration in Vercel ordnet `main` diesem Projekt zu.

## Prüfung und Freigabe

- `npm run build`: bestanden.
- `npm run lint`: bestanden.
- `node --test` gezielt für die Testdateien in `src/` und `functions/`: 459 Tests, 437 bestanden, 22 übersprungen, 0 fehlgeschlagen. Der unbeschränkte Testaufruf erfasst zusätzlich ignorierte Testkopien unter `tmp/` und ist für diese Prüfung ungeeignet.
- Der Contract-Test prüft App Check, aktives Profil, Eingabegrenzen, eigene UID und das Verbot direkter Profiländerungen. Das Dashboard wurde in der Entwicklungsumgebung vom Nutzer begutachtet.
- Nach dem Cherry-pick sind Build, Lint und Tests auf dem tatsächlichen `main`-Stand erneut auszuführen. Die noch offenen englischen UI-Texte bleiben als begrenzter, dokumentierter Restumfang bestehen.
