# Lokaler Prüfbeleg für den Dev-Kandidaten

Stand: 31.10.2026. Branch `codex/cost-efficiency-dev-release`, Basis
`5e9586145b2df0c939d10fa455f699653e1f40ba`. Dies dokumentiert den isolierten
Kandidaten, nicht den abweichenden ursprünglichen Arbeitsordner und nicht
bereits bereitgestellte Cloudrevisionen.

## Automatisch geprüft

| Prüfung | Ergebnis |
| --- | --- |
| Unit-/Vertragstests aus `src`, `shared`, `functions`, ohne `tmp`, Abhängigkeiten oder doppelte Shared-Kopie | 808 bestanden, keine übersprungen |
| Firestore-Integration, sämtliche 29 vorhandenen/neuen Integrationsdateien, lokale Demo-Projekte | 117 verschiedene Prüfungen erfolgreich nach der unten beschriebenen Isolationskorrektur, keine übersprungen |
| `npm run lint` | bestanden |
| `npm run build` | bestanden; bestehende Größenwarnung für große Bibliotheks-Chunks bleibt |
| `npm run check:functions-shared` | 42 deploybare Shared-Module konsistent |
| `node --check functions/index.js` und tatsächlicher Import | bestanden, 170 Function-Endpunkte ladbar |
| Functions-Paket aus frischem Lockfile-Install in separatem temporärem Ordner | 260 Pakete installiert, 170 Endpunkte und natives Canvas ladbar, keine Frontend-Projektabhängigkeit nötig |
| Release-Bestandteilliste gegen Code und Basis | 34 eindeutige geplante Functions vorhanden, alle zwölf neuen Exporte erfasst |
| Erhaltungsprüfung gegen Basis mittels Syntaxbaum/Strukturvergleich | alle 158 bisherigen Exporte und 58 Routenpfade erhalten; alle zwölf bisherigen Composites erhalten, insgesamt 71 eindeutige Composites |
| Bestehende Laufzeitabhängigkeiten/Storage | alle Functions-Versionen außer entfernter lokaler Frontend-Abhängigkeit erhalten, Canvas 1.0.9 erhalten, Storage-Rules unverändert |
| Lesendes Readiness-Werkzeug | Zielschutz und Zustände getestet; leerer lokaler Demo-Bestand korrekt als unvollständig mit Exit 2 erkannt |
| `git diff --check` | bestanden |

Der vollständige Integrationslauf hatte zunächst **116 erfolgreiche Prüfungen
und einen Fehler**: Ein bestehender DyCoS-Test mit fester Auftragsnummer
verwendete dasselbe Demo-Projekt über mehrere Läufe und fand seine alte Anlage.
Er erhielt deshalb korrekt `unchanged`, erwartete aber `new`. Der Test verwendet
nun ein eigenes Demo-Projekt je Prozess. Seine komplette Datei wurde danach mit
**19 von 19** erfolgreichen Prüfungen erneut ausgeführt. Die übrigen 98
Integrationsprüfungen waren bereits erfolgreich; die Import-Fachlogik wurde zur
Behebung dieses Testfehlers nicht geändert. Das ist kein zweiter vollständiger
Gesamtlauf nach der Korrektur.

Die Emulatorprüfungen enthalten Datenaufbau/Fortsetzung, große Arbeitsmengen,
konkurrierende Änderungen, doppelte Anfragen, Fehler nach extern angenommener
Aktion, KI-Reservierung und manuellen Review, Listen-/Kalendervergleich,
Relationszähler, Palettenabgleich und verweigerte Rechte. Bestehende neuere
DyCoS-, Postfach-, Wissens- und Qualitätsprüfungen waren eingeschlossen.
Externe Dienste sind in diesen Abläufen ersetzt; es wurden keine echten Mails
oder Modellanfragen ausgelöst. Der lokale Emulator wurde anschließend beendet.

Der Paketinstall nutzte `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`
in einem separaten temporären Ordner. Er verändert keine Abhängigkeiten im
ursprünglichen Arbeitsordner. Installations-/Ladetest unter Windows ist kein
Nachweis einer Linux-Cloudbereitstellung oder einer aktuellen Sicherheitsprüfung
der gesamten Abhängigkeitskette; vorhandene npm-Deprecationhinweise bleiben.

## Bewusst noch offen

- Echte angemeldete Browserabnahme dieses zusammengeführten Kandidaten,
  einschließlich zwei gleichzeitiger Nutzer, Palettenkonflikt mit offenen
  Eingaben und abgelaufener KI-Reservierung. Frühere Browserprüfungen des alten
  Arbeitsordners gelten nicht als Abnahme dieses Kandidaten.
- Tatsächlicher Cloud-Indexaufbau, Cloud-Tasks-Zustellung und minimale IAM-Rechte,
  App Check, aktive Secrets-Bindungen und Function-Revisionen im Dev-Ziel.
- Initialisierung der Dev-Daten und Readiness im realen Projekt. Das lesende
  Werkzeug wurde dort nicht mit neuen Anmeldedaten ausgeführt.
- Vercel-Dev-Konfiguration, tatsächliche Anmeldung und Laufzeitverhalten nach
  Veröffentlichung; lokale Builds bestätigen diese Punkte nicht.
- Reale Read-, Laufzeit- und Rechnungsauswertung bei vergleichbarer Nutzung.

Die defensive Erkennung manuell beschädigter Paletten-Summengruppen und die
verbleibenden breiten Suchpfade sind in den Fachverträgen ausdrücklich
beschrieben. Sie sind keine verdeckte Zusicherung konstanter Lesekosten.

Kein Push, Deploy, Produktionszugriff oder Dev-Datenumbau wurde ausgeführt.
Der [gestufte Releaseplan](cost-efficiency-dev-release.md) beschreibt die noch
ausstehenden Schritte einschließlich Palettenwartung und Rückweg.
