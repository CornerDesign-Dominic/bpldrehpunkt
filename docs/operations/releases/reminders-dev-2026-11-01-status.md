# Zentrale Erinnerungen: getrennte Dev-Veröffentlichung

Ausdrückliche Nutzerfreigabe vom 01.11.2026: Erinnerungsflow zuerst ausschließlich
in Firebase Dev anbinden, alle benötigten Bestandteile veröffentlichen und
gründlich prüfen. Produktion und `main` bleiben unverändert; echte Testmails
ausschließlich an `no-reply@brennpunkt-logistik.de`.

Ziel: `db-bpl-drehpunkt-dev`, Region `europe-west3`, Dev-Oberfläche
`https://dev.drehpunktlogistik.de`. Isolierter Releasebranch
`codex/reminders-dev-release` auf dem aktuellen veröffentlichten Dev-Stand
`c6601053c74c5fedb3d138d2b8e81a7c2b0dd535`, ergänzt um den geprüften
Erinnerungsstand `eae075c`. Neuere Postfach-/Auftragsabläufe wurden erhalten;
vier Konflikte in Diagnose/Imports wurden zusammengeführt. Der ursprüngliche
Desktop-Arbeitsstand wird nicht verändert. Remote-`main` vor Beginn:
`230c2ad86af9700118e2f1456746292241461efc`.

## Umfang und Stand während der Durchführung

- Bestehenden Dev-Scheduler und automatischen Mailversand für den Übergang
  kontrolliert pausiert. Ursprünglich war der Scheduler aktiv; ein globaler
  Mailpause-Beleg existierte nicht. Rückkehrdaten liegen lokal außerhalb Git.
- Sechs eigene Dev-Secrets mit Version 1 angelegt: `POWER_AUTOMATE_REMINDER_URL`
  und die fünf `REMINDER_*`-Parameter aus dem Fachvertrag. Werte wurden nicht
  in Git übernommen. Produktions-Secrets werden nicht beschrieben.
- Reminder-Scheduler, Quell-/Parent-Trigger, Callables, kompatible Vorbereitung,
  Diagnose und Vorlagenverwaltung gehören zum Backendumfang. Neue private
  Erinnerungscollections und Schedule-/Zuständigkeitsregeln gehören zu den Rules.
  Neue zusammengesetzte Indizes und Storage-Änderungen sind nicht erforderlich.
- Frontend für Kalender, To-dos und Fachfristen wird mit veröffentlicht, da die
  neuen Zeit-/Status-/Zuständigkeitsverträge zusammenpassen müssen.
- Zusätzlicher Dev-Guard **vor** Reservierung und Legacy-Übernahme, erneut vor
  Versand und im Adapter: ausschließlich no-reply@, ohne Umleitung. Die zwei
  vorhandenen Dev-Nutzerprofile wurden nicht verändert; keines besitzt diese
  Adresse. Eine positive Benutzer-/Schedulerabnahme mit einem echten
  no-reply@-Profil ist deshalb derzeit nicht möglich. Keine Testkonten oder
  Anmeldetokens werden dafür erzeugt. Der reale Transport wird getrennt in der
  Dev-Laufzeit mit dem bereitgestellten Code geprüft.

## Bislang abgeschlossene Prüfungen

50 gezielte Backend-/Vertragsprüfungen, 26 Frontend-/Diagnoseprüfungen sowie
39 echte lokale Emulatorprüfungen erfolgreich, keine übersprungen. Die
Emulatorprüfungen umfassen Empfängerwechsel, 501 Altquellen, mehr als 100
Reservierungen, Parent-Fortsetzung, Zuständigkeiten und die neuen Rules inklusive
40 vollständiger Fachwrites. Emulator beendet. Lint, Build (692 Module), Laden
aller 187 Function-Exporte und Abgleich der 45 Shared-Module erfolgreich.

Der erfolgreiche Build wurde vor der Veröffentlichung ausgeführt; ein tatsächlicher
Cloud-/Browser-Erfolg wird daraus nicht abgeleitet. Der Live-Abschluss wird nach
Bereitstellung und Prüfung hier ergänzt.

## Sicherheitsbefund bei der Vorbereitung

Der Befehl `firebase login:list --json` gab unerwartet auch vorhandene
CLI-Anmeldedaten im privaten technischen Werkzeugergebnis aus. Der Nutzer wurde
darüber informiert; Werte werden hier nicht wiederholt und wurden nicht in Git
gespeichert. Anschließende Zugriffe verwenden ausschließlich gefilterte
Metadaten-/Ergebnisberichte. Die betroffene CLI-Anmeldung sollte nach Abschluss
erneuert und die alte Sitzung widerrufen werden; diese lokale Anmeldung wurde
im Release nicht stillschweigend verändert.
