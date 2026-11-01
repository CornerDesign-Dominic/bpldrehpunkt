# Fallmanagement

Fallmanagement ist ein direkter Hauptmenülink nach `/fallmanagement`.
Der erste Reiter „Übersicht“ bleibt auf Nutzerwunsch inhaltlich leer und lädt
keine Falldaten. Reihenfolge der Fachreiter:

| Reiter | Bestehende Adresse | Modulrecht |
| --- | --- | --- |
| Übersicht | `/fallmanagement` | Mindestens ein Leserecht aus den vier Fachmodulen |
| Schäden | `/schaeden` | `damages` |
| Inkasso | `/inkasso` | `inkasso` |
| Gericht | `/legal-disputes` | `legalDisputes` |
| Insolvenzen | `/insolvenzen` | `insolvencies` |

Die gemeinsame Reiterleiste steht auf Listen und Detailseiten. Die bisherigen
URLs, IDs, Fallanlage mit Auftragsvorbelegung und Kalender-/Auftragsverknüpfungen
bleiben erhalten. Die Navigation erweitert keine Datenrechte: Einstieg und
einzelne Routen sind geschützt; nur erlaubte Fachreiter erscheinen. Funktionen,
Firestore-/Storage-Regeln und die vorhandenen Bearbeitungsrechte bleiben bestehen.

Im normalen Menübaum entfallen die vier Unterpunkte und der Aufklapppfeil.
Ein vorhandener persönlicher Favorit zu einem alten Bereich bleibt nutzbar;
die gespeicherten Favoriten werden durch diese Umstellung nicht gelöscht.
Der direkte Einstieg bleibt auch im eingeklappten und schmalen Menü erreichbar.

Die leere Übersicht benötigt keine neuen Lade-/Fehlerzustände oder Backendabfrage.
Die bisherigen Listen, Detailseiten und Formulardialoge werden weiterverwendet;
deren Lade-, Leer-, Fehler- und Abbruchverhalten bleibt erhalten. Der bestehende
Seitenfehlerfang samt zentraler Website-Diagnose umfasst auch das neue Layout.
Keine Erweiterung des Diagnose- oder Datenvertrags.

Automatische Prüfungen und tatsächliche Dev-Abnahme werden im passenden
Releasebeleg getrennt von der lokalen Implementierung festgehalten.
