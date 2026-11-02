# Qualität mit Fachreitern auf Dev

Nutzerauftrag: Qualität direkt aus dem Menü öffnen; die bisherigen Unterpunkte
als Fachreiter statt Untermenü darstellen. Erster Reiter ist eine zunächst leere
Übersicht unter `/qualitaet`. Danach folgen K.V.P., Handbuch, Grundregeln und
Wissenslücken. Führender Fachvertrag: [Qualität](../quality.md).

## Umfang und Grenzen

Dev-Frontend auf Basis `5a997f3`. Main und Produktion bleiben unverändert.
Listen, Detailadressen, Rückkehrnavigation und persönliche Favoriten behalten
ihre bisherigen Ziele. Die Reiterleiste bleibt auf Detailseiten sichtbar.
Fallmanagement und Qualität verwenden denselben Layoutbaustein.

Der Einstieg benötigt ein bestehendes Leserecht für K.V.P., Handbuch oder
Wissenslücken. Einzelne Bereiche behalten ihre jeweiligen Routenschranken;
Handbuch und Grundregeln verwenden weiterhin das Handbuchrecht. Keine neuen
Modulrechte und keine Änderungen an Datenmodell, Functions, Firestore-/Storage-
Rules oder Indizes. Kein Firebase-Deploy erforderlich. Die leere Übersicht
fragt keine Qualitätsdaten ab.

## Prüfung vor Veröffentlichung

- Lint, Build und Shared-Abgleich (45 Module) erfolgreich.
- 25 gezielte Prüfungen für Qualitäts-/Fallnavigation, Rückkehrziele,
  Sidebarpräferenzen und bestehende Partnerverknüpfungen erfolgreich.
- Lokaler Browser mit echten Navigationselementen und synthetischem Fachinhalt:
  leerer Einstieg, K.V.P.-Detail mit aktivem Reiter, getrennte Leserechte,
  verweigerter K.V.P.-Zugriff mit reinem Handbuchrecht, kein Einstieg ohne Rechte.
- Eingeklappter Direktlink, Deutsch/Englisch und Light/Dark geprüft. Bei 560 px
  kein horizontaler Überlauf. Fallmanagement-Einstieg und Schädenliste nach
  Umstellung auf den gemeinsamen Baustein geprüft.

Veröffentlichung ausschließlich über Dev. Anschließend echten angemeldeten
Einstieg, vier Fachbereiche, Detailnavigation und Fallmanagement erneut prüfen;
keine Fachdaten für diese Navigationsprüfung verändern.
