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
