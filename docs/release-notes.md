# Drehpunkt – Release-Historie

Die kurze, für alle aktiven Nutzer sichtbare Fassung liegt versioniert in
`src/lib/releaseNotes.js`. Diese Datei hält ergänzend den Release-Kontext für
Entwicklung und Fehlersuche fest. Patchnotes werden ohne Firestore-Editor im
jeweiligen Release-Commit gepflegt. Ein Vorschau-Eintrag wird erst nach dem
tatsächlichen Release mit Veröffentlichungsdatum, Release-ID und Commit als
`published` markiert. Im Produktionsprojekt zeigt die App ausschließlich so
markierte Versionen.

## 1.1.0 – Import & vernetzte Stammdaten (Vorschau, nicht veröffentlicht)

Veröffentlichungsdatum: noch offen. Release-ID und Git-Commit: noch offen.

### Neu

- **Stammdatenimport:** Kunden und Unternehmer können aus DyCoS-CSV importiert,
  geprüft und einzeln übernommen werden. Sichere Ergänzungen werden automatisch
  übernommen; fachliche Entscheidungen bleiben in einer gemeinsamen
  Prüfwarteschlange.
- **Transportaufträge:** CSV-Import, Auftragsliste und Detailansicht verbinden
  Aufträge mit Partnern und weiteren Arbeitsbereichen. Die Sonderbehandlung
  unklarer Unternehmerzuordnungen bleibt auf den TA-Import begrenzt.
- **Partner zusammenführen:** Mehrere Debitoren- und Kreditorennummern können
  einem Partner zugeordnet werden. Merge-Historie, archivierte Stammdatenblätter,
  direkte Weiterleitungen und die kontrollierte Trennung machen Änderungen
  nachvollziehbar.

### Verbessert

- Importergebnisse zeigen die tatsächlich betroffenen Partner und den
  Zuordnungsweg; Prüfentscheidungen und zusätzliche Nummern sind sichtbar.
- Rechteprüfung, Datenintegrität, Importprüfung und Tests für Merge/Trennung
  wurden ausgebaut.

### Technischer Hinweis zur Freigabe

Dieser Abschnitt beschreibt den geplanten Umfang auf `dev`, nicht einen
bereits veröffentlichten Produktionsstand. Vor einer Freigabe sind die
Patchnotes mit dem finalen Release-Commit abzugleichen. Veröffentlichungsdatum,
Release-ID und Commit dürfen erst dann eingetragen und der Status in
`src/lib/releaseNotes.js` auf `published` gesetzt werden.

## 1.0.0 – Erstveröffentlichung von Drehpunkt

Veröffentlicht am **20.09.2026**. Release-ID: `v1.0.0`.
Git-Commit: `40bea56184344e1236fc88db281e234f18d8f11d`.

- Erster freigegebener Produktionsstand von Drehpunkt mit gemeinsamer
  Arbeitsoberfläche für die damals freigegebenen Bereiche.
- Die technische Zuordnung des Livegangs ist in
  `docs/operations/release-baseline.md` dokumentiert.
