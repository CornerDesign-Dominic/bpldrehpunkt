# Zeiterfassung: Firebase-Dev-Bereitstellung 10.11.2026

Ausdrücklich beauftragt: Firebase-Dev-Anbindung, gezielte Bereitstellung der neuen
Functions, Regeln und Indizes sowie testbare PWA. Ziel aller Cloudänderungen:
`db-bpl-drehpunkt-dev` (Projektnummer `333005945148`), Datenbank `(default)`.
Keine Bereitstellung im Produktionsprojekt und keine Änderung bestehender
Produktionsdaten. Lokale Änderungen liegen auf `codex/time-recorder`; kein
GitHub-Push oder Merge wurde dafür ausgeführt.

## Testadressen

- Mitarbeiter-PWA: https://db-bpl-drehpunkt-dev-time.web.app
- Zusätzliche Drehpunkt-Web-Testansicht: https://db-bpl-drehpunkt-dev-web-time.web.app
- Arbeitszeitmodelle: https://db-bpl-drehpunkt-dev-web-time.web.app/admin/arbeitszeitmodelle
- Eigene Zeiterfassung: https://db-bpl-drehpunkt-dev-web-time.web.app/zeiterfassung

Beide zusätzlichen Hosting-Sites gehören ausschließlich zum Dev-Projekt. Die
bestehende Vercel-/Dev-Webadresse wurde nicht ersetzt. Beide öffentlich lesbaren
`firebase-target.json` bestätigen das Dev-Projekt und dieselbe bestehende
Dev-Web-App. Die Anwendung selbst verlangt weiterhin Anmeldung und aktives Profil.

## Backend

Diese elf Callables sind nach der Bereitstellung direkt aus der Cloud
zurückgelesen und als `ACTIVE`, `nodejs22`, Region `europe-west3` bestätigt:

```text
listTimeWorkspace
saveTimeWorkModel
saveTimeAccount
stampTime
correctTimeDay
getOwnMobileVacation
listManagedUsers
createManagedUser
updateManagedUser
replacePendingVacationRequest
processVacationRequest
```

Sechs neue und fünf gezielt aktualisierte Funktionen. Keine Mailtrigger,
Scheduler, Storage-Regeln oder sonstigen Functions als Deployziel hinzugefügt.
Die Quellanalyse benötigte vorhandene `MAILBOX_*`-Konfigurationsparameter;
exakt die vier vorhandenen Dev-Werte wurden aus der bestehenden Dev-Function
`beginMailboxConnection` übernommen. Keine neue Mailanbindung eingerichtet und
keine Server-Secrets kopiert oder geändert. Lokale env-Dateien bleiben ignoriert.

Firestore-Regeln nach Rücklesen semantisch identisch mit `firestore.rules`;
aktives Ruleset `21cc6b9e-d405-4b83-896f-e0b6bbb5e400`. Der erste Upload der
lesbaren Quelle scheiterte mit HTTP 503. Die vorhandene getestete Kompaktierung
wurde verwendet. Der anschließende CLI-Lauf meldete beim Release HTTP 409;
direktes Rücklesen bestätigte jedoch bereits das neue aktive Ruleset und den
vollständigen Quellenabgleich. Es wurden keine Rechte gelockert. Zwei bekannte
Compiler-Typwarnungen bleiben bestehen.

Index `timeHistory`: `userId ASC`, `kind ASC`, `createdAt DESC`,
Dokument-ID `DESC`; Cloudstatus **READY** direkt bestätigt. Indexkennung
`CICAgPjgiJoK`. Keine nur remote vorhandenen Indizes gelöscht.

## Firebase-Web-Anbindung und Hosting

Die öffentlichen SDK-Werte stammen direkt aus der bestehenden Dev-Web-App
`1:333005945148:web:75f24c0aa7b7fe6cb74639`; der zugehörige Enterprise-App-Check-
Site-Key wurde aus deren Dev-App-Check-Konfiguration gelesen. Werte wurden
ausschließlich in ignorierte lokale env-Dateien geschrieben, nicht in Git.

Firebase Auth und der vorhandene Dev-reCAPTCHA-Key wurden additiv um die vier
exakten `.web.app`-/`.firebaseapp.com`-Domains der beiden neuen Sites ergänzt.
Alle vorhandenen Domains bleiben erhalten; `allowAllDomains` bleibt false.
Keine globale App-Check-Abschaltung. Lokaler Debugmodus der PWA ist auf das
exakte Dev-Projekt und Loopback-Hosts beschränkt; veröffentlichte Domains
verwenden reguläre Enterprise-Attestierung.

Hosting-Versionen nach Rücklesen:

- PWA: `dcf4ddb7f501dde3`.
- Web-Testansicht: `e5cb407a78d19791`.

Beide Builds prüfen vor Veröffentlichung die wirksame Vite-Konfiguration gegen
das feste Dev-Projekt. Das PWA-Service-Worker-Precache enthält die gebauten
JS-/CSS-Dateien. HTML, Service Worker, Manifest und Build-Zuordnung werden nicht
dauerhaft zwischengespeichert. Die breitere Hosting-ignore-Regel der Web-
Testansicht wurde vor dem abschließenden Deploy korrigiert, damit auch deren
öffentliche Build-Zuordnung veröffentlicht wird.

## Tatsächlich geprüft

- 29 gezielte Backend-/Berechnungsprüfungen und 48-Shared-Modul-Abgleich erfolgreich.
- Acht zusätzliche Safeguard-Prüfungen der Dev-Build-/Deploy-Helfer erfolgreich.
- PWA: Lint, zwölf Tests und abgesicherter Dev-Build erfolgreich.
- Drehpunkt: Lint und abgesicherter Dev-Build erfolgreich.
- Beide Hosting-Startseiten und beide Build-Zuordnungen HTTP 200; Ziel jeweils
  `db-bpl-drehpunkt-dev`. PWA-Service-Worker HTTP 200 mit No-store-Header.
- Nicht angemeldete Aufrufe von `stampTime` und `listTimeWorkspace`: HTTP 401
  `UNAUTHENTICATED`, kein Schreiben.
- Nutzer meldete sich selbst mit vorhandenem Dev-Konto in der PWA an. Echte
  Anmeldung, App Check und eigener Datenabruf erfolgreich.
- Ein kurzer Testablauf am 10.11.2026 mit Kommen, Pausenbeginn, Pausenende und
  Gehen wurde über die normale PWA ausgeführt. Alle vier Ereignisse serverseitig
  zurückgelesen; nach Neuladen weiter vorhanden und abgeschlossen.
- Korrektur desselben Tages mit unveränderten Zeitpunkten, Grund `other` und
  sichtbarem technischem Dev-Testvermerk gespeichert. Historie bestätigt vier
  Vorher-/Nachher-Ereignisse und den Vermerk. Die Testnachweise bleiben in Dev.
- Eigene Urlaubsübersicht lädt erfolgreich einschließlich Drehpunkt-Feiertagen.
  Keine Urlaubsanträge oder Mails zum Ersatz einer Prüfung erzeugt.

## Noch einzurichten beziehungsweise separat abzunehmen

Im verwendeten Dev-Konto fehlen Arbeitszeitmodell und Urlaubsanspruch. Deshalb
zeigt die PWA Sollstunden null, vorläufigen Kontosaldo und noch keinen berechneten
Resturlaub. Diese Werte wurden nicht erfunden. Ein Dev-Superadmin kann Modell,
Kontostart/Anfangssaldo und gegebenenfalls Mitarbeiterrechte im neuen Web-
Testzugang einrichten; Urlaubsanspruch bleibt im Personalbereich.

Handyinstallation, tatsächlicher Offline-Neustart, ein vollständiger
Urlaubsgenehmigungsablauf sowie alle rollenbezogenen Browserfälle sind noch
fachlich abzunehmen. Die jetzige echte Prüfung bestätigt Anbindung und den
beschriebenen Stempel-/Korrekturablauf, keine vollständige Produktabnahme.
