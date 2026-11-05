# Vertragsmanagement – Dev-Freigabe vom 05.11.2026

Der Nutzer hat Browserprüfung und Veröffentlichung auf dem aktuellen Dev-Stand
ausdrücklich beauftragt. Releasebasis ist `origin/dev` mit
`3f375e1c7b47e3cf2f5b11fe43dbf748d3c29a2c`; die ältere, umfangreich veränderte
Desktop-Arbeitskopie wurde nicht als Ganzes übernommen.

## Umfang und Datenvertrag

- Eigener Menüpunkt `/vertragsmanagement`, zunächst leere Übersicht und
  Fachreiter `/vertragsmanagement/vertraege` gemäß bestehenden Bereichslayouts.
- Vertragstabelle mit jeweils 50 Datensätzen und Nachladen; Link zur Vertragsakte.
- Anlegemodal mit freiem Pflichtnamen, Prüfung auf Leerzeichen/240 Zeichen,
  gesperrter Doppelübermittlung und Bestätigung vor Verwerfen von Eingaben.
- Nach dem Speichern öffnet sich die erste Vertragsakte mit Partnername und
  Erstellungszeit. Weitere Akteninhalte sind noch nicht implementiert.
- Eigenes Modul `contracts` in der bestehenden Rechteverwaltung: `view` zum
  Lesen, `edit` zusätzlich zum Anlegen. Der bestehende Superadmin-Override bleibt;
  Adminstatus allein gibt keinen Fachzugriff. Bestehende Profile werden nicht
  pauschal mit neuen Rechten versehen.
- Collection `contracts`: ausschließlich `partnerName`, `createdBy`, `createdAt`.
  Rules prüfen getrimmten Pflichtnamen, authentifizierten Ersteller und Serverzeit.
  Bearbeiten, Löschen und Untercollections bleiben bis zum Ausbau gesperrt.
- Stabile Dokument-ID und Transaktion schützen Wiederholungen desselben
  Anlegeversuchs. Technische Fehler laufen über die zentrale Diagnose ohne
  freie Vertragspartnernamen.

## Prüfung vor Frontend-Veröffentlichung

- Lint und Frontendbuild erfolgreich; Shared-Abgleich: 45 Module unverändert.
- Firestore-Emulator mit explizitem Demo-Projekt: 5 Tests bestanden,
  einschließlich Rollen, inaktiver/fehlender Profile, ungültiger Namen,
  manipulierter Auditfelder sowie verweigertem Ändern/Löschen.
- Diagnose-/Zugriffs-/Benutzerpräferenztests: 23 bestanden.
- Bestehende Rules-Vertragstests: 29 bestanden. Navigation: 8 bestanden.
- Browserprüfung vor Veröffentlichung mit echten Komponenten und isolierter
  synthetischer Datenquelle: Übersicht/Fachreiter, leere Liste, Pflichtname,
  Anlegen, Vertragsakte, Neuladen, Rückkehr, fehlender Anlegebutton bei `view`,
  Deutsch/Englisch, Light-/Dark-Mode, Speicher- und Ladefehler sowie Wiederholen.
  Keine Konsolenfehler im lokalen Prüfablauf. Die Datenquelle dieser lokalen
  UI-Prüfung ersetzt keinen Nachweis der echten Dev-Speicherung.
- Dabei korrigiert: lesbare Tabellenlinks in beiden Themes und projektüblicher
  Bestätigungsdialog statt Browser-Rückfrage bei ungespeicherten Eingaben.

## Bereitstellung und anschließende Abnahme

Firebase-Ziel ausschließlich `db-bpl-drehpunkt-dev`: Firestore Rules sowie die
bestehenden Functions `createManagedUser`, `updateManagedUser`,
`reportClientDiagnostic` und `listDiagnosticsPage`. Keine neuen Indizes,
Storage-Regeln, Secrets oder Migrationen. Der Rules-Upload hat unveränderte
Dev-Indizes mit abgeglichen. Vorhandene Rules-Compilerwarnungen bei
anderen Fachabläufen sind keine neuen Vertragsmanagementfehler.

Frontend-Releasecommit: `0d1f4510a53cbede736bec807fc569d1e23aa044`, auf `dev`
gepusht. Vercel meldet für den Commit `success`:
[Deployment](https://vercel.com/cornerdesign-dominics-projects/bpldrehpunkt/6jEqayYqC67XG3ZfD6aRBSaq7dq1).
Der Live-Alias `https://dev.drehpunktlogistik.de` liefert den neuen Bereich.

Die vier genannten Functions meldeten jeweils eine erfolgreiche Aktualisierung
in `europe-west3`; Firestore Rules wurden erfolgreich veröffentlicht. Beim ersten
Functions-Versuch fehlten lokale nicht geheime Parameter; nach Übernahme der
bereits vorhandenen projektspezifischen Dev-Konfiguration gelang der Deploy.
Es wurden keine Secretwerte ausgelesen oder neu angelegt.

Echte Browserabnahme in der bereits angemeldeten Dev-Sitzung erfolgreich:

- Neuer Menüpunkt, leere Übersicht und Fachreiter zur Vertragsliste sichtbar.
- Liste zunächst leer; Leerzeichen als Pflichtname verhindern die Übermittlung.
- Testvertrag `DEV-Browserprüfung Vertragsmanagement 05.11.2026` wurde über
  das reale Modal gespeichert und automatisch als Vertragsakte geöffnet.
- Nach vollständigem Neuladen blieben Partnername und Serverzeit erhalten.
  Rückkehr zur Liste und erneuter Aufruf über den Menüpunkt funktionierten.
- Keine Konsolenfehler im geprüften Dev-Browserablauf.
- Ausschließlich der selbst erzeugte Testdatensatz
  `contracts/l1946kKoj7qU6yRBUbbh` wurde anschließend gezielt über die
  administrative Dev-CLI entfernt. Das Neuladen bestätigte die wieder leere Liste.

Die unterschiedlichen verweigerten Rollen wurden im Emulator geprüft; die
echte Dev-Browserabnahme verwendet die vorhandene Sitzung. Es wurden dafür
keine Benutzerprofile, Rechtezuweisungen oder Anmeldetokens erzeugt/geändert.

Main und Produktion sind nicht Teil der Freigabe. Rückkehr beim Frontend auf
die genannte Basis ist möglich; ein Frontendrollback setzt weder neue
Vertragsdaten noch Firebase Rules/Functions zurück. Bestehende Vertragsdaten
sind bei jeder Rückkehr zu erhalten.
