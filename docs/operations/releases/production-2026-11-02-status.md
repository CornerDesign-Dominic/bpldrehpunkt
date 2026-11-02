# Produktionsübernahme vom 02.11.2026

Status: Umstieg läuft. Grundlage ist der gesamte veröffentlichte Dev-Stand
`cc14edf` mit den Produktionsanpassungen aus `codex/production-2026-11-02`.
Der Nutzer hat die Veröffentlichung und Rücksetzung fachlicher Daten ausdrücklich
freigegeben. **Alle 15 bestehenden Nutzerkonten bleiben erhalten**, einschließlich
deaktivierter Konten, Rollen, Modulrechten und zugehörigen Mitarbeiterdaten.

## Bisher tatsächlich durchgeführt

- 15 benötigte Produktions-Secrets sind vorhanden und aktiviert. Das
  Einrichtungsproblem im PowerShell-Helfer wurde mit Windows-Known-Folder-Pfaden,
  eindeutiger Pfaddiagnose und UTF-8-BOM für Windows PowerShell behoben.
- Die reine Microsoft-Anmeldung ist mit den Produktionsidentitäten geprüft.
  Einzelauftrag, Stammdaten und Auftragssuche liefern echte lesende Antworten.
  Der Mail-Anwendungszugriff liefert für no-reply@ HTTP 200 und persönliches
  bb@ HTTP 403. Keine Mail wurde zum Testen versendet.
- Der angemeldete Produktionsbrowser ist vor dem Wartungsfenster als Bilbo
  Beutlin mit Administrationszugang bestätigt.
- Automatischer Versand und die vorher aktiven Scheduler sind für den Übergang
  pausiert. Die vorher pausierte News-Recherche bleibt pausiert. Vorherige
  Zustände, originale Firestore-Regeln und die Benutzerbestände sind separat
  im geschützten lokalen Cutover-Verzeichnis gesichert.
- Ein temporärer Firestore-Regelsatz lässt nur das Lesen des eigenen
  Benutzerprofils zu und sperrt fachliche Clientzugriffe während des Übergangs.
- Vollständiger verwalteter Firestore-Export: **SUCCESSFUL**, 7.467 Dokumente.
  Ablage im Produktionsbucket unter `private-release-backups/production-2026-11-02-1793629412243`.
- Alle **16 vorhandenen Storage-Dateien** sind zusätzlich serverseitig unter
  `private-release-backups/files-2026-11-02` kopiert und per CRC32C/Größe geprüft.
  Die Kopien enthalten keine Firebase-Downloadtokens. Originale Signaturen und
  Firmenassets bleiben erhalten.
- Alle **72 produktiven zusammengesetzten Indizes sind READY**.
- Der finale Firestore-Regelsatz ist als inaktiver Produktions-Ruleset angelegt.
  Seine LF-normalisierte Quelle stimmt exakt mit dem aktiven Dev-Regelsatz
  überein (SHA-256 `1afd2073e5ffe9a2d0e196382a5078b3186678d47c263d26b4753757e40d9d13`).
  Die separate Rules-Test-API lieferte wiederholt 503; die eigentliche
  Ruleset-Erstellung war erfolgreich. Die Schutzregeln wurden nicht abgeschwächt.
- Das vollständige Functions-Deployment läuft. Google begrenzt hierbei die
  Änderungen pro Minute; fehlgeschlagene Einzelteile werden erst nach Abschluss
  des ersten Laufs gezielt in kleineren Paketen wiederholt.

## Vorbereiteter Resetumfang

Die konkrete Löschliste liegt zusammen mit dem Backup im geschützten lokalen
Cutover-Verzeichnis. Sie umfasst die fachlichen Auftrags-, Partner-, Fall-,
Aufgaben-, Dokument- und Importdaten sowie einen Testkalendereintrag. Vorher
wurden 1.286 betroffene Wurzeldokumente ermittelt; Untercollections werden ebenfalls
berücksichtigt. Fachliche Originaldateien werden nur nach gesicherter Kopie und
mit Generation-Vorbedingung entfernt.

Erhalten bleiben Authentication, Benutzerprofile und deren Unterdaten,
Mitarbeiter-/HR-Profile, Abteilungen, Kalendercontainer und ihre Rechte,
Urlaubs-/HR-Daten, Signaturen, Firmenassets, Betriebskonfiguration,
Systemmailvorlagen, öffentliche Feiertagsdaten sowie Nutzungs-/Kostenbelege und
technische Caches. Es gibt keine Dev-Datenübernahme und keine Änderung/Löschung
von Outlook-Mails oder DyCoS-Daten.

Bis zur abschließenden Kontrolle: kein Frontendwechsel nach `main`, kein
Freigeben des automatischen Versands und kein Versprechen vollständiger
produktiver Verfügbarkeit. Der weitere Abschluss wird in diesem Beleg ergänzt.
