# Drehpunkt – Release-Historie

Release-Notizen werden mit dem jeweiligen Release-Commit gepflegt. Das frühere
Nutzer-Updates-Modul ist entfernt und wird durch diese technische Historie nicht
ersetzt oder wieder eingeführt.

## 2.0.0 – Vernetzte Auftragsbearbeitung & Sendungsverfolgung

Veröffentlicht am **30.09.2026**. Release-ID: `v2.0.0`.
Git-Merge-Commit: `a18543a6324d8de834734297376cb84e9946f76e`.

### Neu

- **Auftragsimport:** Importierte Aufträge werden direkt als neu, aktualisiert
  oder fehlerhaft protokolliert. Kennzeichen aus Zugmaschine und Trailer werden
  dabei zu einem einheitlichen Auftragswert zusammengeführt.
- **Sendungsverfolgung:** Regelstufen unterstützen Stunden und Minuten. Die
  automatische Kurz-vor-Ladung-Anfrage, Frist-Erinnerungen und die bestehende
  Tracking-Automation sind getrennte, nachvollziehbare Abläufe.
- **Verknüpfungen:** To-dos und Fallmanager können mehrere Transportaufträge
  verknüpfen; Auftragsdetailseiten zeigen passende To-dos und
  Palettenbewegungen direkt an.
- **Palettenmanagement:** Bewegungen und Abschlüsse werden in Modalen erfasst
  und aus verknüpften Transportaufträgen direkt erreichbar gemacht.

### Verbessert

- To-do-Fristen können den Ersteller erinnern und erscheinen in dessen
  persönlichem Kalender. Listen sind nach Transportnummer, Aufgabe und
  Zuständigkeiten durchsuchbar und filterbar.
- Partner-Stammdaten zeigen Palettensaldo, Bewertungsranking und die
  überarbeitete Kreditlimit-Einstufung klarer an.
- Rechteprüfung, Datenintegrität, Import- und Automatisierungstests wurden
  erweitert.

### Freigabe

Der Release-Branch wurde über PR #2 nach `main` übernommen. Firestore-Indizes,
Firestore- und Storage-Regeln sowie Functions wurden zuvor im produktiven
Firebase-Projekt bereitgestellt. Die Rollenprüfung mit Standard-, Admin- und
Super-Admin-Konten erfolgt anschließend durch die Nutzer im Livebetrieb.

## 1.0.0 – Erstveröffentlichung von Drehpunkt

Veröffentlicht am **20.09.2026**. Release-ID: `v1.0.0`.
Git-Commit: `40bea56184344e1236fc88db281e234f18d8f11d`.

- Erster freigegebener Produktionsstand von Drehpunkt mit gemeinsamer
  Arbeitsoberfläche für die damals freigegebenen Bereiche.
- Die technische Zuordnung des Livegangs ist in
  `docs/operations/release-baseline.md` dokumentiert.
