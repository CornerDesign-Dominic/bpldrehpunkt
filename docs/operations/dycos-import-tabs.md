# Getrennte Auftragsimporte

Stand: 01.11.2026. Dev-Veröffentlichung vom Nutzer am 01.11.2026 freigegeben. Main bleibt unverändert.

## Bedienung

- Die Auftragsliste bietet **Einzelimport** und **Sammelimport** nach Berechtigung an. Beide Links öffnen einen eigenen Tab.
- Einzelimport: TA-Nummer eingeben, importieren. Eigener Verlauf darunter.
- Sammelimport: leeres Ladedatum von/bis, optionale Relation; Suche mit kompakter Vorschau, Checkboxen und „Alle markieren“. Letzteres lädt zunächst die weiteren Ergebnisse. Untergrenze weiterhin Januar 2026, maximal 5.000 Treffer.
- Noch nicht gestartete Formulareingaben werden nicht gespeichert. Suchergebnisse, Suchkriterien und Checkboxauswahl bleiben in diesem Browser je Nutzer erhalten, bis daraus ein Import gestartet oder eine neue Suche begonnen wird.
- „Geladene Auswahl verwerfen“ entfernt die Suchergebnisse und Checkboxauswahl aus der Ansicht und der lokalen Speicherung und leert Zeitraum/Relation. Während einer laufenden Suche oder Übernahme ist diese Aktion gesperrt. Es wird kein Serverimport gestartet; bestehende Aufträge und Importverläufe bleiben erhalten.
- Ein gestarteter Import läuft im geöffneten Tab weiter, auch nach Navigation innerhalb desselben Tabs. Andere Tabs können währenddessen verwendet werden. Beim Schließen/Neuladen oder bei einem Browser-/Rechnerstopp wird keine Weiterarbeit versprochen: Die Anfragekennungen bleiben für eine sichere Wiederaufnahme erhalten.
- Bei Rückkehr wird ein während der Abwesenheit abgeschlossener Import einmal angezeigt. Nach dem nächsten Besuch sind die Eingaben wieder leer. Der Vorgang bleibt im Verlauf.
- Pausierte/fehlgeschlagene Vorgänge können fortgesetzt oder beendet werden. Bestätigte Übernahmen werden übersprungen; bei unklarer Antwort wird dieselbe Anfragekennung wiederverwendet. „Beenden“ entfernt keine bereits importierten Aufträge.

## Rechte

| Modul | Bearbeiten erlaubt |
| --- | --- |
| `transportOrderSingleImport` | Einzelimport starten und eigene Vorgänge fortsetzen/beenden |
| `transportOrderBulkImport` | DyCoS-Auftragssuche, Sammelimport und eigene Vorgänge fortsetzen/beenden |
| `transportOrderRefresh` | Vorhandenen Auftrag über „Auftrag aktualisieren“ aktualisieren; kein Anlegen eines fehlenden Auftrags |

Die drei Rechte sind unabhängig und werden in der Mitarbeiterverwaltung einzeln vergeben. Das bisherige `dataImports` bleibt für Stammdatenimporte zuständig und gewährt keine der neuen Auftragsaktionen. Bestehenden Nutzern werden keine neuen Rechte automatisch zugewiesen. Superadmins behalten entsprechend dem bestehenden Rollenmodell Vollzugriff. Admins erhalten dadurch keine Importrechte, dürfen aber den gemeinsamen Verlauf lesen. Eigene Detail-/Verlaufsabfragen sind auf Nutzer und Importart begrenzt; die Serverprüfung ist unabhängig von ausgeblendeten Schaltflächen.

Wird eine Importberechtigung während eines offenen Vorgangs entzogen, kann dieser keine weiteren Aufträge speichern. Startet der Nutzer später eine andere, weiterhin erlaubte Importart, wird der nicht mehr erlaubte alte Vorgang atomar beendet, damit er die erlaubte Arbeit nicht dauerhaft blockiert.

## Gemeinsamer Verlauf

`/admin/importverlauf` zeigt für Admins/Superadmins alle Nutzer und Importarten, einschließlich Auftragsaktualisierungen sowie früherer CSV-/DyCoS-Einträge. Neue persönliche Verläufe filtern ausdrücklich auf die neue Importart und den ausführenden Nutzer; historische Einträge ohne Importart bleiben im gemeinsamen Adminverlauf erhalten.

Ein Sammelimport hat einen Vorgang mit einzelnen Ergebnissen. Im Detailmodal stehen TA-Nummer, Ergebnis, Fehler/Änderungen und ein Auftragslink. Noch nicht bearbeitete Positionen eines beendeten Vorgangs heißen „Nicht importiert“. Fehlerhafte Abrufe erzeugen keine leeren Aufträge. Bestehende Daten, manuelle Werte, Partnerkonflikte, Auftragshistorien und Trackingregeln werden weiter durch denselben Importpfad behandelt.

Alle Verläufe laden maximal 25 Vorgänge pro Anfrage. „Mehr anzeigen“ lädt die nächsten 25; Sortierung nach Startzeit und Dokument-ID vermeidet Lücken bei gleichen Zeitstempeln. Details werden erst beim Öffnen geladen. „Verlauf aktualisieren“ aktualisiert auf Wunsch; es gibt kein Hintergrund-Polling und keine neuen regelmäßigen Dienste.

## Speicherung und Last

- `transportOrderImportRuns/{runId}`: kleine Zusammenfassung mit Nutzer, Importart, Gesamtzahl, Ergebniszählern und Status. Persönlicher und gemeinsamer Verlauf benutzen dieselben Dokumente.
- `selection/{chunkId}` darunter: unveränderliche Auswahl, bis zu 100 Anfragen pro Block; maximal 50 Blöcke. Die Auswahl wird nicht indiziert. Pro TA werden nur Zusammenfassung, passender Auswahlblock und Ergebnis gelesen, nicht die gesamte Auswahl.
- `rows/{requestId}`: genau ein Ergebnis je Anfrage. Erfolgreiche Übernahme, Ergebniszähler und bestehende Anfragequittung werden atomar mit dem Auftrag geschrieben. Ein später Fehler ersetzt niemals einen bereits gespeicherten Erfolg.
- `dycosImportSessions/{uid}`: verweist auf den offenen Vorgang. Ein weiterer Start ist erst nach Abschluss/Beendigung möglich, auch in anderen Browsern. Innerhalb eines Browsers verhindert zusätzlich Web Locks eine parallele Ausführung mehrerer Importtabs. Unterstützt der Browser Web Locks nicht, startet der Import nicht.
- Vorhandenes Abruflimit und Abstand von 6,5 Sekunden bleiben erhalten. Kein neuer Microsoft-Flow und keine zusätzliche technische Identität nötig.
- Die Tabspeicherung ist je Nutzer getrennt. Bei Browserwechsel oder verlorener lokaler Speicherung kann der Eigentümer einen offenen Vorgang aus seinem Verlauf wiederherstellen.

## Dev-Veröffentlichung

Der Nutzer hat die Veröffentlichung auf Dev ausdrücklich beauftragt. Main und produktive Dienste bleiben unverändert.

1. Den zusätzlichen Firestore-Index für `transportOrderImportRuns` (Nutzer, Importart, Startzeit, Dokument-ID) und den Indexausschluss für `selection.items` veröffentlichen; Indexbereitschaft abwarten. Bestehende Indizes/Daten nicht entfernen. Rules benötigen keine Freigabe für die neuen serverinternen Dokumente.
2. Gezielt diese Funktionen auf `db-bpl-drehpunkt-dev` aktualisieren: `manageTransportOrderImport` (neu), `listTransportOrderImportRuns`, `fetchDycosTransportOrder`, `searchDycosTransportOrders`, `createManagedUser`, `updateManagedUser`, `listManagedUsers` sowie `refreshTransportOrderWorkspace`. Die Verwaltungsfunktionen nehmen die neuen Rechte entgegen bzw. geben sie korrekt zurück.
3. Frontend einmal gesammelt auf Dev veröffentlichen. Neue Rechte im Adminbereich gezielt vergeben; keine pauschale Migration aus `dataImports`. Bereits geöffnete ältere Importseiten danach neu laden.
4. Live mit berechtigtem und eingeschränktem Konto prüfen: neue Tabs, persönliche Abgrenzung, Auswahl/Wiederaufnahme, Gruppenverlauf, Adminansicht und 25er-Nachladen. Keine produktiven Aufträge oder alten Verläufe löschen.

## Nachweise

- 947 Unit-/Vertragstests ohne Fehler; darunter Tabsperre, gespeicherte Anfragekennungen, Abschlussbestätigung und Wiederherstellung aus dem Serververlauf.
- 38 Prüfungen mit Firestore-Emulator ohne Fehler: getrennte Rechte, fremde Verläufe, aktuelle Rechte beim Speichern, atomare Gruppenzähler, Fehler/Wiederholung, Stopp vor verspätetem Speichern, 25er-Seiten, Auswahl über Blockgrenzen und konkurrierende Starts.
- Lokale Browserprüfung mit isolierten Testdaten: Suche/Checkboxen bleiben erhalten; Sammel- und Einzelimport laufen nach Navigation weiter; Erfolg mit Detailmodal; danach leere Eingaben; Adminverlauf 25/50 Einträge. Keine Microsoft-/Firebase-Daten in dieser Browserprüfung verändert.
- Lint, Produktionsbuild und Prüfung der 42 geteilten Servermodule erfolgreich. Der bekannte Hinweis zu großen Build-Dateien bleibt. Live-Prüfung folgt erst nach Veröffentlichung.
