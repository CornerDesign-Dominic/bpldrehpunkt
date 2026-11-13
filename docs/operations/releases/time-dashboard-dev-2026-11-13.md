# Dashboard-Zeitkachel: Dev-Anpassung 13.11.2026

## Umfang

- Drei gleich breite, mindestens 76 Pixel hohe Stempelaktionen über die Kachelbreite;
  auf schmalen Bildschirmen untereinander mit mindestens 56 Pixel Höhe.
- Klarer Status mit Symbol, Rahmen und größerer Schrift; Pause beenden als
  hervorgehobene Rückkehraktion, normaler Kartenrahmen/-hintergrund bleibt erhalten.
- Großzügige neutrale Tageswerte Heute gearbeitet, Gebuchte Pause und Zeitkonto.
  Kein Sollvergleich; zusätzlicher automatischer Abzug wird nur bei Bedarf
  gesondert ausgewiesen.
- Inhalt über die Kachelhöhe verteilt, abgetrennte größere untere Aktionsleiste
  für Zeitübersicht/Handy-Einstieg und Aktualisieren.

Ausschließlich Zeitkachel-Komponente und Dashboard-Zeitstile, Tests und
Dokumentation. Keine Änderung am Dashboard-Raster, an anderen Kacheln, Firebase,
Modulrechten, Buchungsabläufen, Handy-App oder Main/Produktion. Veröffentlichung
zunächst über den vorhandenen Dev-/Vercel-Weg.

## Prüfung

React-/DOM-Prüfung verwendet die echte Dashboard-Kachel: drei Stempelaktionen,
neue Tageswerte ohne Sollvergleich, korrekter Pausenstart/-ende-Aktionstyp,
Statuswechsel, Rückkehrhervorhebung und Link zur Zeitübersicht. Bestehende Tests
der Dashboard-Sitzung prüfen Rechte, Offlinefälle, Akteursbindung, veraltete
Antworten, Mehrfachklicks und verlorene Serverantwort. Vollständiges ESLint und
Web-Build gehören zur Veröffentlichungsprüfung. Keine Live-Testbuchungen angelegt.

## Höhenreserve für die Zeitkachel

Die obere Dashboard-Reihe erhält bis zu 480 Pixel Mindesthöhe. Bei geringer
Fensterhöhe sinkt diese Reserve mit der verfügbaren Höhe. Die Zeitkachel hält
ihre Inhalte in voller Höhe und scrollt bei Platzmangel. Ihre Aktionsleiste und
Abstände passen sich der tatsächlichen Kachelbreite an. Die untere Reihe
verwendet den übrigen Platz.

Lokale Chrome-Prüfung der echten Dashboard-Komponenten mit synthetischen
Zeitdaten bei 1920×1080, 1900×900, 1536×864, 1440×900, 1366×768 und 1280×720:
kein vertikaler oder horizontaler Scrollbalken in der Zeitkachel, auch im
Pausenstatus mit Zusatzabzug sowie Hinweisen auf vorläufigen Saldo und fehlende
Buchungen. Stempelaktionen bleiben 76 Pixel hoch. Bei 1024×600 und 900×500 ist
vertikales Scrollen möglich, ohne seitlichen Überlauf. Die bestehende
React-/DOM-Suite und sechs Dashboard-Sitzungstests bestehen. ESLint und
Produktionsbuild sind erfolgreich. Die Browserprüfung verwendet lokale
Testdaten und erzeugt keine Mitarbeiterbuchungen.
