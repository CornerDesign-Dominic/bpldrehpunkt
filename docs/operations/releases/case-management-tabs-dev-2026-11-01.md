# Fallmanagement mit Fachreitern auf Dev

Nutzerauftrag: ein direkter Menüeintrag Fallmanagement statt vier Unterpunkten.
Neue leere Übersicht als erster Reiter; danach Schäden, Inkasso, Gericht und
Insolvenzen. Gemeinsames Layout auf Listen und Details, bestehende Adressen,
Fallanlage und Verknüpfungen erhalten. Fachvertrag: [Fallmanagement](../case-management.md).

## Grenzen

Dev-Frontend auf Basis `ab5df76`. Main und Produktion bleiben unverändert.
Keine Änderungen an Datenmodell, Modulrechten, Functions, Firestore-/Storage-
Rules oder Indizes. Der Einstieg benötigt ein bestehendes Leserecht aus den
vier Modulen; jeder Bereich behält seine eigene Routenprüfung. Die Übersicht
lädt keine Falldaten. Alte persönliche Favoriten bleiben nutzbar.

## Prüfung vor Veröffentlichung

- Lint, Build und Shared-Abgleich (45 Module) erfolgreich.
- 22 Prüfungen zu neuer Routenzuordnung, Rückkehrnavigation, Sidebarpräferenzen
  und bestehenden Geschäftspartner-/Insolvenzverknüpfungen erfolgreich.
- Lokaler Browser mit echten Navigationselementen und synthetischen Inhalten:
  Übersicht leer, alle vier Reiter und ein Detail samt Rückkehr, aktiver
  Direktlink, kein Aufklappbutton und keine normale Cases-Unterliste.
- Frontend-Rechtefälle: nur Schäden sichtbar bei Schäden-Leserecht;
  Inkasso-Direktaufruf damit verweigert und kein Fachinhalt gerendert;
  ohne Fallrechte kein Einstieg und kein Reiterbereich. Bestehende
  Bearbeitungsrechte und serverseitige Absicherung unverändert.
- Bestehende vier Favoriten erhalten und funktionsfähig; eingeklappter
  Einstieg bedienbar. Deutsch/Englisch, Light/Dark und 560-px-Rahmen ohne
  horizontalen Überlauf geprüft. Keine Browserfehler im geprüften Ablauf.

Veröffentlichung über einen gemeinsamen Dev-Push. Anschließend Vercelstatus,
direkten Einstieg, bestehende Listen und Detailnavigation im angemeldeten
echten Dev-Ablauf prüfen; keine Falldaten für diesen Navigationscheck ändern.
