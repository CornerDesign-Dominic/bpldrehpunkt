# Zeiterfassung: Vorlagen, Dashboard und Handy-Einstieg in Dev

Stand 10.11.2026. Nur Dev bereitgestellt; Git `main` blieb auf `480ae31` und das
Produktionsdeployment wurde nicht verändert.

- [Dev-Dashboard](https://dev.drehpunktlogistik.de/dashboard)
- [Eigene Arbeitszeit](https://dev.drehpunktlogistik.de/zeiterfassung)
- [Arbeitszeitmodelle](https://dev.drehpunktlogistik.de/admin/arbeitszeitmodelle)
- [PWA Dev](https://db-bpl-drehpunkt-dev-time.web.app)

`dev.drehpunkt.de` löst nicht auf. `dev.drehpunktlogistik.de` gehört bei Vercel
zum Git-Branch `dev`. Der bisherige Deploy aus `480ae31` enthielt noch keine
Zeiterfassung. Branch `dev` wurde per Fast-forward auf `197a0e0` aktualisiert;
Vercel-Deployment `dpl_62PE5xyNbgxrFttj87FJFw7TkSTv` ist `READY`, der exakte
Commit und die Zuordnung des Dev-Alias wurden zurückgelesen. Vercels bestehender
Zugangsschutz bleibt erhalten. Die sieben Dev-Firebase-Previewwerte wurden vor
dem Deploy gegen die bestehende Firebase-Dev-Web-App abgeglichen. Der öffentliche
PWA-Link ist als Preview-Variable `VITE_TIME_PWA_URL` nur für Branch `dev` gesetzt.
Die getrennte Firebase-Web-Testansicht wurde auf denselben Umfang aktualisiert.

## Änderungen

- Weiche Arbeitszeitmodell-Vorlagen: Entwurf benennen/speichern, kopieren,
  bearbeiten und archivieren. Eine Kopie enthält nur Wochenwerte, Pausenregeln
  und Feiertagsregion. Aktive Superadmins verwalten sie; Änderungen wirken nicht
  auf schon zugewiesene Modelle. Zusätzliche Kopierhilfe für Montag bis Freitag.
- Dashboard-Kachel mit eigenen Stempelaktionen, Tagesstatus und Zeitübersicht.
  Rechte, Offlinehinweis und Nachtragserinnerung wie im Zeitbereich.
- **Am Handy öffnen** zeigt einen QR-Code zur tatsächlichen konfigurierten PWA.
  PWA **Konto → Auf dem Startbildschirm** führt durch die jeweilige Installation.

## Prüfstand

- Lint, Web-Build, 38 gezielte Backend-/UI-/Berechnungsprüfungen, acht
  Dev-Safeguard-Prüfungen und Abgleich der 48 Shared-Module erfolgreich.
- `listTimeWorkModelTemplates`, `saveTimeWorkModelTemplate`,
  `archiveTimeWorkModelTemplate` in `europe-west3` aktiv. Neue private Collections
  `timeWorkModelTemplates` und `timeWorkModelTemplateNames`; kompakte Dev-Rules
  `6311d6ef-6323-473a-8d65-07883dea9085` nach Rücklesen semantisch gleich zur
  lokalen Quelle. Kein neuer Index nötig.
- PWA: Lint, 15 Tests und Dev-Build erfolgreich; Hosting-Version
  `85bd689f9fe937bc`. Installationshilfe nach Neuladen im angemeldeten Browser
  gesehen. Physische Handyinstallation und Offline-Neustart bleiben offen.
- Die angezeigten null Sollstunden stammten aus zwei verschiedenen Dev-Konten:
  Das Arbeitszeitmodell mit 2.400 Minuten regulärem Wochensoll ist dem
  Mitarbeiterkonto zugeordnet; der beobachtete Browser war am Superadmin-Konto
  angemeldet. Das wurde aus Dev-Daten und einem kurzzeitigen, pseudonymisierten
  Diagnoseprotokoll der tatsächlichen Workspace-Anfrage abgeglichen. Keine
  Kontozuordnung, Arbeitszeitvorgabe oder Zeitbuchung verändert. Die temporäre
  Diagnose ist aus `listTimeWorkspace` entfernt und der Callable erneut aktiv.
- Vollständiger angemeldeter Browserdurchlauf für Vorlagenerstellung und
  Dashboard-Stempeln steht separat an; keine zusätzlichen Testdaten angelegt.
