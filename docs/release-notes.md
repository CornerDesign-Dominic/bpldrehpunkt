# Drehpunkt – Release-Historie

Release-Notizen werden mit dem jeweiligen Release-Commit gepflegt. Das frühere
Nutzer-Updates-Modul ist entfernt und wird durch diese technische Historie nicht
ersetzt oder wieder eingeführt.

## Noch keinem neuen Release zugeordnet


### 29.10.2026 – Sendungsverfolgung: Fortschritt und Historienlücken, ausschließlich Dev

Spätere bestätigte Transportereignisse lösen überholte operative Warnungen ab.
Fehlende frühere Angaben erscheinen separat als neutrales Historien-Icon in
Auftragsliste und Trackingdetail, einschließlich Feldliste im Tooltip. Ohne
Entladeankunftszeit beendet bestätigter Entladefortschritt die Fahrprognose mit
neutralem Haus und unbekannter Pünktlichkeit. Uhrzeiten werden nicht ergänzt.
Ablaufstufen und Hilfe berücksichtigen die sechs vereinbarten Fälle;
Automatikpause und manueller Nachtrageablauf bleiben unverändert.

Freigabe ausschließlich für Dev. Isolierter Stand geprüft: 101 gezielte Tests,
Lint, Build und Functions-Shared-Abgleich bestanden. Browserprüfung in beiden
Themes und mit angemeldetem Nutzer offen; Computer Use konnte die Browseradresse
nicht sicher erkennen. Keine Rules-, Index- oder Datenmigration erforderlich.
Backendumfang: `listTransportOrdersPage`, `getShipmentTrackingAttention`,
`getShipmentTrackingForecast`, `refreshShipmentTrackingForecast` und
`refreshShipmentTrackingForecastOnUpdate` in `db-bpl-drehpunkt-dev`.
Alle fünf Functions am 29.10.2026 erfolgreich aktualisiert. Frontendfreigabe
über den zugehörigen Commit auf `dev`; Vercel-Status separat prüfen.


### 29.10.2026 – Manueller DyCoS-TA-Abruf, ausschließlich Dev

TA-Eingabe auf der Importseite ergänzt, mit serverseitiger Zertifikatsanmeldung,
validierter JSON-Zuordnung, genauer Partneridentität und atomarer, wiederholungs-
sicherer Speicherung. CSV bleibt für noch nicht umgestellte Aufträge verfügbar.
Technische Fehler erscheinen in der Diagnose; bestehende Trackingregeln gelten
bei ausreichenden Daten weiter. Dev-Secrets und sieben benötigte Functions
sind bereitgestellt. Oberfläche dieses Umfangs über `dev`, keine Main-/
Produktionsfreigabe. Details und offene fachliche Zuordnungen unter
[DyCoS-Veröffentlichung](planning/dycos-csv-import-uebergangsloesung.md#19-freigegebener-dev-veröffentlichungsumfang-am-29102026).

Dieser Abschnitt erfasst Änderungen nach 2.0.0 und ersetzt keine datierte
Releasefreigabe oder Deploymentprüfung. Stand der Dokumentationspflege:
28.10.2026.

Bereits im Git-Stand von `main` und `dev` vor der aktuellen Arbeit enthalten:

- Deutsch/Englisch als persönliche Oberflächensprache; bekannte Übersetzungslücken bleiben dokumentiert.
- Gemeinsame AGB-Prüfhistorie und neue Dashboard-Hinweise.
- Statusmail-Eingang und KI-Auswertung mit manuellem Review sowie Tracking-Editor direkt neben der Eingangsmail.
- Tracking-Prognosen, Handlungshinweise und erweiterte administrative Einstellungen.
- Automatische Routenberechnung nach Auftragsimport mit zeitlich begrenzter Warteschlange.
- Persönliche Auftragslistenfilter und Notizansichten.

Aktuelle Weiterentwicklung auf `dev`:

- Fehlende Bereitstellung der bereits vorhandenen Callable für persönliche Listenfilter nachziehen.
- Speicherfehler bei Listenansichten sichtbar machen und erneutes Speichern ermöglichen; schnelle Änderungen zusammenfassen und geordnet speichern.
- Bestands-, Umgebungs- und Zugriffsdokumentation bereinigen; historischen Releasebeleg vom laufenden Releaseverfahren trennen.

Konkrete Prüf- und Bereitstellungsstände stehen in
`operations/documentation-inventory.md`. Es wird keine neue Versionsnummer oder
vollständige Produktionsfreigabe behauptet.

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
