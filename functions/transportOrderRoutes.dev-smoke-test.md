# Manueller Dev-Smoke-Test: Länder-Normalisierung

Dokumentationsstand: 28.10.2026. Die unten stehenden Fälle sind manuelle
Prüfanweisungen und kein aktueller Anbieter-Testnachweis. Automatisierte
Normalisierungs-/Queue-Tests stehen in `transportOrderRoutes.test.js`.

Dieser Check ist bewusst **nicht automatisiert**. Er darf nur mit einem vorhandenen,
berechtigten Dev-Login und einem eindeutig nicht-produktiven Transportauftrag ausgeführt
werden. Die Berechnung legt ein separates Ergebnis unter `transportOrderRoutes` ab, lässt
die Import-Rohdaten aber unverändert.

## Portugal

1. Einen Dev-Auftrag mit `PT 4505 SANTA MARIA DA FEIRA ARGONCILHE` als Ortswert öffnen.
2. Einmal `Strecke berechnen` auslösen.
3. Erwartung: Die Berechnung verwendet `PT` und den Ortswert `SANTA MARIA DA FEIRA ARGONCILHE`;
   die Teil-PLZ `4505` ist keine Suchvoraussetzung.
4. Ergebnis und Dev-Functions-Log auf einen erfolgreichen Geocoding- und Routing-Aufruf prüfen.

## Kosovo

1. Einen geeigneten Dev-Auftrag mit `XK` beziehungsweise `Kosovo` verwenden.
2. Einmal `Strecke berechnen` auslösen.
3. Erwartung: Die Suche wird mit `countrySet=XK` eingegrenzt.
4. Ergebnis dokumentieren. `XK` ist ein operativer Routing-Code für Kosovo und keine offiziell
   vergebene ISO-3166-1-Alpha-2-Kennung; deshalb ist dies der gezielte Anbieter-Kompatibilitätscheck.

Bei fehlendem berechtigten Login keine Zugangsdaten erstellen, erraten oder umgehen.

## Ergänzende Abnahme der Import-Routenberechnung

1. Nur freigegebene Dev-Testaufträge verwenden. Mehrere neue geeignete Aufträge
   importieren und die Verarbeitung über die Task-Warteschlange kontrollieren.
   Erwartung: getrennte Ergebnisse unter `transportOrderRoutes`, unveränderte
   Import-Rohdaten und ein dokumentierter Berechnungsversuch je Kandidat.
2. Parallele Importe prüfen: automatische Aufrufe teilen sich die zeitliche
   Begrenzung, statt gleichzeitig ungebremst TomTom aufzurufen.
3. Re-Import und wiederholte Task-Zustellung dürfen keinen bereits beanspruchten
   automatischen Versuch als neuen unkontrollierten Anbieteraufruf behandeln.
4. Für einen kontrollierten Fehlerfall den Versuchsstatus und Diagnosehinweis
   prüfen. Keine produktiven Secrets ändern oder echte Ausfälle provozieren.
5. Im Admin-Verbrauch die tatsächlich ausgelösten Routing-/Geocoding-Aufrufe
   kontrollieren. Dev kann echte TomTom-Anfragen und Verbrauch verursachen.

Umgebung, Auftragsreferenzen, Ergebnis und offene Punkte datiert festhalten.
