# Dokumente und Werkzeuge mit Fachreitern auf Dev

Nutzerauftrag: denselben direkten Einstieg wie Fallmanagement und Qualität
für Dokumente und Werkzeuge umsetzen. Leere Übersicht, danach die bisherigen
vier Unterpunkte als Reiter. Vertrag: [Dokumente und Werkzeuge](../documents-tools.md).

## Umfang

Dev-Frontend auf Basis `0caf1e9`. Neuer Einstieg `/dokumente-werkzeuge`;
bisherige Adressen einschließlich beider Vorlagenformulare bleiben erhalten.
Bestehende Modulrechte bleiben getrennt. Die Übersicht lädt keine Fachdaten.
Keine Änderungen an Functions, Firestore-/Storage-Rules, Indizes oder Datenmodell;
kein Firebase-Deploy erforderlich. Main und Produktion bleiben unverändert.

## Prüfung vor Veröffentlichung

- Lint, Build und Shared-Abgleich (45 Module) erfolgreich.
- Acht gezielte Tests für die drei Fachreiterbereiche und Sidebarpräferenzen
  erfolgreich; Routen, bestehende Titel und Modulzuordnung geprüft.
- Lokaler Browser mit echten Navigationselementen und synthetischem Inhalt:
  Übersicht leer, kein normales Untermenü, Vorlagenreiter auch im Detail aktiv.
- Mit reinem Dokumente-Leserecht nur Übersicht und Dokumente sichtbar;
  Vorlagendetail verweigert. Ohne Modulrechte kein Einstieg und keine Fachinhalte.
- Eingeklappter Direktlink, Deutsch/Englisch, Light/Dark und Erhalt der vier
  bisherigen persönlichen Favoriten geprüft.

Veröffentlichung ausschließlich auf Dev. Anschließende angemeldete Prüfung
der vier realen Bereiche und der Vorlagenformulare ohne Speichern, Upload oder
Auslösen einer AGB-Prüfung vorgesehen. Die Prüfung ändert keine Fachdaten.
