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
