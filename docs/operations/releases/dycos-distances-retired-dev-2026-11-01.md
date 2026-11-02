# DyCoS-Streckenangaben entfallen auf Dev

Nutzerauftrag vom 01.11.2026: Die uninteressanten DyCoS-Kilometerangaben sollen
weder übernommen noch angezeigt werden. Ausschließlich Dev; Main und Produktion
bleiben unberührt. Vorheriger Dev-Stand: `bf9255d`.

## Verhalten

- Mapper übernimmt `Gesamtkilometer`, `Autobahnkilometer`, `Leerkilometer` und
  `KMGeroutet`/`Geroutet` aus Auftrag/Tour nicht mehr. Kein `imported.distances`.
- Aktuelle Distanzfelder entfallen auch aus Änderungsvergleich und Fingerprint.
  Beim normalen nächsten Abruf ersetzt der Import das Objekt ohne Altwerte;
  dadurch entstehen keine acht künstlichen Lösch-/Änderungseinträge.
- Die Distanzkarte, ihre Übersetzungen und ihr CSS entfallen. Historische
  Feldbeschriftungen und Kilometerformatierung bleiben für alte Historien erhalten.
- Drehpunkt-Routen unter `transportOrderRoutes` und die Tracking-Streckenanzeige
  bleiben erhalten. Kein Massenlauf, keine Änderung bestehender Historieneinträge.

## Prüfung

- Lint, Build und Shared-Abgleich (45 Module) erfolgreich.
- 37 Unitprüfungen für Mapper und Importänderungen erfolgreich.
- 31 Firestore-Emulatorprüfungen erfolgreich, keine übersprungen: neues/erneutes
  Importieren, alte Distanzwerte, historische Einträge, Wiederholungsschutz,
  Rechte und Erhalt der separat gespeicherten berechneten Route.
  Demo-Projekt `demo-drehpunkt-order-fields`, Port 8193; Emulator beendet.
- Acht Clientprüfungen für historische Darstellung erfolgreich.

## Veröffentlichung

Frontend und gezielt `fetchDycosTransportOrder`, `refreshTransportOrderWorkspace`
im Projekt `db-bpl-drehpunkt-dev`, Region `europe-west3`. Andere Mappernutzer
zur Rechnungsprüfung werten die entfernten Kilometerfelder nicht aus und
persistieren diesen Import nicht; sie benötigen hierfür kein Deployment.
Keine neuen Functions, Rules, Indizes, Secrets oder Datenmigration.

Vor Bereitstellung wurden 198 Dev-Functions als Vergleich erfasst. Durchführung
und tatsächliche Liveprüfung werden nach erfolgreichem Deployment ergänzt.

### Erfolgreiche Dev-Bereitstellung und echter Abruf

Fachcommit `5fb3432`. Gezielt beide genannten Functions mit explizitem
`--project db-bpl-drehpunkt-dev` bereitgestellt; CLI exit 0. Beide ACTIVE,
Vorher-/Nachher-Abgleich: 198 Functions, genau diese beiden aktualisiert,
übrige 196 unverändert, keine hinzugefügt/entfernt.

TA 261100028 anschließend über den normalen Dev-Fachreiter aktualisiert:
`imported.distances` vor Abruf vorhanden, danach nicht mehr vorhanden. Die
Aktualisierungshistorie meldet Auftragsdaten „Unverändert“, ohne künstliche
Distanz-Löschhistorie. Die eigene gespeicherte Route bleibt bei 1.350 km,
Status succeeded und demselben Änderungszeitpunkt vom 29.10.2026; auch
routeNeedsRecalculation bleibt false. Die zusätzliche Kontrollroute der
TA 261000764 bleibt unverändert bei 470 km. Keine echte Mail für diese Prüfung.

Frontend wird mit diesem Releasebeleg gemeinsam nach Dev gepusht; Vercelstatus
und sichtbare Darstellung werden anschließend am veröffentlichten Stand geprüft.
Main unverändert bei `230c2ad86af9700118e2f1456746292241461efc`.
