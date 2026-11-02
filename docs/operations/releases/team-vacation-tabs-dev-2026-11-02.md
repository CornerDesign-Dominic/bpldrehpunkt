# Team und Urlaub mit Fachreitern auf Dev

Nutzerauftrag: Team in Team & Urlaub umbenennen und denselben direkten Einstieg
mit leerer Übersicht und Fachreitern wie die anderen Menügruppen schaffen.
Vertrag: [Team und Urlaub](../team-vacation-navigation.md).

## Umfang und Grenzen

Dev-Frontend auf Basis `190a810`, einschließlich der zwischenzeitlich auf Dev
veröffentlichten Partneränderungen. Kein Main-/Produktionsrelease. Keine
Änderungen an Functions, Firestore-/Storage-Rules, Indizes oder Datenmodell.
Kein Backend-Deploy für diesen Navigationsumfang erforderlich.

Neuer Einstieg `/team-urlaub`; bestehende Adressen `/team`, `/urlaub` und
`/urlaubsmanagement` erhalten. Die bisherigen Modulrechte und die eigene
Urlaubsmanager-Zuweisung bleiben getrennt, bestehende Routenprüfungen erhalten.
Die Übersicht fragt keine Fachdaten ab. Die beiden Urlaubsseiten erhalten
die definierte verbleibende Inhaltshöhe durch die neue Reiterleiste.

## Prüfung vor Veröffentlichung

- Lint, Build und Shared-Abgleich (45 Module) erfolgreich.
- 13 gezielte Tests für Navigation, Routen, Titel, Sidebarpräferenzen und
  getrennte Team-/Urlaubs-/Managerrechte erfolgreich.
- Lokaler Browser mit echter Navigation und synthetischen Fachinhalten:
  Übersicht leer, keine normale Unterliste, nur Team bzw. nur Mein Urlaub
  bei jeweiligem Modulrecht, nur Urlaubsmanagement bei Manager-Zuweisung.
  Ohne Rechte kein Einstieg; Management-Direktzugriff mit reinem Teamrecht
  verweigert und kein geschützter Inhalt gerendert.
- Englische Beschriftungen, eingeklappter Direktlink und die drei bisherigen
  persönlichen Favoriten geprüft.

Nach Dev-Veröffentlichung die drei echten Fachseiten, Kalenderhöhen und
Rückkehr zur Übersicht prüfen. Keine Urlaubsanträge anlegen, ändern oder entscheiden.
