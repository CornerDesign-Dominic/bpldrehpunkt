# Haftbarhaltung aus Transportaufträgen

Die Vorlage unter `/vorlagen/haftbarhaltung` sucht eine exakt eingegebene TA-Nummer in Drehpunkt. `findLiabilityTransportOrders` liefert ausschließlich die Dokumentdaten: TA-Nummer, Unternehmeranschrift und bekannte Lade-/Entladestellen mit Datum. Preise, Kontakte, Partnerdokumente und Importmetadaten werden nicht zurückgegeben. Auch reine Vorlagennutzer erhalten keinen allgemeinen Zugriff auf Transportaufträge oder Geschäftspartner.

Fehlt die TA, startet der Nutzer bewusst `fetchLiabilityTransportOrder`. Der vorhandene DyCoS-Import speichert Auftrag, benötigte Partnerverknüpfungen und Historie mit seinen bestehenden Identitäts-, Zeitraum-, Quoten-, Wiederholungs- und Parallelitätsprüfungen. Der spezielle Zugriff akzeptiert nur TA-Nummer und Anfrage-ID; allgemeine Import-/Aktualisierungsrechte bleiben getrennt. Die veröffentlichten Firestore- und Storage-Rules werden nicht erweitert.

Alle drei neuen Callables erfordern ein aktives Profil, App Check und `templates: view` oder `edit` (bzw. Superadmin). Das entspricht dem bestehenden Zugriff auf die Haftbarhaltung. Zusätzliche Import- oder Auftragsrechte sind nicht erforderlich. Der Zugriff wird auch beim Speichern des TA-Abrufs erneut geprüft.

Bei mehreren Lade-/Entladestellen wählt der Nutzer die betroffenen Stellen aus. Gibt es pro Art nur eine Stelle, ist sie vorausgewählt. Nicht ausgewählte Stellen erscheinen weder in Vorschau noch PDF. Fehlende Anschriftfelder/Termine werden pro Stelle als `missingFields` ausgewiesen und in der Oberfläche markiert; ein erfolgreicher Abruf gilt nicht als Nachweis vollständiger Daten. Daten und Datum bleiben korrigierbar. CSV-Altdaten enthalten gegebenenfalls nur erste/letzte Stelle als Freitext: Die Vorlage zeigt diese Originalangabe, erfindet keine fehlenden Zwischenstellen oder Adressbestandteile und weist auf Prüfung hin. Ohne verfügbare Stellen bleibt manuelle Erfassung möglich.

Das Belegdatum ist mit dem aktuellen lokalen Datum vorbelegt. Nach erfolgloser Suche fragt die Seite ausdrücklich „Aus DyCoS importieren?“. Der bestätigte Import übernimmt die Daten direkt in das Schreiben; es gibt danach keine zusätzliche Übernahmerückfrage. Während Suche/Import sind sämtliche Auftrags-, Unternehmer- und Stellenfelder in einem deaktivierten Feldbereich ausgegraut und mit Ladeanzeige überlagert. Belegdatum, Sachverhalt und KI-Formulierung bleiben unabhängig bearbeitbar. Auch bereits übernommene KI-Texte und Rückgängig bleiben beim Abschluss des Imports erhalten. Bei Auswahl eines anderen bereits vorhandenen Auftrags werden bisherige Auftragsdaten erst nach Bestätigung ersetzt; Sachverhalt, Belegdatum, Unterschrift und Stempel bleiben erhalten. Das Schreiben ist weiterhin ein lokaler Formularentwurf mit PDF-/Druckausgabe; es wird durch diesen Ablauf kein eigener Haftbarhaltungsvorgang gespeichert oder versendet.

## Optionaler Formulierungsvorschlag

`Vorschlag für Formulierung` übergibt nur den eingegebenen Sachverhalt (höchstens 4.000 Zeichen) an `suggestLiabilityWording`. Der Vorschlag wird geprüft und erst über `Formulierung übernehmen` eingesetzt. Rückgängig ist möglich, solange der übernommene Text nicht weiter bearbeitet wurde. Zwischenzeitlich geänderte Texte können nicht durch einen veralteten Vorschlag überschrieben werden.

Die festen Formulierungsregeln sind mit der bisherigen PDF-Auswertung in `functions/liabilityWordingRules.js` geteilt und inhaltlich unverändert: ein bis zwei kurze, neutrale Sätze, allgemeine Problembeschreibung, keine konkreten Zeiten, Beträge, Personen, Orte oder erfundenen Tatsachen/rechtlichen Bewertungen. Veröffentlichte `haftbarhaltung`-Fachanweisungen bleiben zusätzlich wirksam. Anschriften, Stellenauswahl, Belegdatum und feste Brieftexte werden durch den Vorschlag nicht geändert.

Der bewusst ausgelöste Textvorschlag ist in den bekannten Firebase-Projekten Dev und Produktion technisch zulässig; veröffentlicht wird zunächst ausschließlich nach `db-bpl-drehpunkt-dev`. Unbekannte Umgebungen sind gesperrt. Der bisherige PDF-Vorausfüllbutton ist aus diesem TA-Ablauf entfernt; die alte serverseitige PDF-KI-Auswertung bleibt in Dev gesperrt. Der Schlüssel `OPENAI_API_KEY_HAFTBARHALTUNG` bleibt im Secret Manager. Serverzeitbasierte `liabilityWordingQuotas/{uid}` begrenzen auf zehn Versuche pro Minute; direkte Clientzugriffe bleiben standardmäßig gesperrt. Die bestehende KI-Nutzungszählung enthält keine Sachverhaltstexte. Fehler laufen über die zentrale Diagnose, ohne Sachverhalte oder Zugangsdaten zu protokollieren.

## Prüfung und Veröffentlichungsgrenze

Gezielte Tests: `functions/liabilityWorkflow.test.js`, `functions/liabilityWorkflow.integration.test.js` (Firestore-Emulator), `src/templates/liabilityLetterContent.test.js` sowie die bestehenden DyCoS-/Diagnosetests. `npm run test:liability-ui` prüft die tatsächlich montierte React-Seite mit jsdom (nur Entwicklungsabhängigkeit). Externe Abruf-/KI-/PDF-/Signaturgrenzen sind kontrolliert ersetzt, Eingaben, Zustandswechsel und DOM bleiben echt. Die sechs Regressionen umfassen beide Abschlussreihenfolgen von Import/KI, übernommenen KI-Text mit Rückgängig, Wiederholungsabrufe, gesperrte Felder, fehlende Anschriften und keine doppelten Bereiche. Lint, Build und Shared-Abgleich ergänzen diese Prüfungen. Echte Benutzerabnahme: TA suchen, fehlende TA abrufen/speichern/wiederfinden, Mehrfachstellen auswählen, KI-Vorschlag prüfen/übernehmen/rückgängig, PDF und Rechte ohne Import-/Auftragszugriff.

Main/Produktion benötigen eine gesonderte Freigabe nach der Dev-Prüfung. Der konkrete Dev-Veröffentlichungsstand steht im Releasebeleg.

Dev-Umsetzung und verbleibende echte Abnahme: [Releasebeleg vom 04.11.2026](releases/liability-letters-dev-2026-11-04.md).


## Referenzierte Stationsanschriften

Leere direkte Stationsfelder bedeuten nicht automatisch, dass DyCoS keine Anschrift hat. Im Dev-Abruf wird `LadeEntladestellen.AdressID` gezielt nach `Adressstamm.ID` aufgelöst. Die zusätzliche Liste `stationAddresses` enthält nur ID und fünf Anschriftfelder. Der Adapter prüft exakte Zuordnung, doppelte und fremde IDs; er übernimmt referenzierte Anschriften nur bei vollständig leerem direktem Adressblock. Der exakt passende Auftraggeberdatensatz derselben Antwort kann ebenfalls die Referenz auflösen. Keine Zuordnung über ähnliche Namen oder Geschäftsnummern.

Positive Referenzen bleiben als `stops[].addressSourceId` erhalten; `addressSource` kennzeichnet `reference`, `inline` oder `unresolved-reference`. Ungelöste bzw. leere Referenzen erzeugen Warnungen. Strukturierte Stationen, erste Lade-/letzte Entladezusammenfassung, Suchdaten, Vorschau und PDF verwenden damit dieselbe Anschrift. Bereits gespeicherte Altaufträge benötigen einen bewussten Neuabruf; es gibt keinen stillen Vollimport bei jeder Suche.

Der neue Flow wird ausschließlich in Firebase Dev über Secret-Version 2 von `DYCOS_FLOW_URL` verwendet. Der ursprüngliche TA-Flow bleibt unverändert. Veröffentlichung und echte Abnahme stehen im [Releasebeleg](releases/liability-station-addresses-dev-2026-11-04.md).
