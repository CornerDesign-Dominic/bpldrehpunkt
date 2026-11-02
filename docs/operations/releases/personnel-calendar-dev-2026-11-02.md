# Personalwesen und Kalenderhöhe auf Dev

Nutzerauftrag: Personalwesen wie die anderen Bereiche direkt mit leerer
Übersicht und Fachreiter Personal öffnen; der Feiertagskalender soll nach dem
Reiterumbau wieder die verfügbare Höhe nutzen.

## Umfang

Basis `c4e2603`, ausschließlich Dev-Frontend. Neuer Einstieg `/personalwesen`,
bestehende Personal- und Detailadressen erhalten. Das vorhandene Leserecht
`personnel`, Bearbeitungsrechte und HR-Callables bleiben unverändert. Keine
Functions, Firestore-/Storage-Rules, Indizes oder Datenmigration erforderlich.
Die neue Übersicht lädt keine Personaldaten. Main und Produktion unverändert.
Vertrag: [Personalnavigation](../personnel-navigation.md).

Beim Feiertagskalender fehlte durch die neuen Zwischencontainer die definierte
Höhenkette. Nur für dessen Desktoproute ab 1021 px bekommt der Dokumentbereich
eine volle Höhe mit automatischer Reiterzeile und verbleibender Inhaltshöhe.
Andere Reiter und schmale gestapelte Ansichten bleiben unverändert.

## Prüfung vor Veröffentlichung

- Lint, Build, Shared-Abgleich (45 Module) und zehn gezielte Tests für
  Modulnavigation, Rechtezuordnung und Sidebarpräferenzen erfolgreich.
- Lokaler Browser mit echter Personalnavigation und synthetischen Fachinhalten:
  leere Übersicht, keine Unterliste, aktiver Personalreiter im Detail,
  eingeklappter Einstieg, verweigerter Zugriff und kein Einstieg ohne Leserecht.
- Echte Kalenderkomponente mit gemockten Feiertagsdaten: Unterkante exakt am
  unteren Inhaltsrand (36 px Abstand zur Fensterunterkante bei 720 px Höhe),
  fünf und sechs Wochen, separat scrollbare Länderwahl. Bei 800 px Breite
  gestapelte Darstellung ohne horizontalen Überlauf. Beim Reiterwechsel entfällt
  die Kalenderhöhenklasse.

Nach Dev-Veröffentlichung angemeldete Personalnavigation und Kalender mit
echten Feiertagsdaten prüfen. Keine Personaldaten oder Urlaubsdaten bearbeiten.
