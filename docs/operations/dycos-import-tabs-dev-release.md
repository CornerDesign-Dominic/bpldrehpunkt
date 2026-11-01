# Freigegebene Dev-Veröffentlichung: Einzel- und Sammelimport

Freigabe: 01.11.2026 durch den Nutzer. Ziel ausschließlich `dev` / `db-bpl-drehpunkt-dev` / `dev.drehpunktlogistik.de`. Main bleibt auf `230c2ad86af9700118e2f1456746292241461efc`.

Die Importänderung `92a2f2a` wurde mit dem inzwischen veröffentlichten Dev-Stand `89e7529` zusammengeführt. Die neue Auftrags-/Trackingansicht, Stationskarten, Finanzen, Profiländerungen, Wissensfunktionen und Erinnerungen bleiben erhalten. Die neue Aktualisierung über Auftragsreiter verwendet das getrennte Recht `transportOrderRefresh` und ruft den bestehenden Import ausdrücklich im Modus `refresh` auf. Ein zusätzlicher Integrationstest prüft diesen vollständigen Pfad ohne Einzelimportrecht.

Nach der Zusammenführung erfolgreich geprüft: 1.129 Unit-/Vertragstests; insgesamt 45 relevante Integrations-/Emulatorfälle (unveränderte erfolgreiche Fälle plus gezielte Wiederholung der beiden angepassten Testdateien). Lint und Produktionsbuild erfolgreich. Der bestehende Hinweis auf große Build-Dateien bleibt. Ein älterer Inkasso-Vertragstest wurde an das bereits auf Dev vorhandene Erinnerungsfeld `reminderOccurrence` angepasst; die Berechtigungsregeln selbst wurden dabei nicht geändert.

Die Veröffentlichung umfasst gezielt acht Funktionen: `manageTransportOrderImport` (neu), `listTransportOrderImportRuns`, `fetchDycosTransportOrder`, `searchDycosTransportOrders`, `createManagedUser`, `updateManagedUser`, `listManagedUsers` und `refreshTransportOrderWorkspace`. Ein Index für den persönlichen Importverlauf und der Indexausschluss für die Auswahlblöcke werden ergänzt; bereits vorhandene Cloud-Indizes bleiben erhalten. Keine Rules-, Storage-, Microsoft-Flow-, Secret- oder Produktionsänderungen und keine automatische Vergabe neuer Nutzerrechte.

Bereitstellungsstatus und abschließende Live-Prüfung werden separat unter `tmp/dycos-import-tabs-release-verification.json` festgehalten, damit die Veröffentlichung mit einem einzigen Frontend-Push auskommt. Die Bedienungs- und Berechtigungsregeln stehen in [dycos-import-tabs.md](dycos-import-tabs.md).
