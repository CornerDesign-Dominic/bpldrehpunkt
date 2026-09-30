# Manueller Dev-Smoke-Test: Länder-Normalisierung

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
