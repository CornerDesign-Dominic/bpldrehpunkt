# Buchungsjournal: neueste Buchung zuerst, Dev 13.11.2026

Auf ausdrücklichen Auftrag Datum und Stempelzeit in Alle Buchungen absteigend
sortieren. Auch Sekunden innerhalb derselben angezeigten Minute werden beachtet.
Der Seitenzuschnitt erfolgt nach dieser Reihenfolge, sodass erste und folgende
50er-Seiten lückenlos aufeinander folgen. Die aufsteigende Wochen-Tagesliste
und die Reihenfolge aufgeklappter früherer Stände bleiben erhalten.

Zwölf Node-Tests für Journal/Versionen/Pagination und die bestehende React-/DOM-
Regression erfolgreich. Abgedeckt: Reihenfolge über Datumsgrenzen, unterschiedliche
Sekunden bei gleicher sichtbarer Minute und Übergang zwischen 50er-Seiten.
ESLint und Web-Build erfolgreich abgeschlossen. Keine Datenänderung,
kein Backend- oder Produktionsdeploy; ausschließlich Dev-Frontend.
