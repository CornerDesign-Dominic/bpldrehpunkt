# Produktionsübernahme: Vorbereitung vom 02.11.2026

Historischer Vorbereitungsbeleg. Die Übernahme ist inzwischen veröffentlicht;
Durchführung und Abnahmegrenzen stehen im [Abschlussbeleg](production-2026-11-02-status.md).
Die folgenden Aussagen zu offenen Schritten beschreiben die Vorbereitung.
Die Freigabe umfasst den gesamten
veröffentlichten Dev-Stand einschließlich UTN-/KU-Import. Der Nutzer hat die
Rücksetzung fachlicher Produktionsdaten erlaubt und anschließend ausdrücklich
festgelegt, dass **alle bestehenden Nutzer** erhalten bleiben.

## Feste Ziele und Erhaltung

- Releasebasis: `dev`, Commit `cc14edfd05c09a9cd7fbf0227f7eb126e3ac8a26`.
- Bisheriges `main`: `230c2ad86af9700118e2f1456746292241461efc`.
- Produktionsprojekt: `db-bpl-drehpunkt`, Nummer `878536841109`.
- Nutzeradresse: `https://drehpunktlogistik.de`; tatsächlich beobachtete Weiterleitung
  auf `https://www.drehpunktlogistik.de`. Letztere ist die OAuth-Rückkehr-Origin.
- Die 15 vorhandenen Benutzerprofile und ihre Firebase-Anmeldungen bleiben
  erhalten, einschließlich deaktivierter Konten, Rollen und Modulrechte.
  Zugehörige Mitarbeiter-/HR-Profile, Abteilungen, persönliche Signaturen und
  Zugriffszuordnungen sind ebenfalls zu erhalten. Keine pauschale Datenbank- oder
  Storage-Löschung. Vor dem Reset Sicherung und konkrete Löschliste festhalten.
- Keine Dev-Testdaten und keine Dev-Verbindungstokens übernehmen. Outlook und
  DyCoS werden nicht zurückgesetzt. Produktion benötigt eigene Mailverbindungen.

## Bereits tatsächlich eingerichtet

| Zweck | Produktionszuordnung |
| --- | --- |
| Mail-Client | `6467756a-dff2-40b6-9000-1e9d8ae7ffc7` |
| Mail-Serviceprincipal | `857ecf5b-abca-45f7-ba08-36c656c826da` |
| DyCoS-Client | `5888fce8-b6fc-49dd-b061-5776d454040a` |
| DyCoS-Serviceprincipal | `99ee03ab-45b5-4d86-bf31-affd240b5c51` |
| Vorhandener Reminder-Client | `4c4c751c-5536-4050-9f8f-c7ad01c52419` |
| Reminder-Serviceprincipal | `af348c83-0710-4ea0-88e9-ac460472cff1` |

Mandant ist jeweils `b829bbdc-c0b7-4128-a341-6715a67b451b`. Die Kennungen sind
öffentliche Zuordnungen, keine Zugangsdaten.

Die beiden neuen Entra-Registrierungen wurden nach gesonderter ausdrücklicher
Zustimmung angelegt. Mail hat nur die sechs delegierten Rechte `User.Read`,
`Mail.Read`, `Mail.Send`, `Mail.Read.Shared`, `Mail.Send.Shared`, `offline_access`
mit Administratorzustimmung. Zuweisung ist erforderlich; die vorhandene Gruppe
„Drehpunkt – Mailzugriff“ ist mit Standardzugriff zugeordnet. Die bei Registrierung
vorhandene Eigentümer-Einzelzuweisung bleibt erhalten.

Der Exchange-Anwendungszugriff ist separat `Application Mail.Read`, ausschließlich
für `RecipientTypeDetails -eq 'SharedMailbox'`. Exchange gestattet keinen zweiten
identischen Management-Scope; deshalb wird der bereits vorhandene, historisch
„Drehpunkt-Mail-Dev-Shared-Read“ benannte Scope mit unverändertem Shared-Filter
verwendet. Die Produktionsrolle heißt „Drehpunkt-Mail-Production-Shared-Read“ und
ist an den neuen Produktions-Serviceprincipal gebunden. Tatsächlich bestätigt:
no-reply@ ist InScope True, persönliches bb@ ist InScope False. Kein unbeschränkter
Entra-Application-Mail.Read-Grant und kein Anwendungssende-/Schreibrecht.

Das neue DyCoS-RSA-3072-Zertifikat ist öffentlich in Entra gebunden, Thumbprint
`B3656377784930D858C9494093192633DC6FFC24`, Ablauf 02.11.2027. Der private Schlüssel
liegt ausschließlich im Windows-Benutzerverzeichnis mit eingeschränkten ACLs.
Kein privater Schlüssel liegt im Repository.

Die drei bestehenden SQL-Leseflows (Einzelauftrag, Stammdaten, Auftragssuche)
erlauben zusätzlich den Produktions-Serviceprincipal. Eigentümer und bisherige
Dev-Identität bleiben in ihrer jeweiligen Aufruferliste erhalten. Die eigentlichen
SQL-Abfragen und die SQL-Verbindung wurden nicht geändert. Die Callback-Adressen
wurden frisch aus den veröffentlichten Microsoft-Oberflächen übernommen und nur
lokal außerhalb Git abgelegt.

Im Produktions-Google-Projekt sind zwei eigene dynamische Secret-Rollen für den
ausführenden Compute-Serviceaccount eingerichtet: Erstellen auf Projektebene;
Versionszugriff/-pflege und Löschen nur mit einer IAM-Bedingung für
`projects/878536841109/secrets/drehpunkt-mailbox-`. Vorhandene andere IAM-Bindings
werden nicht ersetzt.

## Noch einzurichtende Secrets und Parameter

Die lesende Bestandsaufnahme fand neun bestehende Produktions-Secrets mit
aktiven Versionen. Deren Werte wurden nicht ausgelesen. Es fehlten folgende 15:

- DyCoS: `DYCOS_TENANT_ID`, `DYCOS_CLIENT_ID`, `DYCOS_SERVICE_PRINCIPAL_ID`,
  `DYCOS_CERTIFICATE_PEM`, `DYCOS_PRIVATE_KEY_PEM`, `DYCOS_FLOW_URL`,
  `DYCOS_MASTER_DATA_FLOW_URL`, `DYCOS_ORDER_SEARCH_FLOW_URL`.
- Mail: `MAILBOX_CLIENT_SECRET` des **neuen Produktions-Mailclients**.
- Erinnerungen: `POWER_AUTOMATE_REMINDER_URL`, `REMINDER_TENANT_ID`,
  `REMINDER_CLIENT_ID`, `REMINDER_SERVICE_PRINCIPAL_ID`,
  `REMINDER_CERTIFICATE_PEM`, `REMINDER_PRIVATE_KEY_PEM`.

Der Nutzer möchte die Secrets selbst anlegen. Dafür liegt
`integrations/microsoft/Set-ProductionSecrets.ps1` vor. Ohne `-Apply` prüft und
zeigt es nur Namen. Mit `-Apply` richtet es 14 Secrets aus den vorbereiteten,
geschützten lokalen Dateien ein; alle Dateien werden vorher auf Vorhandensein
geprüft. Es veröffentlicht keine Functions, ändert keine Fachdaten und richtet
`MAILBOX_CLIENT_SECRET` nicht ein. Dieses wird nach Erstellen des Clientgeheimnisses
interaktiv über `firebase functions:secrets:set MAILBOX_CLIENT_SECRET --project
db-bpl-drehpunkt` angelegt. Keine Secretwerte im Chat, Quelltext oder Log ausgeben.

Nicht geheime Functions-Parameter sind separat vorbereitet:
`MAILBOX_CLIENT_ID`, `MAILBOX_REDIRECT_URI`, `MAILBOX_FRONTEND_ORIGIN` und
`MAILBOX_ORDER_COMPANY_CURRENCY`. Die lokale projektspezifische `.env` ist ignoriert.

## Code des Releasekandidaten

Die Mailumgebung erlaubt ausschließlich die beiden bekannten Firebase-Projekte.
Produktion verlangt eine ausdrücklich konfigurierte eigene Client-ID und die
produktive OAuth-Callback-Adresse; die Dev-Client-ID und Dev-Origin werden dort
abgewiesen. Tokenabrufe und Anmeldung verwenden die konfigurierte Client-ID.
Empfänger in Produktion dürfen extern sein, Dev bleibt bei der exakten internen
Domain eingeschränkt. Besitz-, Profil-, Modul- und Versandsicherungen bleiben.

Webhooks verwenden das tatsächliche Serverprojekt. Die Entscheidung
[Webhooks ohne Kontrollabfrage](../../decisions/mailbox-recommendations-no-polling.md)
gilt unverändert auch für Produktion: keine regelmäßigen Inbox-/Delta-Abfragen,
keine Nachholsuche, fünf Minuten ausschließlich als Frischegrenze.

## Bisherige Prüfungen und offene Schritte

- 84 gezielte Mail-/Umgebungs-/Aktionsprüfungen ohne Fehler oder übersprungene Tests.
- Vollständiger ausgewählter Unit-/Vertragslauf über Functions, Shared und
  Client-Helfer: 1.076 Tests bestanden, keine Fehler oder übersprungenen Tests.
- 67 Integrations-/Rulesprüfungen mit isoliertem Firestore-Emulator ohne Fehler
  oder übersprungene Tests, einschließlich Produktions-Webhookziel, DyCoS,
  Erinnerungen, Besitzprüfung und privater Signalsammlungen.
- Lint, Build und Abgleich der 45 Shared-Module erfolgreich. Bekannte Warnung zu
  großen Build-Dateien bleibt. Eine veraltete Partnerkatalog-Testerwartung wurde
  auf das bereits eingeführte Gerichts-Gegenpartnerfeld korrigiert; der gezielte
  Nachlauf besteht.
- Echte lesende Tests mit neuer Produktions-Zertifikatsidentität: Einzelauftrag,
  Kunde 10001 und Auftragssuche (15er-Seite) erfolgreich. Auch die zertifikatsbasierte
  Anmeldung der separaten Produktions-Erinnerungsidentität ist erfolgreich.
  Keine Aufträge oder Stammsätze in Drehpunkt bzw. DyCoS dabei angelegt;
  keine Mail versendet.

Vor Umschaltung fehlen noch: Secrets, abschließende Schnittstellen-/Mailprüfungen,
gesicherte konkrete Rücksetzung mit Erhalt aller Nutzer, fertige Indizes und
Arbeitsprojektionen, gestuftes Backend-/Rules-Deployment, Vercel-Produktionsprüfung
und angemeldeter Browsertest. Der vorbereitete Produktions-Erinnerungsflow bleibt
bis zum kontrollierten Betriebsstart aus. Bisher keine Produktionsdaten gelöscht,
keine Produktions-Functions/Rules veröffentlicht und kein `main`-Push.
