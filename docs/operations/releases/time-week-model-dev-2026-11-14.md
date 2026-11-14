# Beschriftete Wochenansicht und eigenes Arbeitszeitmodell

Stand 14.11.2026. Ziel ist die Dev-Umgebung. Grundlage ist Dev-Commit `75950d2`.

## Verhalten

Die freigegebene Variante Arbeitszeit im Balken zeigt die angerechnete Arbeit
am blauen Balken und die Tagessollzeit an der gestrichelten Linie. Gebuchte
Pause bleibt als eigener Abschnitt sichtbar. Auf Arbeit, Pause und Saldo haben
Info-Buttons mit einer vollständigen Tagesrechnung. Sie berücksichtigt den
automatischen Zusatzabzug und genehmigten Überstundenabbau. Bei fehlenden
Vorgaben, offenen vergangenen Tagen und Zukunftstagen erscheint kein
abschließender Saldo. Laufende heutige Werte sind vorläufig.

Mein Arbeitszeitmodell zeigt ausschließlich eigene Zeiträume mit Wochensoll,
Tagessoll, Pausenstufen und wirksamer Feiertagsregion. Aktuelle, zukünftige und
frühere Zeiträume sind erkennbar. Die Verwaltung erfolgt weiterhin ausschließlich
über die vorhandenen Superadmin-Funktionen.

## Daten und Rechte

Die neue Callable `getOwnTimeWorkModels` in `europe-west3` prüft App Check,
Firebase-Anmeldung, aktives Profil und eigenes Zeit-Leserecht. Sie fragt
Arbeitszeitmodelle ausschließlich für die angemeldete UID ab und liefert eine
Positivliste fachlicher Felder. Auch Superadmins können über diese Callable
keine fremde UID auswählen. Zeitmanager- und Personalrechte allein reichen
für die eigenen Modelle nicht aus. Es entstehen keine neuen Collections,
direkten Browserrechte oder Indizes.

Die Zeitberechnung, Stempel- und Korrekturfunktionen verwenden die bestehende
Logik. Die neue Oberfläche liest deren Tageswerte. Der Fachvertrag steht in
[Zeiterfassung](../time-recorder.md).

## Prüfungen

- 27 Node-Tests für Backend und gemeinsame Zeitberechnung sowie vier Prüfungen
  der gezielt auf Dev begrenzten Deploymentliste erfolgreich.
- 18 Emulatorprüfungen für Rechte und Zeitkonto erfolgreich, keine übersprungen.
  Die neue Leseprojektion ist mit Lesern, Bearbeitern, Superadmins, Zeitmanagern,
  fehlenden und inaktiven Profilen sowie Fremd-UID-Versuchen geprüft. Schreibrechte
  auf Modelle bleiben auf aktive Superadmins begrenzt.
- Bestehende React-/DOM-Suite einschließlich neuer Dialogrechnung,
  Überstundenabbau, fehlender Modelle, eigener Modellübersicht und Fehlerbehandlung
  erfolgreich.
- Lokales Chrome mit echten Komponenten und synthetischen Daten bei 1920, 1536,
  1366, 1024 und 800 Pixeln Fensterbreite in Light und Dark geprüft. Beschriftungen
  bleiben innerhalb des Diagramms und überlappen nicht. Info-Dialoge zeigen die
  erwarteten Werte; der Modellreiter zeigt drei eigene Gültigkeitszeiträume.
- ESLint, Web-Build und Abgleich der 50 Shared-Module erfolgreich.

Die Browserprüfung verwendet lokale synthetische Daten. Es wurden keine echten
Mitarbeiterbuchungen oder Modelle zu Testzwecken angelegt. Der angemeldete
Praxistest auf Dev ergänzt die automatisierten Prüfungen.

## Bereitstellung

Die neue Callable wurde gezielt im Projekt `db-bpl-drehpunkt-dev`
bereitgestellt. Der Web-Codecommit `78ba07c` ist über Branch `dev`
veröffentlicht. Vercel-Deployment `dpl_J9hxmqa6NcmjK7kTYi6t6iQMG6gG` meldet
`READY`; die Zuordnung des Alias `dev.drehpunktlogistik.de` zu genau diesem
Commit und Branch wurde über die Vercel-API zurückgelesen. Der vorherige
Dev-Codecommit ist `75950d2`.

Die neue Callable ist in Dev aktiv, Runtime Node.js 22, Revision
`getowntimeworkmodels-00001-qux`. Ein unangemeldeter Live-Aufruf aus dem Origin
`https://dev.drehpunktlogistik.de` wird mit HTTP 401 und `UNAUTHENTICATED`
abgewiesen. Die neue Funktion ist auch in der begrenzten Dev-Deploymentliste
enthalten.
