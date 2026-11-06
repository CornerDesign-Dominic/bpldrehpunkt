# Referenzierte Stationsanschriften – Dev-Korrektur 04.11.2026

## Ursache und Korrektur

Bei den betroffenen TAs sind die direkten Stationsfelder `Firma/Strasse/PLZ/Ort/Land` leer. Die Stationszeile enthält stattdessen `AdressID`; die bisherige TA-Antwort lieferte den dazugehörigen Adressstamm nicht mit. Damit ging die vorhandene Anschrift vor dem Haftbarhaltungsformular verloren. Die vorherige Feststellung „gespeicherte Anschrift leer“ war zutreffend, die vorgelagerte Ursache ist hiermit konkret geklärt.

Echter, lesender Quellabgleich für TA `261000124`: Station `168007` referenziert ID `15150`; der gezielte Abruf aus `Adressstamm.ID=15150` liefert die vom Nutzer bestätigte Anschrift LGH Hamburg, Bredowstr. 10, 22113 Hamburg, Land D. TA `261000123` verwendet dieselbe Ladestellenreferenz und eine weitere Referenz für die Entladestelle. Beide Zuordnungen werden unabhängig nach ID aufgelöst.

## Isolierte Schnittstelle

Eine Kopie des bestehenden Flows wurde als **Drehpunkt – DyCoS TA Dev mit Stationsadressen** angelegt: `bf08a1eb-5fd8-f111-84e9-6045bd93bcb8`. Der ursprüngliche Flow bleibt unverändert. Die Kopie behält die tenant-/benutzergebundene HTTP-Authentifizierung und die bestehende SQL-Verbindung.

Zwei ergänzte Lese-/Datenoperationen:

- `Stationsadressfilter`: aus Stationszeilen numerisch geprüfte `AdressID`-Filter bilden; doppelte IDs vor Abfrage entfernen.
- `Stationsadressen`: genau diese IDs aus `Adressstamm` lesen, ausschließlich `ID,Firma,Strasse,PLZ,Ort,Land`, maximal 2.000 Zeilen. Ohne Stationen wird `ID eq 0` abgefragt; kein unbeschränkter Stammdatenabruf.

Die bestehende Antwort wird um `stationAddresses` ergänzt. Der Adapter prüft auf doppelte/fremde/ungültige IDs und löst nur vollständig leere direkte Stationsanschriften auf. Teilweise vorhandene direkte Adressen werden nicht mit einem anderen Block vermischt. Herkunft und Referenz bleiben erhalten; fehlende Referenzdaten erzeugen ausdrückliche Warnungen. Die Auftragszusammenfassung und Haftbarhaltung verwenden dieselben aufgelösten Daten. Kein Sonderwert für eine einzelne TA und keine aus Freitext erfundene Adresse.

Nur Firebase Dev (`db-bpl-drehpunkt-dev`) verwendet die neue URL über Secret `DYCOS_FLOW_URL`, Version 2. Erfolgreich bereitgestellt: `fetchDycosTransportOrder`, `fetchLiabilityTransportOrder`, `refreshTransportOrderWorkspace`, Region `europe-west3`. Die nicht betroffenen Rechnungsprüfungs-Functions behalten ihre bisherige Secret-Version. Keine Rules-/Index-/Storage-Änderung. Keine URL, privaten Schlüssel oder Rohantworten im Repository.

## Prüfung

- 59 gezielte Unitprüfungen: Mapper, Importänderungen, Haftbarhaltung und Dokumentdaten; alle bestanden.
- Firestore-Emulator `demo-drehpunkt-liability`: 27 Prüfungen bestanden, keine übersprungen; darunter echte Speicherkette mit alter leerer Referenz, anschließend ergänzter Adressliste, gespeicherter Anschrift, Suchprojektion, Routenkennzeichnung, Historie, Erhalt manueller Daten und idempotenter Wiederholung. Emulator beendet.
- Gesamtlint, Build und Abgleich von 45 Shared-Modulen bestanden.
- Echte neue Flow-Antwort für beide betroffenen TAs geprüft; erwartete Anschrift wird geliefert. Nicht authentifizierter HTTP-Aufruf wird mit 401 verweigert. Der echte stationslose Auftrag `260500715` liefert null Stationen und eine leere `stationAddresses`-Liste; die zusätzliche Abfrage ist damit auch bei leerer Ausgangsliste begrenzt.
- Die bereits gespeicherten TAs `261000124` und `261000123` wurden über den regulären angemeldeten Dev-Einzelimport erfolgreich aktualisiert (jeweils Aktualisiert 1, Neu 0), mit bestehender Importhistorie. Kein fingierter Benutzer und kein direkter Wartungsschreibzugriff. Anschließend wurde `261000124` in einer neu geöffneten Haftbarhaltung aus Drehpunkt gesucht und ausgewählt: Formularfelder und Briefvorschau zeigen LGH Hamburg, Bredowstr. 10, 22113 Hamburg, D. Die sichtbare Fehlend-Markierung der Ladestelle ist verschwunden. Lokaler Screenshot: `tmp/liability-proof/ta-261000124-corrected.png` (nicht versioniert).

Main und Produktion bleiben unverändert. Die neue Dev-Flow-URL darf nicht ungeprüft in Produktion übernommen werden. Ein späterer Production-Release muss Flow/Secrets, Mapper und benötigte Functions gemeinsam freigeben.

Der aktuelle parallele Dev-Stand `afb2a49` wurde vor dem Commit ohne Konflikte übernommen; die anderen Änderungen wurden nicht überschrieben. Erneuter Build des zusammengeführten Standes erfolgreich.
