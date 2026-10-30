# DyCoS-Datenbankstruktur

Stand der Zusammenstellung: **30.10.2026**. Stand der Tabellenübersicht: **29.10.2026**.

Diese Arbeitsdokumentation sammelt die bereits belegten Informationen. Jede zugängliche Tabelle/Ansicht hat einen eigenen Abschnitt. Fehlende Felder und Beziehungen bleiben ausdrücklich offen; sie werden nicht aus ähnlich klingenden Namen erraten. Es werden keine tatsächlichen Geschäftsdatensätze oder Zugangsdaten aufgeführt.

## Umfang und Verlässlichkeit

- **643 eindeutige Tabellen-/Ansichtseinträge** wurden mit der bestehenden SQL-Verbindung über `Tabellen abrufen (V2)` geliefert; kein Fortsetzungslink war enthalten. Das ist die Sicht dieses Verbindungskontos, kein Nachweis über sämtliche internen Datenbankobjekte.
- Die Antwort unterscheidet Tabellen und Ansichten nicht. Der Objekttyp bleibt deshalb offen.
- **13 Datenbankobjekte haben bekannte Feldlisten** aus dem vorhandenen Feldkatalog und den bestehenden Flow-/Adapterverträgen. Die übrigen **630 Abschnitte** sind bewusst als noch nicht erhoben gekennzeichnet.
- **1.005 Feldbezeichnungen über diese 13 Objekte** sind erfasst (je Objekt dedupliziert). Sie stammen aus dem bisherigen Feldkatalog; die aktuell verwendeten Adapter-/Flowfelder wurden dagegen abgeglichen. Diese Listen sind kein frisch ausgelesenes vollständiges SQL-Schema.
- Exakte **SQL-Datentypen, Längen, NULL-Regeln, Defaults, Indizes sowie PK-/FK-Constraints sind noch nicht erhoben**. Ein JSON-Zahlwert oder eine Adapterprüfung beweist keinen SQL-Datentyp.
- Die untenstehenden Verbindungen sind **im Arbeitskatalog beziehungsweise im Integrationsablauf bestätigte Zuordnungen**, keine aus SQL ausgelesenen Fremdschlüsseldefinitionen. Kardinalitäten werden nicht als Datenbankgarantie behauptet.

## Quellen

1. **Q1 – Metadatentest:** manuell gestarteter Flow „Drehpunkt – DyCoS Strukturtest“, Flow-ID `00acdc15-8000-e675-4ca3-f4fe02a343d5`, erfolgreicher Lauf `08584082935312164998421656525CU29` vom 29.10.2026. Liefert technische Namen und Anzeigenamen der 643 sichtbaren Objekte. Die lokale JSON-Testausgabe ist nicht Bestandteil dieser versionierten Dokumentation; interne Connector-Adressen wurden nicht übernommen.
2. **Q2 – Bereitgestellter Feldkatalog:** `DyCoS_SQL_Feldkatalog_V2.pdf`, Version 2.0, Stand 28.10.2026. Arbeitskatalog aus begrenzten SQL-Flow-JSON-Stichproben; keine offizielle vollständige Schemaauskunft des Herstellers. Feldbezeichnungen und Einstufungen wurden aus der vorhandenen Textauswertung übernommen und identische Bezeichnungen je Tabelle dedupliziert. Einzelne lange Namen oder Hinweise können im PDF/der Textextraktion verkürzt sein; eine spätere echte Schemaauskunft hat Vorrang.
3. **Q3 – Bestehende Integration:** [Planungs- und Prüfdokumentation](../planning/dycos-csv-import-uebergangsloesung.md), [TA-Adapter](../../functions/dycosOrderMapping.js), [Stammdatenadapter](../../functions/dycosPartnerData.js) und [eigenständiger Stammdatenabruf](../../functions/dycosMasterData.js). „Adapter/Flow“ bedeutet: Der Feldname wird im vorhandenen Integrationsvertrag beziehungsweise im aktuellen Adaptercode verwendet. Das ist kein zusätzlicher Nachweis eines Live-Schemaabrufs oder des Veröffentlichungsstands dieses Codes und sagt nicht, dass alle übrigen Katalogfelder aktuell nach Drehpunkt importiert werden.

## Ergebnis des einfachen Spaltentests

Der direkte Zugriff auf `[INFORMATION_SCHEMA].[COLUMNS]` wurde als begrenzter Test für `Auftraege` vorbereitet (maximal drei Metadatenzeilen). Der SQL-Connector wies bereits die dynamische Schemaabfrage `GetTable_V2` mit HTTP 400 / `DynamicOperationRequestClientFailure` zurück: „Der Schlüssel entsprach keiner Zeile in der Tabelle.“ Die Systemansicht war über diesen einfachen Tabellenzugriff nicht als abrufbares Objekt erkennbar. Deshalb wurde daraus keine Spaltenliste gewonnen; es war kein erfolgreicher SQL-Spaltenabruf. Der gespeicherte Testflow enthält wieder nur manuellen Auslöser und Tabellenübersicht.

Dieser Fehler beweist weder das Fehlen der Spalteninformationen in SQL Server noch grundsätzlich fehlende Metadatenrechte. Er begrenzt den getesteten Connector-Weg. Die Aktion „SQL-Abfrage ausführen (V2)“ unterstützt Gateway-Verbindungen laut [Microsoft-Connector-Dokumentation](https://learn.microsoft.com/en-us/connectors/sql/) nicht.

**Nachtest am 30.10.2026 – `sys.sp_columns`:** Im separaten manuellen Testflow wurde „Gespeicherte Prozedur ausführen (V2)“ mit der bestehenden Verbindung und dem benutzerdefinierten Prozedurnamen `[sys].[sp_columns]` vorbereitet. Ziel war ausschließlich `dbo.Auftraege`. Bereits die Parametererkennung `GetProcedure_V2` scheiterte mit HTTP 400 / `BadRequest`: „Der Schlüssel entsprach keiner Zeile in der Tabelle.“ Auch nach Neuladen wurden keine Tabellenparameter angeboten. Die Prozedur wurde deshalb nicht ausgeführt; es wurden keine Spaltenmetadaten oder Geschäftsdatensätze abgerufen. Der fehlgeschlagene Testschritt wurde entfernt. Ob die Ursache in der Connector-Auflösung oder den bestehenden Rechten liegt, ist damit nicht geklärt. Auf Wunsch bleibt es bei diesem Versuch; weitere Tabellen und alternative Wege wurden nicht getestet.

## Bestehende Flow-Datenbereiche

| Flow/Antwortbereich | Datenbankobjekt | Bereits belegte Nutzung |
| --- | --- | --- |
| TA: `auftrag` | [`dbo.Auftraege`](#table-0052) | Suche nach Nummer; Auftragsdaten und Fremd-IDs. |
| TA: `ladeEntladestellen` | [`dbo.LadeEntladestellen`](#table-0313) | Alle Stationen des Auftrags. |
| TA: `LadeEntladestellen2` | [`dbo.LadeEntladestellen2`](#table-0317) | Zusatz-/Slotdaten je Stations-ID. |
| TA: `kunde`; Stammdaten: `typ=kunde`, `partner` | [`dbo.Adressstamm`](#table-0004) | Kunde/Frachtzahler; eigenständige Suche nach Debitorennummer. |
| TA: `tour` | [`dbo.Touren`](#table-0524) | Tour und zugehöriger Unternehmer. |
| TA: `unternehmerstamm`; Stammdaten: `typ=utn`, `partner` | [`dbo.Unternehmerstamm`](#table-0557) | Unternehmer; eigenständige Suche nach Kreditorennummer. |
| TA: `fahrzeugart` | [`dbo.Fahrzeugarten`](#table-0226) | Fahrzeugart-Lookup. |
| TA: `relation` | [`dbo.Relationen`](#table-0414) | Relationsbezeichnung. |
| TA: `auftragspreise` | [`dbo.Auftraege_Preise`](#table-0069) | Einzelne Ertrags-/Verkaufspositionen. |
| TA: `tourkosten` | [`dbo.Touren_Kosten`](#table-0526) | Tourkosten; AuftragID für die TA-Zuordnung prüfen. |
| TA: `zahlungsbedingungKunde`, `zahlungsbedingungUnternehmer`; Stammdaten: `zahlungsbedingung` | [`dbo.Zahlungsbedingungen`](#table-0607) | Zahlungszieltext. |
| TA: `fakturaZeilen` | [`dbo.Faktura_Zeilen`](#table-0241) | Fakturazeilen des Auftrags. |
| TA: `fakturaKopf` | [`dbo.Faktura_Kopf`](#table-0236) | Aufgelöste Belegköpfe aus den gelieferten Referenzen. |

Die veröffentlichten HTTP-Flows sind der TA-Abruf (`869f9098-88d3-f111-a05c-6045bd93bcb8`) und der Stammdatenabruf (`0a4c748a-e0d3-f111-84ea-6045bd93bcb8`). Ihre geschützten Aufrufadressen gehören nicht in diese Dokumentation. Beim eigenständigen Stammdatenabruf wird nur der angefragte Kunde/Unternehmer gelesen; eine Gegenreferenz löst keine zusätzliche Partnerabfrage aus.

## Bestätigte Verbindungen im Integrationsablauf

Pfeile bedeuten hier eine bekannte Join-Zuordnung. Ob SQL Server dafür einen Fremdschlüssel erzwingt, ist nicht bekannt.

| Ausgangstabelle und Spalte | Zugehörige Tabelle und Spalte | Bedeutung / Grenze |
| --- | --- | --- |
| [`dbo.Auftraege`](#table-0052).`ID` | [`dbo.LadeEntladestellen`](#table-0313).`AuftragsID` | Stationen eines Auftrags; Quell-ID wird im Adapter geprüft. |
| [`dbo.LadeEntladestellen`](#table-0313).`ID` | [`dbo.LadeEntladestellen2`](#table-0317).`LadeEntladestellenID` | Zusatz-/Slotdaten einer Station; nicht über die Zeilenreihenfolge verbinden. |
| [`dbo.Auftraege`](#table-0052).`FrachtzahlerID` | [`dbo.Adressstamm`](#table-0004).`ID` | Kunde/Frachtzahler des Auftrags. |
| [`dbo.Auftraege`](#table-0052).`TourenID` | [`dbo.Touren`](#table-0524).`ID` | Tour des Auftrags. |
| [`dbo.Touren`](#table-0524).`UnternehmerID` | [`dbo.Unternehmerstamm`](#table-0557).`ID` | Unternehmer einer Tour. |
| [`dbo.Auftraege`](#table-0052).`ID` | [`dbo.Auftraege_Preise`](#table-0069).`AuftragID` | Verkaufs-/Ertragspositionen des Auftrags. |
| [`dbo.Auftraege`](#table-0052).`ID` | [`dbo.Faktura_Zeilen`](#table-0241).`AuftragID` | Fakturazeilen des Auftrags. |
| [`dbo.Touren`](#table-0524).`ID` | [`dbo.Touren_Kosten`](#table-0526).`TourenID` | Kostenpositionen einer Tour. |
| [`dbo.Auftraege`](#table-0052).`ID` | [`dbo.Touren_Kosten`](#table-0526).`AuftragID` | Nur eindeutig diesem Auftrag zugeordnete Tourkosten werden als dessen Kosten übernommen. |
| [`dbo.Faktura_Zeilen`](#table-0241).`KopfID` | [`dbo.Faktura_Kopf`](#table-0236).`KopfID` | Belegkopf einer Fakturazeile; im veröffentlichten TA-Flow aufgelöst. |
| [`dbo.Auftraege_Preise`](#table-0069).`RechKopfID` | [`dbo.Faktura_Kopf`](#table-0236).`KopfID` | Optionale technische Belegkopfreferenz einer Preisposition. |
| [`dbo.Touren_Kosten`](#table-0526).`RechKopfID` | [`dbo.Faktura_Kopf`](#table-0236).`KopfID` | Optionale technische Belegkopfreferenz einer Kostenposition. |
| [`dbo.Auftraege`](#table-0052).`FahrzeugartID` | [`dbo.Fahrzeugarten`](#table-0226).`ID` | Fahrzeugart-Lookup. |
| [`dbo.Auftraege`](#table-0052).`RelationsID` | [`dbo.Relationen`](#table-0414).`ID` | Relations-Lookup. |
| [`dbo.Adressstamm`](#table-0004).`Zahlungsbedingung` | [`dbo.Zahlungsbedingungen`](#table-0607).`ID` | Zahlungsbedingung des Kunden. |
| [`dbo.Unternehmerstamm`](#table-0557).`Zahlungsbedingung` | [`dbo.Zahlungsbedingungen`](#table-0607).`ID` | Zahlungsbedingung des Unternehmers. |
| [`dbo.Adressstamm`](#table-0004).`UnternehmerID` | [`dbo.Unternehmerstamm`](#table-0557).`ID` | Interne Gegenreferenz; nicht die Kreditorennummer. Im Stammdatenabruf nur zum Abgleich bereits bekannter Quell-IDs genutzt. |
| [`dbo.Unternehmerstamm`](#table-0557).`KundenID` | [`dbo.Adressstamm`](#table-0004).`ID` | Interne Gegenreferenz; nicht die Debitorennummer. Es wird kein zusätzlicher Gegenpartner abgefragt. |

## Fachliche Hinweise mit Vorrang vor dem alten Katalog

- `Slotzeit` ist als **Bis-Uhrzeit** bestätigt. Das alte Katalogstatement „1899 generell leer“ darf hier nicht dazu führen, dass eine gültige Uhrzeit verloren geht. Datum und Uhrzeit müssen feldabhängig behandelt werden.
- Fehlende Preise werden nach vereinbarter Drehpunkt-Regel als 0 EUR behandelt. Das ist eine Importregel, kein aus SQL bewiesener Preiswert.
- Belegarten 2, 3 und 7 sowie die genaue Zuordnung zu eigener/externer Rechnung oder Gutschrift sind noch nicht fachlich erklärt. Keine automatische Ausstellerklassifikation daraus ableiten.
- `Auftraege.Preis` ist kein belegter Ersatz für die Summe der Preispositionen.
- Auftragsgesamtmengen und Warenmengen je Station sind unterschiedliche Ebenen.
- Kreditlimits bleiben in Drehpunkt gepflegt. Die Existenz eines SQL-Felds ist keine Freigabe für dessen Übernahme.
- Bank- und Zugangsdatenfelder werden nur als Feldnamen dokumentiert. Keine echten Werte, Kennwörter oder Tokens ergänzen.

## Tabellen mit bereits bekannten Feldern

| Tabelle/Ansicht | Erfasste Feldbezeichnungen | Stand |
| --- | ---: | --- |
| [`dbo.Adressstamm`](#table-0004) | 186 | Q2; teilweise Q3 |
| [`dbo.Auftraege`](#table-0052) | 118 | Q2; teilweise Q3 |
| [`dbo.Auftraege_Preise`](#table-0069) | 35 | Q2; teilweise Q3 |
| [`dbo.Fahrzeugarten`](#table-0226) | 26 | Q2; teilweise Q3 |
| [`dbo.Faktura_Kopf`](#table-0236) | 114 | Q2; teilweise Q3 |
| [`dbo.Faktura_Zeilen`](#table-0241) | 112 | Q2; teilweise Q3 |
| [`dbo.LadeEntladestellen`](#table-0313) | 47 | Q2; teilweise Q3 |
| [`dbo.LadeEntladestellen2`](#table-0317) | 61 | Q2; teilweise Q3 |
| [`dbo.Relationen`](#table-0414) | 11 | Q2; teilweise Q3 |
| [`dbo.Touren`](#table-0524) | 70 | Q2; teilweise Q3 |
| [`dbo.Touren_Kosten`](#table-0526) | 39 | Q2; teilweise Q3 |
| [`dbo.Unternehmerstamm`](#table-0557) | 173 | Q2; teilweise Q3 |
| [`dbo.Zahlungsbedingungen`](#table-0607) | 13 | Q2; teilweise Q3 |

## Erweiterung der Dokumentation

1. Neue Erkenntnisse im jeweiligen Tabellenabschnitt ergänzen; exakte Schreibweise der Quelle erhalten.
2. Quelle, Prüfdatum und Status nennen. Unbestätigte Deutungen als „offen“ kennzeichnen.
3. Datentyp, Länge, NULL-Regel und SQL-Constraints erst nach tatsächlichem Metadatenbeleg aufnehmen.
4. Einen späteren Schemaexport gegen die 643 Namen und die vorhandenen Feldlisten abgleichen; Abweichungen nicht stillschweigend überschreiben.
5. Fachliche Bedeutungen nur für aktuell benötigte Module vertiefen. Bei nicht schnell klärbaren Feldern genügt zunächst „Bedeutung offen“.

Stand weiterer Wege (ohne zusätzliche Versuche):

- `sys.sp_columns` wurde am 30.10.2026 geprüft und scheiterte bereits an der Connector-Parametererkennung (siehe Testergebnis oben). Microsoft beschreibt die möglichen Spaltenmetadaten sowie SELECT- und VIEW-DEFINITION-Rechte als Voraussetzung ([sp_columns](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-columns-transact-sql?view=sql-server-ver17)); diese Dokumentation belegt keinen funktionierenden Abruf über unsere Verbindung. `sp_fkeys` für deklarierte Beziehungen wurde nicht getestet.
- Die dynamischen Ausgabefelder einer normalen SQL-Tabellenaktion können einzelne Spaltennamen zeigen; eine manuelle Durchsicht von 643 Objekten wäre jedoch aufwendig.
- Power Query `Table.Schema` kann grundsätzlich Namen, Typen, NULL-Regeln und Längen liefern ([Microsoft](https://learn.microsoft.com/en-us/powerquery-m/table-schema)); ob die Connector-Aktion „Daten mit Power Query transformieren“ unsere vorhandene Gateway-Verbindung hierfür verwenden kann, ist offen.

Daraus wird hier kein funktionierender Alternativabruf behauptet.

## Vollständiges Verzeichnis der 643 gelieferten Objekte

<a id="table-0001"></a>
### `dbo.AbmeldungOffen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0002"></a>
### `dbo.AbsenderMailAdressen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0003"></a>
### `dbo.Abteilungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0004"></a>
### `dbo.Adressstamm`

**Stand:** Name aus Q1; 186 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.FrachtzahlerID` → `dbo.Adressstamm.ID` – Kunde/Frachtzahler des Auftrags.
- `dbo.Adressstamm.Zahlungsbedingung` → `dbo.Zahlungsbedingungen.ID` – Zahlungsbedingung des Kunden.
- `dbo.Adressstamm.UnternehmerID` → `dbo.Unternehmerstamm.ID` – Interne Gegenreferenz; nicht die Kreditorennummer. Im Stammdatenabruf nur zum Abgleich bereits bekannter Quell-IDs genutzt.
- `dbo.Unternehmerstamm.KundenID` → `dbo.Adressstamm.ID` – Interne Gegenreferenz; nicht die Debitorennummer. Es wird kein zusätzlicher Gegenpartner abgefragt.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Firma` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Firmenname des Geschäftspartners (companyName); im TA zusätzlich als Kunden-/Unternehmername. |
| `Strasse` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Straße der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Land` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Land der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `PLZ` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Postleitzahl der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Ort` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Ort der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `TelefonZentrale` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: allgemeine Telefonnummer des Kunden. |
| `FaxZentrale` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: allgemeine Faxnummer des Kunden. |
| `EMailZentrale` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: allgemeine E-Mail-Adresse des Kunden. Mehrere allgemeine E-Mail-Adressen werden als getrennte Kontaktmethoden behandelt. |
| `Internet` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Website; enthält der Quellwert stattdessen eine E-Mail-Adresse, wird er als Kontaktmethode behandelt. |
| `Ansprechpartner1` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `AbteilungAnsp1` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TelefonAnsp1` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Telefonnummer des zugehörigen Quell-Kontaktslots. |
| `FaxAnsp1` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EMailAnsp1` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: E-Mail des zugehörigen Quell-Kontaktslots; mehrere Adressen werden getrennt behandelt. |
| `Ansprechpartner2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `AbteilungAnsp2` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TelefonAnsp2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Telefonnummer des zugehörigen Quell-Kontaktslots. |
| `FaxAnsp2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EMailAnsp2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: E-Mail des zugehörigen Quell-Kontaktslots; mehrere Adressen werden getrennt behandelt. |
| `Infos` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Farbe` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Zahlungsbedingung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: interne Lookup-Referenz auf Zahlungsbedingungen.ID; der dortige Bezeichnungstext wird als Zahlungsziel gespeichert. |
| `ImTourenplanAnzeigen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Debitorennummer` | Q2; Q3 Adapter/Flow | Fachliche Kundennummer und exakter Suchschlüssel des Stammdaten-Flows; keine interne Adress-ID. |
| `FarbeText` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FibuKontonummer` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansprechpartner` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `AbteilungAnsp` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kreditlimit` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bankname` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Bankort` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `BLZ` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `KontoNr` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Suchwort` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Kundenart` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name3` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `USTID` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: USt-ID in den Unternehmensdaten. |
| `Steuernummer` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Steuernummer in den Unternehmensdaten. |
| `LiefNrBeiKunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kundengruppe` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `RechnungProAuftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bLadeEntladestelle` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Gutschriftsanforderung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UnternehmerID` | Q2; Q3 Adapter/Flow | Interne ID des Gegenpartners im Unternehmerstamm; kein Anlass für einen zusätzlichen Abruf. |
| `ZugeordnetZuKundenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KundeSchicktGutschrift` | Q2; Q3 Adapter/Flow | Als Gutschriftverfahren in den aktuellen Stammdatenadapter übernommen; vorhandene manuelle Werte bleiben erhalten. |
| `SprachenID` | Q2 · OPTIONAL | Sprach-ID; eine verlässliche ID-zu-Sprachcode-Zuordnung ist noch offen. |
| `Ansp1Mail` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Mail` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3Mail` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp1Fax` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp2Fax` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3Fax` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifZonenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StandardTarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LieferbedingungID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextTransportauftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Postfach` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PLZPostfach` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Neutralitaet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Erfassungsdatum` | Q2; Q3 Adapter/Flow | Erfassungsdatum in DyCoS, getrennt vom Anlagezeitpunkt in Drehpunkt. |
| `BearbeiterErfassung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Mustervorlage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZAuftragssperre` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZKreditlimitManuellAktiviert` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `DispobemerkungKunde` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LTermin` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ETermin` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VerwendeBemerkung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `VerwendeDispobemerkungKunde` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `VerwendeLBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VerwendeLTermin` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VerwendeEBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VerwendeETermin` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreiseingabeInW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WaehrungID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `GeocodeBreite_Mercator` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeLaenge_Mercator` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GebietID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KundenNummerExtern` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StueckgutBasistourID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragstransferAusMandant` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KreditlimitKarenzProzente` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PostfachAdresseNichtVerwenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FrachtMautKombinieren` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerfreiTextID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `IBAN` | Q2; Q3 Adapter/Flow | Geschützte Bankangabe; nur im vorgesehenen Stammdatenablauf nutzen. Keine Werte in diese Dokumentation aufnehmen. |
| `SWIFT` | Q2; Q3 Adapter/Flow | Geschützte Bankangabe; vom Adapter als BIC verwendet. |
| `FactoringbankAdressID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IsFactoringbank` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KundennummerFactoring` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1HandyKD` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Ansp2HandyKD` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Ansp3HandyKD` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Spuelstelle` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Lagerkunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KFZStaffeltarifAbrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Werkstattaufschlag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaSortGroupOption` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaBelegPro` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FakturaPeriode` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bMautNichtTrennen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GewichtsleistungAbrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FirmaBankID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExterneBezeichnungFuerDatenimpor` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeBreite_WGS84` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeLaenge_WGS84` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1Tel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Tel` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3Tel` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1Mobil` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Mobil` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3Mobil` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TomTomWorkObjektNummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VertreterID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Provisionssatz` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PalettenAufFrachtzahlerBuchen` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TextAuftragsbestaetigung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Prostahl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Danone` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Palettentausch` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AbrechnungNachEntladedatum` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FactoringTextID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LagerstammID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AutomatischeUmkehrbuchung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeBreite_GradDezimal` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeLaenge_GradDezimal` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeAktualisiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LieferantID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WichtigeWareimAuftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LZustellinfo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EZustellinfo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LZustellinfoVerwenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EZustellinfoVerwenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LZustellinfoRot` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EZustellinfoRot` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailTAAddFile` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailTAAddFileToFax` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `InKarteAnzeigen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Transporeon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtSuchfeld_Transporeon` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ExtBez_KANN_Beton` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EmailMahnung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FakturaInfo_Kunde` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LoginKpi` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1MahnungStandard` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp2MahnungStandard` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp3MahnungStandard` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Volumengewicht_Divisor_KD` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Pfad` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1RechnungStandard` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp2RechnungStandard` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp3RechnungStandard` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EigeneAdresse` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Gehr` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KoordinatenFuerTelematikVerwende` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `OrderPilotStatusUebertragen` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `OrderPilotStatusExportStatustext` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `OrderPilotStatusExportStatuszeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `OrderPilotExportPositionsmeldung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IBANgeprueft` | Q2; Q3 Adapter/Flow | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `IBANgeprueftBearbeiter` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `IBANgeprueftDatum` | Q2; Q3 Adapter/Flow | Datum der IBAN-Prüfung; wird nur bei IBANgeprueft = true übernommen. |
| `SepaLastschrift` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaMandatsReferenz` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaMandatsDatum` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaLsSequenz` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaLastschriftArt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaTageAbwVorankuend` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SepaDatumLetzteLs` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DruckZusatzdokumenteInRechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bFibuKontoDivers` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZusatzdokumenteInDruckFakturabel` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZusatzdokumenteInMailversandFakt` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `bFibuHauptadresse` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bProFormaNichtAnFibuExportieren` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Faktura_Export_KD_Format` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `OrderPilotStatusExportLadedatumOff` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0005"></a>
### `dbo.Adressstamm_AbwReAdr`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0006"></a>
### `dbo.Adressstamm_Ansp`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0007"></a>
### `dbo.Adressstamm_Ansprechpartner_Relationen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0008"></a>
### `dbo.Adressstamm_CsvTarife`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0009"></a>
### `dbo.Adressstamm_Diary`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0010"></a>
### `dbo.Adressstamm_Edifact`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0011"></a>
### `dbo.Adressstamm_ERP`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0012"></a>
### `dbo.Adressstamm_Fortras`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0013"></a>
### `dbo.Adressstamm_Ftp_Einstellungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0014"></a>
### `dbo.Adressstamm_LadeEntladestellenLeistung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0015"></a>
### `dbo.Adressstamm_OrderPilot`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0016"></a>
### `dbo.Adressstamm_RelationenTarife`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0017"></a>
### `dbo.Adressstamm_RelationenZahlBed`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0018"></a>
### `dbo.Adressstamm_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0019"></a>
### `dbo.Adressstamm_VerpPflicht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0020"></a>
### `dbo.Adressstamm_ZusatzdokumenteBelegarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0021"></a>
### `dbo.Adressstamm2`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0022"></a>
### `dbo.Ais_Auftragsstatus`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0023"></a>
### `dbo.Ais_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0024"></a>
### `dbo.Ais_Hinweistexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0025"></a>
### `dbo.Ais_Hinweistexte_Zuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0026"></a>
### `dbo.Aktionen_Spezial`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0027"></a>
### `dbo.Aktionsliste`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0028"></a>
### `dbo.AktiveUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0029"></a>
### `dbo.Aktivitaeten_computerbezogen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0030"></a>
### `dbo.AktivitaetsMonitor`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0031"></a>
### `dbo.AktivitaetsMonitorLive`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0032"></a>
### `dbo.Angebote`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0033"></a>
### `dbo.Angebote_Ablehnungsgruende`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0034"></a>
### `dbo.Angebote_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0035"></a>
### `dbo.Angebote_Arten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0036"></a>
### `dbo.Angebote_GefahrgutinformationenProWare`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0037"></a>
### `dbo.Angebote_GefahrgutinformationenProWare_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0038"></a>
### `dbo.Angebote_Geloeschte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0039"></a>
### `dbo.Angebote_LadeEntladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0040"></a>
### `dbo.Angebote_LadeEntladestellen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0041"></a>
### `dbo.Angebote_Laendermaut`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0042"></a>
### `dbo.Angebote_Preise`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0043"></a>
### `dbo.Angebote_Preise_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0044"></a>
### `dbo.Angebote_Schnellerfassung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0045"></a>
### `dbo.Angebote_VorNachlauftexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0046"></a>
### `dbo.Angebote_VorNachlauftexte_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0047"></a>
### `dbo.Angebote_WarenProLadeEntladestelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0048"></a>
### `dbo.Angebote_WarenProLadeEntladestelle_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0049"></a>
### `dbo.Anhaenger`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0050"></a>
### `dbo.Anlagen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0051"></a>
### `dbo.Artikelgruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0052"></a>
### `dbo.Auftraege`

**Stand:** Name aus Q1; 118 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.ID` → `dbo.LadeEntladestellen.AuftragsID` – Stationen eines Auftrags; Quell-ID wird im Adapter geprüft.
- `dbo.Auftraege.FrachtzahlerID` → `dbo.Adressstamm.ID` – Kunde/Frachtzahler des Auftrags.
- `dbo.Auftraege.TourenID` → `dbo.Touren.ID` – Tour des Auftrags.
- `dbo.Auftraege.ID` → `dbo.Auftraege_Preise.AuftragID` – Verkaufs-/Ertragspositionen des Auftrags.
- `dbo.Auftraege.ID` → `dbo.Faktura_Zeilen.AuftragID` – Fakturazeilen des Auftrags.
- `dbo.Auftraege.ID` → `dbo.Touren_Kosten.AuftragID` – Nur eindeutig diesem Auftrag zugeordnete Tourkosten werden als dessen Kosten übernommen.
- `dbo.Auftraege.FahrzeugartID` → `dbo.Fahrzeugarten.ID` – Fahrzeugart-Lookup.
- `dbo.Auftraege.RelationsID` → `dbo.Relationen.ID` – Relations-Lookup.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne Auftrags-ID; getrennt von der fachlichen TA-Nummer speichern. SQL-PK-Constraint noch nicht ausgelesen. |
| `Nummer` | Q2; Q3 Adapter/Flow | TA-Nummer und exakter Suchschlüssel des TA-Flows; nicht mit der internen ID verwechseln. |
| `Status` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RelationsID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Relationen.ID |
| `Ladedatum` | Q2; Q3 Such-Flow | Kalendertag für die vereinbarte Zeitraumssuche nach Ladedatum (Von/Bis einschließlich). Abfrage über dbo.Auftraege; am 30.10.2026 mit vorhandenen Beispiel-TAs geprüft. |
| `Uhrzeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LadestellenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LadestelleBemerkung` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EntladestellenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EntladestelleBemerkung` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `DispoBemerkung` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ware` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AnzahlKolli` | Q2; Q3 Adapter/Flow | Kolli des gesamten Auftrags; Stationsmengen bleiben separat. |
| `Gewicht` | Q2; Q3 Adapter/Flow | Auftragsgesamtgewicht; nicht zusätzlich mit Stationsgewichten aufsummieren. |
| `Lademeter` | Q2; Q3 Adapter/Flow | Lademeter des gesamten Auftrags; Stationswerte bleiben separat. |
| `FrachtzahlerID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Adressstamm.ID |
| `Preis` | Q2 · PRÜFEN | Im Feldkatalog als Freitext/E-Mail beobachtet; kein verlässlicher numerischer Frachtbetrag. |
| `Wo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TourenID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Touren.ID |
| `Erledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TourenPos` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `divLadestelle` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `divEntladestelle` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ruecklieferung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ladezeit` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Entladezeit` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Gesamtkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Autobahnkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Angebot` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AngebotNummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Gefahrgut` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Rechnungsfreigabe` | Q2 · WICHTIG | Hinweis im extrahierten Arbeitskatalog unvollständig; fachliche Bedeutung noch prüfen. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `RechFreigabe_Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechFreigabe_Dat` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechFreigabe_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Referenznummer` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `StatusMonitor` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `InTPAnzeigenWennOffen` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `InWiedervorlageAufnehmen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WiedervorlageErledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ImAuftrag` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KZDispoBemerkungWichtig` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KZEntsorgungsauftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LieferbedingungID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FahrzeugartID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Fahrzeugarten.ID |
| `ErsteLadestellenID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LetzteEntladestellenID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BemerkungDossierDeckblatt` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Erfassungsdatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BearbeiterErfassung` | Q2; Q3 Adapter/Flow | Erfassender Bearbeiter in DyCoS; wird getrennt vom ausführenden Drehpunkt-Benutzer gespeichert. |
| `Import` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZIntern` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bSteuerFrei` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ProformaAuftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bSteuerFrei_UTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leerkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansprechpartner` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Steuerfrei_Kunde_Text_ID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Steuerfrei_UTN_Text_ID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragSuche` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LetzterDruckABDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LetzterDruckABBenutzer` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LetzterDruckTADatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LetzterDruckTABenutzer` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `DauerAuftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DauerAuftragVon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DauerAuftragBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DauerAuftragAnlegenAn` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DauerAuftragPeriode` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LadestelleZustellinfo` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EntladestelleZustellinfo` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LadestelleLieferscheinNr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EntladestelleLieferscheinNr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StueckgutAuftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StueckgutAuftragBewertet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StueckgutAbholung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Hauptauftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ProzentErtragVomHauptauftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragAnMandantSenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `BearbeiterIDStatistik` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AbteilungIDStatistik` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KalkulationsID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LeerkilometerGeroutet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KMGeroutet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leerkilometerberechnungsart` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AnsprechpartnerIndex` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SpuelstelleAdressID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `RechnungsAdressID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bAbweichenderFZ` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Auftragnr_Auftraggeber` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Transporeon_Angebotspreis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Transporeon_AngebotGueltigBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Transporeon_AngebotKommentar` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bTransporeonImportSperre` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AnhaengerartID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZGebietErmittManuell` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IstAngebot` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Vorlage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Konsolidiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FremdsystemId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Warenwert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Versicherungsbeitrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IDKundenWaehrung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFWGueltigVon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFWGueltigBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEURGueltigVon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEURGueltigBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragsstatusWorkflow` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `HauptAuftragID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UnterauftragIndex` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VPEinheitID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0053"></a>
### `dbo.Auftraege_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0054"></a>
### `dbo.Auftraege_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0055"></a>
### `dbo.Auftraege_Label`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0056"></a>
### `dbo.Auftraege_Laendermaut`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0057"></a>
### `dbo.Auftraege_MandantenTransfer`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0058"></a>
### `dbo.Auftraege_MandantenTransfer_ANummern_Save`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0059"></a>
### `dbo.Auftraege_MandantenTransfer_Importdateien`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0060"></a>
### `dbo.Auftraege_MT_Auftraege`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0061"></a>
### `dbo.Auftraege_MT_Auftraege_Preise`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0062"></a>
### `dbo.Auftraege_MT_GefahrgutinformationenProWare`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0063"></a>
### `dbo.Auftraege_MT_LadeEntladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0064"></a>
### `dbo.Auftraege_MT_Touren`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0065"></a>
### `dbo.Auftraege_MT_Touren_Kosten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0066"></a>
### `dbo.Auftraege_MT_WarenProLadeEntladestelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0067"></a>
### `dbo.Auftraege_MT_ZuSenden`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0068"></a>
### `dbo.Auftraege_PDFAuftrennung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0069"></a>
### `dbo.Auftraege_Preise`

**Stand:** Name aus Q1; 35 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.ID` → `dbo.Auftraege_Preise.AuftragID` – Verkaufs-/Ertragspositionen des Auftrags.
- `dbo.Auftraege_Preise.RechKopfID` → `dbo.Faktura_Kopf.KopfID` – Optionale technische Belegkopfreferenz einer Preisposition.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `AuftragID` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragPos` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsreihenfolge im Auftrag, soweit vom jeweiligen Quellbereich geliefert. |
| `LeistungID` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LeistungText` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsbeschreibung, soweit vom jeweiligen Quellbereich geliefert. |
| `Menge` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsmenge, soweit vom jeweiligen Quellbereich geliefert. |
| `Einheit` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionseinheit, soweit vom jeweiligen Quellbereich geliefert. |
| `Preis` | Q2; Q3 Adapter/Flow | Einzelpreis einer Position; nicht mit Auftraege.Preis gleichsetzen. |
| `Gesamt` | Q2; Q3 Adapter/Flow | Positionsbetrag; wird im Adapter für den passenden Auftrag summiert. Die vereinbarte Drehpunkt-Währung ist EUR. |
| `STS` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FibuKonto` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kostenstelle` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Satzart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Zaehler` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: technische Positionskennung, soweit vom jeweiligen Quellbereich geliefert. |
| `Berechnet` | Q2 · OPTIONAL | Abrechnungsstatus dieser Preis-/Kostenposition |
| `RechnungNr` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechnungDatum` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Belegart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExterneBelegNr` | Q2 · WICHTIG | Externe Unternehmerbelegnummer / Rechnungsreferenz |
| `RechKopfID` | Q2; Q3 Adapter/Flow | Kunden-Belegkopf, kann leer sein |
| `TarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LadeEntladestellenID` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreisEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreisKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PositionErledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaPosID` | Q2; Q3 Adapter/Flow | Technische Fakturapositionsreferenz gespeichert; Zielspalte und vollständige fachliche Bedeutung noch offen. |
| `AddFaktura` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Druckdatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Konsolidiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `noch_nicht_berechnen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistungsinfo2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0070"></a>
### `dbo.Auftraege_Preise_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0071"></a>
### `dbo.Auftraege_Preise_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0072"></a>
### `dbo.Auftraege_Preise_Historie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0073"></a>
### `dbo.Auftraege_Spezial`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0074"></a>
### `dbo.Auftraege_Trackingstatus`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0075"></a>
### `dbo.Auftraege_Truck24Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0076"></a>
### `dbo.Auftraege_Zugeordnet_Merkmale`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0077"></a>
### `dbo.Auftraege_Zugeordnet_Personal`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0078"></a>
### `dbo.Auftraege_Zusatzdaten_AuftragsimportGehr`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0079"></a>
### `dbo.Auftraege_Zusatzdaten_CourierNet`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0080"></a>
### `dbo.Auftraege_Zusatzdaten_Danone`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0081"></a>
### `dbo.Auftraege_Zusatzdaten_DHL`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0082"></a>
### `dbo.Auftraege_Zusatzdaten_EHL`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0083"></a>
### `dbo.Auftraege_Zusatzdaten_Frachtboerse`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0084"></a>
### `dbo.Auftraege_Zusatzdaten_Frachtboerse_Protokoll`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0085"></a>
### `dbo.Auftraege_Zusatzdaten_GehrExport`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0086"></a>
### `dbo.Auftraege_Zusatzdaten_GehrImport`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0087"></a>
### `dbo.Auftraege_Zusatzdaten_Hermes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0088"></a>
### `dbo.Auftraege_Zusatzdaten_Hermes_Trans`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0089"></a>
### `dbo.Auftraege_Zusatzdaten_Hermes_TS`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0090"></a>
### `dbo.Auftraege_Zusatzdaten_LangguthQws`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0091"></a>
### `dbo.Auftraege_Zusatzdaten_Prostahl`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0092"></a>
### `dbo.Auftraege_Zusatzdaten_Steuerungszentrale`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0093"></a>
### `dbo.Auftraege_Zusatzdaten_TimoCom_Fahrzeugausstattungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0094"></a>
### `dbo.Auftraege_Zusatzdaten_TimoCom_Frachtinformationen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0095"></a>
### `dbo.Auftraege_Zusatzdaten_TransEU_Fahrzeugausstattungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0096"></a>
### `dbo.Auftraege_Zusatzdaten_TransEU_Fahrzeugtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0097"></a>
### `dbo.Auftraege_Zusatzdaten_Transporeon`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0098"></a>
### `dbo.Auftraege_Zusatzdaten_Weko`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0099"></a>
### `dbo.Auftraege_Zusatzdaten_ZGM`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0100"></a>
### `dbo.Auftraege_Zusatzdaten_ZGM_Orig`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0101"></a>
### `dbo.Auftraege2`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0102"></a>
### `dbo.Auftraege2_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0103"></a>
### `dbo.AuftraegeGeloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0104"></a>
### `dbo.AuftragAnlagen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0105"></a>
### `dbo.AuftragAnlagen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0106"></a>
### `dbo.AuftragsexportMitTourdaten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0107"></a>
### `dbo.Auftragsimport_Userinfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0108"></a>
### `dbo.AuftragsimportAxitt`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0109"></a>
### `dbo.AuftragsimportKANN`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0110"></a>
### `dbo.AuftragsimportLeistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0111"></a>
### `dbo.AuftragsimportMitTourdaten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0112"></a>
### `dbo.AuftragsMonitor`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0113"></a>
### `dbo.AuftragsstatusWorkflow`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0114"></a>
### `dbo.AuftragsstatusWorkflow_TrackingInfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0115"></a>
### `dbo.AuftragsstatusWorkflow_TrackingInfo_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0116"></a>
### `dbo.AuftragVorNachlauftexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0117"></a>
### `dbo.AuftragVorNachlauftexte_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0118"></a>
### `dbo.Ausruestungsart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0119"></a>
### `dbo.Bankdatenimport`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0120"></a>
### `dbo.Banken`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0121"></a>
### `dbo.Bankenverzeichnis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0122"></a>
### `dbo.Benutzerprofile`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0123"></a>
### `dbo.Besteuerungsarten_Definition`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0124"></a>
### `dbo.Buchungskonto`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0125"></a>
### `dbo.CMR_Anweisungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0126"></a>
### `dbo.CMR_VorbehalteUndBemerkungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0127"></a>
### `dbo.ContainerStamm`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0128"></a>
### `dbo.CourierNet_FahrzeugTypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0129"></a>
### `dbo.CourierNet_Verpackungseinheiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0130"></a>
### `dbo.CrmSuperofficeTriggerEreignisse`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0131"></a>
### `dbo.CsvTarife_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0132"></a>
### `dbo.Dashboard_data1`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0133"></a>
### `dbo.Dashboard_data2`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0134"></a>
### `dbo.Dashboard_data3`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0135"></a>
### `dbo.Datenaustausch_Log`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0136"></a>
### `dbo.Datenaustausch_LogUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0137"></a>
### `dbo.Datenaustausch_Schnittstellenstatus`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0138"></a>
### `dbo.DatenimportAktiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0139"></a>
### `dbo.Datensicherung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0140"></a>
### `dbo.DBIniUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0141"></a>
### `dbo.DHL_ESPReferenztype`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0142"></a>
### `dbo.DHL_ESPStandardcodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0143"></a>
### `dbo.Dieselfloater`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0144"></a>
### `dbo.Dieselpreis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0145"></a>
### `dbo.Dieselpreis_Kunde`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0146"></a>
### `dbo.DispoBemerkungenTag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0147"></a>
### `dbo.Dispogruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0148"></a>
### `dbo.DispoMonitor`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0149"></a>
### `dbo.DKV_Rechimport_Gesamt_Summen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0150"></a>
### `dbo.DKV_Rechimport_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0151"></a>
### `dbo.DKV_Rechimport_Kunde_Info`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0152"></a>
### `dbo.DKV_Rechimport_Kunde_Summen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0153"></a>
### `dbo.DKV_Rechimport_Kunde_Transaktionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0154"></a>
### `dbo.DKV_Warenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0155"></a>
### `dbo.DossNr`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0156"></a>
### `dbo.Druckindividuell`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0157"></a>
### `dbo.Druckoptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0158"></a>
### `dbo.Drucktabelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0159"></a>
### `dbo.Drucktabelle_AB`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0160"></a>
### `dbo.Drucktabelle_AB_Auftrag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0161"></a>
### `dbo.Drucktabelle_AB_Ladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0162"></a>
### `dbo.Drucktabelle_AB_Leistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0163"></a>
### `dbo.Drucktabelle_ALSammel`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0164"></a>
### `dbo.Drucktabelle_Angebot`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0165"></a>
### `dbo.Drucktabelle_Angebot_Detail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0166"></a>
### `dbo.Drucktabelle_Angebot_Ladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0167"></a>
### `dbo.Drucktabelle_Angebot_Leistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0168"></a>
### `dbo.Drucktabelle_AuftragUebersicht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0169"></a>
### `dbo.Drucktabelle_BefPapierGG`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0170"></a>
### `dbo.Drucktabelle_DATEV`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0171"></a>
### `dbo.Drucktabelle_DATEV_CSV`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0172"></a>
### `dbo.Drucktabelle_DossierDB`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0173"></a>
### `dbo.Drucktabelle_HBH`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0174"></a>
### `dbo.Drucktabelle_Preisanfrage`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0175"></a>
### `dbo.Drucktabelle_Preisanfrage_Auftrag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0176"></a>
### `dbo.Drucktabelle_Preisanfrage_Ladestelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0177"></a>
### `dbo.Drucktabelle_Rollkarte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0178"></a>
### `dbo.Drucktabelle_Spesenabrechnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0179"></a>
### `dbo.Drucktabelle_Steuerungszentrale`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0180"></a>
### `dbo.Drucktabelle_TA`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0181"></a>
### `dbo.Drucktabelle_TA_Auftrag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0182"></a>
### `dbo.Drucktabelle_TA_Ladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0183"></a>
### `dbo.Drucktabelle_TA_Leistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0184"></a>
### `dbo.Drucktabelle_Zahlungsavis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0185"></a>
### `dbo.DrucktabelleDHLFahrplan`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0186"></a>
### `dbo.DrucktabelleDHLFrachtbrief`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0187"></a>
### `dbo.DrucktabelleEinzelnachweisDKV`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0188"></a>
### `dbo.DrucktabelleEinzelnachweisShell`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0189"></a>
### `dbo.DrucktabelleEinzelnachweisTankstelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0190"></a>
### `dbo.DrucktabelleEinzelnachweisTollCollect`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0191"></a>
### `dbo.DrucktabelleFahrtenliste`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0192"></a>
### `dbo.DrucktabelleHermes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0193"></a>
### `dbo.DrucktabelleKalkulation`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0194"></a>
### `dbo.DrucktabelleLKWUmsatzDetail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0195"></a>
### `dbo.DrucktabelleLKWUmsatzSumme`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0196"></a>
### `dbo.DrucktabelleMapServer5RuntimeRouting`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0197"></a>
### `dbo.DrucktabelleMapserverRoutenliste`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0198"></a>
### `dbo.DrucktabelleSpedBuchSummen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0199"></a>
### `dbo.DrucktabelleSummenblattDKV`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0200"></a>
### `dbo.DrucktabelleSummenblattShell`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0201"></a>
### `dbo.DrucktabelleSummenblattTankstelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0202"></a>
### `dbo.DrucktabelleUmsatzStatistik`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0203"></a>
### `dbo.DrucktabelleWerkstattauftraege`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0204"></a>
### `dbo.DTAZV_Q`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0205"></a>
### `dbo.DTAZV_T`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0206"></a>
### `dbo.DTAZV_V`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0207"></a>
### `dbo.DTAZV_W`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0208"></a>
### `dbo.DTAZV_Z`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0209"></a>
### `dbo.EFakturaImport`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0210"></a>
### `dbo.Eikona_BildtypenUTNLink`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0211"></a>
### `dbo.Einheiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0212"></a>
### `dbo.Einheiten_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0213"></a>
### `dbo.Einstellungen_Computerbezogen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0214"></a>
### `dbo.Einstellungen_Quickstartbildschirme`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0215"></a>
### `dbo.EMail_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0216"></a>
### `dbo.EMailArchiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0217"></a>
### `dbo.Entfernungswerk`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0218"></a>
### `dbo.Entfernungswerk_Laendermaut`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0219"></a>
### `dbo.Erinnerungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0220"></a>
### `dbo.ESSO_Rechnung_Details`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0221"></a>
### `dbo.ESSO_Rechnung_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0222"></a>
### `dbo.ExportTabellenkalkulationOptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0223"></a>
### `dbo.Fahrer_Ausruestung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0224"></a>
### `dbo.FahrtenlisteDetail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0225"></a>
### `dbo.FahrtenlisteKopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0226"></a>
### `dbo.Fahrzeugarten`

**Stand:** Name aus Q1; 26 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.FahrzeugartID` → `dbo.Fahrzeugarten.ID` – Fahrzeugart-Lookup.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Bezeichnung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: angezeigte Fahrzeugart. |
| `Informationen` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Farbe` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FarbeText` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UmsatzPlan` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExterneBezeichnungFuerDatenimpor` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FahrzeugTyp` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Auflieger` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Gehr` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Zuladungsgewicht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Weko` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KfzBild_offen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KfzBild_disponiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Transporeon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Timocom` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MapGuideFahrzeugprofileID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Mautpreis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrzeugarten_TransEuId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Mandantentransfer` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ExtBez_Baumit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_ConiziHabbl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Eikona` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrzeugarten_TransEuId2022` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `CO2Faktor_gr_KfzArt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0227"></a>
### `dbo.Fahrzeugarten_TimoCom`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0228"></a>
### `dbo.Fahrzeugarten_TransEu`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0229"></a>
### `dbo.Fahrzeugarten_TransEu2022`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0230"></a>
### `dbo.Fahrzeugarten_Zuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0231"></a>
### `dbo.FahrzeugKostenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0232"></a>
### `dbo.FahrzeugKostenTypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0233"></a>
### `dbo.FahrzeugZubehoer`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0234"></a>
### `dbo.FahrzeugZubehoerArten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0235"></a>
### `dbo.Faktura_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0236"></a>
### `dbo.Faktura_Kopf`

**Stand:** Name aus Q1; 114 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Faktura_Zeilen.KopfID` → `dbo.Faktura_Kopf.KopfID` – Belegkopf einer Fakturazeile; im veröffentlichten TA-Flow aufgelöst.
- `dbo.Auftraege_Preise.RechKopfID` → `dbo.Faktura_Kopf.KopfID` – Optionale technische Belegkopfreferenz einer Preisposition.
- `dbo.Touren_Kosten.RechKopfID` → `dbo.Faktura_Kopf.KopfID` – Optionale technische Belegkopfreferenz einer Kostenposition.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `Computername` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegNrID` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AdressID` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Debitorennummer` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Name1` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Name2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name3` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Strasse` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Land` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PLZ` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ort` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UStIDNr` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Steuernummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextStorno` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TextRechnung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegDatumLabel` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KundenNrLabel` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KundenNr` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegNrLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegNr` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BetragLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Vorlauftext` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Nettowert` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Steuerfrei` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Steuerpflichtig` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `MwstProzent` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Mwst` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Gesamt` | Q2 · WICHTIG | Positionsgesamtwert; Tabellenkontext beachten |
| `Zahlungsbedingung` | Q2 · WICHTIG | Referenz auf Zahlungsbedingungen.ID; zugehörigen Text per Lookup lesen. |
| `Nachlauftext` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Belegart` | Q2 · PRÜFEN | Belegartcode laut Katalog. Die Bedeutung der in Beispielen vorkommenden Codes 2, 3 und 7 und die Ausstellerzuordnung bleiben fachlich ungeklärt. |
| `Storniert` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `StornoRechungNr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bPalettenabrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KopfID` | Q2; Q3 Adapter/Flow | Im Flow verwendeter Identifikator des Belegkopfs. SQL-PK-Constraint noch nicht ausgelesen. |
| `SprachenID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RTF_Vorlauftext` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RTF_Nachlauftext` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FibuKontoNr` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `FibuKontoNrAufRechnung` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `WaehrungIDKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WaehrungBezKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `NettowertKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerfreiKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerpflichtigKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MwStKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WaehrungIDEUR` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `WaehrungBezEUR` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `NettowertEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerfreiEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerpflichtigEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MwStEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WaehrungIDFW` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `WaehrungBezFW` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserName` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserKurz` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserAnrede` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserVorname` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserAbteilung` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserTelefon` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserFax` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RGUserMailAdresse` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Landname` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FirmaIBAN` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `FirmaSWIFT` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `RGUserErstellDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Werkstattabrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ValutaDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `bLieferantenrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZahlungsbedingungKW` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `bUnternehmer` | Q2 · WICHTIG | Kennzeichnet Unternehmerbeleg im Faktura-Kopf |
| `bEinzelOhneAuftragsbezug` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AR_bAbweichenderFZ` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `HoechstesEntladedatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragIntern` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bProformabeleg` | Q2 · WICHTIG | Proforma-Kennzeichen, für Rechnungsprüfung wichtig |
| `ExterneBelegnummer` | Q2 · WICHTIG | Externe Nummer auf Faktura-Kopf |
| `DruckDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Besteuerungsart` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `bUstErmaessigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Version` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `DruckDatumZeit` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `bRechnungskorrektur` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZB_Nettotage` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ZB_Skontotage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZB_Skontoprozent` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bUstErmaessigt2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bNichtFuerStatistik` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PDFBeleglink` | Q2 · WICHTIG | Windows-Dateipfad zu PDF, kein direkt nutzbarer Weblink |
| `PDFDateiname` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ZB_ID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_IBAN` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `UTN_SWIFT` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `PDFDateinameMitPfadFakturaBelegO` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AbrechnungszeitraumVon` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AbrechnungszeitraumBis` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Rappenrundung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KundengruppenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZugFerdFormat` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZUGFeRDCreditBuchungExportErfolg` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FirmaBankID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FactoringBankID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FactoringBezeichnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FactoringIBAN` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `FactoringBankname` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `FactoringBIC` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LiefNrBeiKunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FactoringAdressID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KundenNummerExtern` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZUGFeRDZusatzdokumenteModus` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0237"></a>
### `dbo.Faktura_Kopf_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0238"></a>
### `dbo.Faktura_Kopf_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0239"></a>
### `dbo.Faktura_Kopf_Temp`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0240"></a>
### `dbo.Faktura_Kopf_Temp_Verw`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0241"></a>
### `dbo.Faktura_Zeilen`

**Stand:** Name aus Q1; 112 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.ID` → `dbo.Faktura_Zeilen.AuftragID` – Fakturazeilen des Auftrags.
- `dbo.Faktura_Zeilen.KopfID` → `dbo.Faktura_Kopf.KopfID` – Belegkopf einer Fakturazeile; im veröffentlichten TA-Flow aufgelöst.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `Computername` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BelegNrID` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TourenID` | Q2 · WICHTIG | Verweist auf dbo.Touren.ID |
| `TourNummer` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AdressID` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragID` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragNummer` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragPos` | Q2 · PRÜFEN | Positionsnummer im Auftrag |
| `LeistungID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LeistungText` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Menge` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Einheit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Preis` | Q2 · WICHTIG | In Preis-/Kostenpositionen numerisch; im Hauptauftrag häufig |
| `Betrag` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `SteuerSchluessel` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Erloeskonto` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Kostenstelle` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Satzart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LeistungstagLabel` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Leistungstag` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LKWLabel` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LKW` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LKWID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WareLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ware` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `GewichtLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Gewicht` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LadestelleLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ladestelle` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EntladestelleLabel` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Entladestelle` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AnlagenLabel` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Anlagen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fettdruck` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PosNr` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Referenznummer` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Auftragsnummern` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KopfID` | Q2; Q3 Adapter/Flow | Referenz auf Faktura_Kopf.KopfID; in dieser Tabelle nicht ungeprüft als Primärschlüssel bezeichnen. |
| `SteuerfreiBegruendung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PreisKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `BetragKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreisEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `BetragEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SummeAuftrag` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `SummeAuftragKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SummeAuftragEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTN_ID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_Name` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_Name2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTN_Name3` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTN_Strasse` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_Land` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_PLZ` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `UTN_Ort` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Uhrzeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DispoBemerkung` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PreisAlsText` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Wo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtKilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AutobahnKilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ladezeit` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Entladezeit` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ImAuftrag` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Dokumente` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Vorschriften` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Warenwert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Versicherungsbeitrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leerkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansprechpartner` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `BearbeiterErfassung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Auftragsuche` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Trailer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TrailerID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FlagUpdate` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrzeugart` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EntladedatumInRechnungDrucken` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtgewichtAuftragTour` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Abrechnungsgewicht` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EntladezeitLeistungstagSort` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Notizen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kontotyp` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `KontoISAD` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ersatzteil` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Austauschteil` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Arbeitszeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LeistungZeilenID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LademeterLade` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LademeterEntlade` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `GesamtTransportGewichtAuftragTou` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Trailer_Art` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Referenznummern` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Leistungsinfo2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Info1` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PalettenartID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextFahrer1Tour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextTransportartAuftrag` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Kostenstelle2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bNichtFuerStatistik` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DokumenteUrl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Volumengewicht_kg` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `NichtStapelbar` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IATACodesLadestellen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IATACodesEntladestellen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Stapler` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Besteuerungsart` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FaktAuftragsnummerSAP` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FaktPositionsnummerSAP` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FaktBuchungskreisKundeSAP` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Abrechnungsreferenz2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp_Standard_Abteilung` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp_Standard_Ansprechpartner` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |

<a id="table-0242"></a>
### `dbo.Faktura_Zeilen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0243"></a>
### `dbo.Faktura_Zeilen_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0244"></a>
### `dbo.Faktura_Zeilen_Temp`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0245"></a>
### `dbo.FakturaVorNachlaufTexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0246"></a>
### `dbo.FakturaVorNachlauftexte_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0247"></a>
### `dbo.Familienstand`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0248"></a>
### `dbo.FBLeistungsnachweis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0249"></a>
### `dbo.Fehlzeitart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0250"></a>
### `dbo.Feiertage`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0251"></a>
### `dbo.FeldbezeichnungenRelationen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0252"></a>
### `dbo.FeldbezeichnungenRelationen_Save`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0253"></a>
### `dbo.FIBUD1`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0254"></a>
### `dbo.FibuD1_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0255"></a>
### `dbo.Fibud1_DKV`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0256"></a>
### `dbo.FIBUD1_ISAD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0257"></a>
### `dbo.Fibud1_kumuliert`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0258"></a>
### `dbo.FibuD1_Save_Vor_KorrigiereStornobuchungenFibuD1_20220502111316980`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0259"></a>
### `dbo.FIBUD1_UNIS`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0260"></a>
### `dbo.Firmenstamm`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0261"></a>
### `dbo.Firmenstamm2`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0262"></a>
### `dbo.Formular_Filter_Einstellungen_User_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0263"></a>
### `dbo.Formular_Filter_Einstellungen_User_Werte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0264"></a>
### `dbo.Formulardesign`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0265"></a>
### `dbo.Frachtbrief`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0266"></a>
### `dbo.Frachtbrief_CMR`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0267"></a>
### `dbo.Frachtbrief_CMR_U`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0268"></a>
### `dbo.FrachtratenInfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0269"></a>
### `dbo.FreieBelegnummern`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0270"></a>
### `dbo.FZGKalkdatenDetail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0271"></a>
### `dbo.FZGKalkdatenKopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0272"></a>
### `dbo.FZGKalkDyn`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0273"></a>
### `dbo.FZGKalkDynKostenart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0274"></a>
### `dbo.Gebiete`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0275"></a>
### `dbo.Gefahrgut`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0276"></a>
### `dbo.GefahrgutinformationenProWare`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0277"></a>
### `dbo.GefahrgutinformationenProWare_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0278"></a>
### `dbo.GehrCreditsBewegungen_`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0279"></a>
### `dbo.GehrCreditsBewegungen_k55931a6e`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0280"></a>
### `dbo.Gesperrte_Schluessel`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0281"></a>
### `dbo.GesperrteDokumenteFunktionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0282"></a>
### `dbo.GesperrteDokumenteFunktionen_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0283"></a>
### `dbo.GMPKategorien`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0284"></a>
### `dbo.GPSoverIP_Statuscodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0285"></a>
### `dbo.Grenzen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0286"></a>
### `dbo.Habbl_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0287"></a>
### `dbo.Habbl_WorkflowStati`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0288"></a>
### `dbo.HabblTransportdokumentTypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0289"></a>
### `dbo.HabblWorkflow`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0290"></a>
### `dbo.Historie_Anzeige`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0291"></a>
### `dbo.Historie_AuftragsstatusWorkflow`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0292"></a>
### `dbo.Historie_Bearbeitung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0293"></a>
### `dbo.Historie_Funktionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0294"></a>
### `dbo.IATACodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0295"></a>
### `dbo.Inventur_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0296"></a>
### `dbo.Inventur_Positionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0297"></a>
### `dbo.Journal`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0298"></a>
### `dbo.Journal_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0299"></a>
### `dbo.Kalendertermine`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0300"></a>
### `dbo.KalkulationsartenFahrzeug`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0301"></a>
### `dbo.Kalkulationsdaten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0302"></a>
### `dbo.KalkulationsdatenEinzelkosten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0303"></a>
### `dbo.KalkulationsdatenLadestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0304"></a>
### `dbo.Kalkulationsgrunddaten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0305"></a>
### `dbo.Konfession`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0306"></a>
### `dbo.Kontrakte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0307"></a>
### `dbo.Kostenstelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0308"></a>
### `dbo.Kostenstelle_SAP`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0309"></a>
### `dbo.KPI_Fehlercodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0310"></a>
### `dbo.Kundenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0311"></a>
### `dbo.Kundengruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0312"></a>
### `dbo.LadeauftragVorNachlauftexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0313"></a>
### `dbo.LadeEntladestellen`

**Stand:** Name aus Q1; 47 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.ID` → `dbo.LadeEntladestellen.AuftragsID` – Stationen eines Auftrags; Quell-ID wird im Adapter geprüft.
- `dbo.LadeEntladestellen.ID` → `dbo.LadeEntladestellen2.LadeEntladestellenID` – Zusatz-/Slotdaten einer Station; nicht über die Zeilenreihenfolge verbinden.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `AuftragsID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Auftraege.ID |
| `TourID` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AdressID` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Lade_Entladestelle` | Q2; Q3 Adapter/Flow | Im Adapter L = Ladestelle, E = Entladestelle. Andere Werte werden als unbekannt markiert. |
| `Firma` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Firmen-/Stationsname der Stationsanschrift; kein eigener Geschäftspartnerabruf. |
| `Strasse` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Straße der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Land` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Land der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `PLZ` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Postleitzahl der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Ort` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Ort der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Bemerkung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Stationsbemerkung. Nicht ungeprüft mit der bisherigen CSV-Lade-/Entladereferenz gleichsetzen. |
| `Ware` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Gewicht` | Q2; Q3 Adapter/Flow | Gewicht dieser Station; getrennt von Auftragsgesamtmengen behandeln. |
| `Kolli` | Q2; Q3 Adapter/Flow | Kolli dieser Station; getrennt von Auftragsgesamtmengen behandeln. |
| `Lademeter` | Q2; Q3 Adapter/Flow | Lademeter dieser Station; getrennt von Auftragsgesamtmengen behandeln. |
| `Zeile_In_Auftrag` | Q2; Q3 Adapter/Flow | Fachliche Stationsreihenfolge; die Reihenfolge der API-Ausgabe ist kein Ersatz. |
| `Zeile_In_Tour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Zeile_Nach_Routing` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GefahrgutID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Termin` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Uebernahmetemperatur` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Transporttemperatur` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZWareWichtig` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WarenID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifspaltendefID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifspaltenartID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifspaltenStellenBeiPlz` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifzeilendefID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifzeilenartID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VPEinheitID` | Q2 · OPTIONAL | Schlüssel für Verpackungseinheit; Zuordnung noch auflösen |
| `KZAbsender` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ladebeginn` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Abfahrt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ankunft` | Q2; Q3 Adapter/Flow | Geplante Von-Ankunft je Station. Das Datum liefert den Bezug für die Bis-Uhrzeit. |
| `Entladeende` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ladebeginn_Ist` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Abfahrt_Ist` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ankunft_Ist` | Q2 · WICHTIG | Tatsächliche Ankunft; 1899 bedeutet leer |
| `Entladeende_Ist` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Zustellinformation` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: separate Zustellinformation. Nicht ungeprüft mit der bisherigen CSV-Lade-/Entladereferenz gleichsetzen. |
| `LieferscheinNr` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: separate Lieferscheinnummer. Nicht ungeprüft mit der bisherigen CSV-Lade-/Entladereferenz gleichsetzen. |
| `Tarifkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifkilometerManuellErfasst` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Palettentausch` | Q2; Q3 Adapter/Flow | Stationsbezogene Palettentausch-Angabe. Der aktuelle Adapter übernimmt einen gelieferten booleschen Wert. |
| `ContainerstammID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragsstatusWorkflowID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Masse` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0314"></a>
### `dbo.LadeEntladestellen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0315"></a>
### `dbo.LadeEntladestellen_Zugeordnet_Merkmale`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0316"></a>
### `dbo.LadeEntladestellen_Zusatzdaten_Transporeon`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0317"></a>
### `dbo.LadeEntladestellen2`

**Stand:** Name aus Q1; 61 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.LadeEntladestellen.ID` → `dbo.LadeEntladestellen2.LadeEntladestellenID` – Zusatz-/Slotdaten einer Station; nicht über die Zeilenreihenfolge verbinden.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2 · WICHTIG | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `LadeEntladestellenID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.LadeEntladestellen.ID |
| `Slotzeit` | Q2; Q3 Adapter/Flow | Vom Nutzer bestätigt: Bis-Uhrzeit der Station. Nur Uhrzeit extrahieren; das technische Basisdatum (auch 1899) nicht als Fachdaten verwenden. Bei 00:00 oder Ende vor Beginn ist eine Prüfung nötig. |
| `Slotzeit_Ist` | Q2 · WICHTIG | Tatsächliche Slotzeit; 1899 bedeutet leer |
| `ErforderlichFrachtbrief` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ErforderlichCMR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ErforderlichVerbringungEU` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ErforderlichFBLeistungsnachweis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ErforderlichRueckmeldung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TomTomWorkToleranz` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IsLeerkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifkilometerAusRouting` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeBreite_WGS84` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeLaenge_WGS84` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EingangsinfoTelematik` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ManuelleTarifspaltenDefId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TelematikZusatzinfo2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatumUhrzeitAuftragsstatusWorkflo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeBreite_GradDezimal` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GeocodeLaenge_GradDezimal` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Tarifgruppe` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VPEInheiten_kummuliert` | Q2 · OPTIONAL | Zusammenfassende Packstück-/Warenbeschreibung |
| `Gesamtgewicht` | Q2 · PRÜFEN | Gesamtgewicht je Zusatzstopp |
| `Transportgewicht_gesamt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Volumengewicht_gesamt_kg` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KolliGesamt` | Q2 · PRÜFEN | Gesamtstückzahl je Zusatzstopp |
| `Stellplaetze` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifkilometerMaut` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FrachtrateninfoId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `VolumenGesamt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_Ansprechpartner` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_MailAdresse` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_MailNichtMachen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_SmsTelefonnummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_SmsNichtMachen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ASWTI_VersandinformationWorkflow` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TrailerVorgeladenTrailerNurAbhaeng` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AisHinweistextIdVorstati` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AisHinweistextIdWorkflow` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fixtermin` | Q2 · WICHTIG | Fixtermin-Flag, nicht gleichbedeutend mit Slotzeit |
| `DHLQuittungName` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PosBeiGpsOverIp` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ImportAdresseOriginal` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name3` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZugeordneteMerkmaleKurzzeichenG` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZugeordneteMerkmaleNummerBezei` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ServicelisteErledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ServicelisteBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Slotzeit_Von_Plan` | Q2 · WICHTIG | Im Katalog vorhanden; keine bestätigte Gleichsetzung mit der verwendeten Von-Ankunft. Fachliche Bedeutung offen. |
| `LadeEntladestellenParentId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TrackingId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TrackingLink` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SendungenId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Stapler` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StatusLink_SubUTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PodLink_SubUTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LE2_Bemerkung2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LEStatusUTNConnectGehr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LE2_ManuelleStatusmeldungErfolgt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LE2_BenutzerManuelleStatusmeldun` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0318"></a>
### `dbo.LadeEntladestellenDruckoptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0319"></a>
### `dbo.Laender`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0320"></a>
### `dbo.Laender_TimoCom`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0321"></a>
### `dbo.Lager_Bewegungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0322"></a>
### `dbo.Lager_Bewegungen_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0323"></a>
### `dbo.Lager_Bewegungen_Geloescht_Aktionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0324"></a>
### `dbo.Lager_Bewegungsarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0325"></a>
### `dbo.Lager_Stamm`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0326"></a>
### `dbo.Land`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0327"></a>
### `dbo.Leistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0328"></a>
### `dbo.Leistungen_Konten_Hist`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0329"></a>
### `dbo.Leistungen_KundeFolgeleistung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0330"></a>
### `dbo.Leistungen_Kundenpreise`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0331"></a>
### `dbo.Leistungen_Kundenpreise_Save_20220502111323050`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0332"></a>
### `dbo.Leistungen_RabZu_Zuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0333"></a>
### `dbo.Leistungen_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0334"></a>
### `dbo.Leistungen_Typen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0335"></a>
### `dbo.Leistungen_UTNFolgeleistung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0336"></a>
### `dbo.Leistungen_UTNPreise`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0337"></a>
### `dbo.LenkUndRuhezeitenProFahrer`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0338"></a>
### `dbo.Lieferbedingungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0339"></a>
### `dbo.LiveTicker`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0340"></a>
### `dbo.Lizenz`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0341"></a>
### `dbo.LKWAusfallart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0342"></a>
### `dbo.LKWAusfallzeiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0343"></a>
### `dbo.LKWBlacklist`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0344"></a>
### `dbo.LKWKostenFix`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0345"></a>
### `dbo.LKWKostenVar`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0346"></a>
### `dbo.LKWKostenZuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0347"></a>
### `dbo.LKWLaufleistung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0348"></a>
### `dbo.LKWLaufleistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0349"></a>
### `dbo.LKWPosInAnzeigeProUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0350"></a>
### `dbo.LKWVoranmeldung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0351"></a>
### `dbo.Log`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0352"></a>
### `dbo.Log_ConiziHabbl`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0353"></a>
### `dbo.Log_Save_170227`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0354"></a>
### `dbo.LogOrderpilotVerbrauchsprotokoll`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0355"></a>
### `dbo.LogUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0356"></a>
### `dbo.Mahntexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0357"></a>
### `dbo.Mahntexte_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0358"></a>
### `dbo.MailOptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0359"></a>
### `dbo.Mailtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0360"></a>
### `dbo.MapGuideAPILizenz`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0361"></a>
### `dbo.MapGuideControlLizenz`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0362"></a>
### `dbo.MapGuideFahrzeugprofile`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0363"></a>
### `dbo.MapPointLizenz`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0364"></a>
### `dbo.Mapserver_Routingereignisse`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0365"></a>
### `dbo.Meldungsanzeige_User`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0366"></a>
### `dbo.Merkmale`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0367"></a>
### `dbo.Mitarbeitergruppe`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0368"></a>
### `dbo.NeueNummern`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0369"></a>
### `dbo.OffenePosten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0370"></a>
### `dbo.OffenePosten_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0371"></a>
### `dbo.OffenePosten_vKorrigiereOffenePosten_150424_20180130162309840`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0372"></a>
### `dbo.OffenePosten_vKorrigiereOffenePosten_160407_20180130162309870`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0373"></a>
### `dbo.OffenePostenImport`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0374"></a>
### `dbo.OffenePostenZahlungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0375"></a>
### `dbo.OpenRouteService_Abfragen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0376"></a>
### `dbo.OpenTelematics_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0377"></a>
### `dbo.OpenTelematicsTypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0378"></a>
### `dbo.OrderPilot_Auftragsliste_Layout`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0379"></a>
### `dbo.Palettenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0380"></a>
### `dbo.Palettenbewegungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0381"></a>
### `dbo.Palettenbewegungen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0382"></a>
### `dbo.Palettenbewegungen_DeletedRecords`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0383"></a>
### `dbo.Palettenbewegungen_DeletedRecords_Detail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0384"></a>
### `dbo.Palettenbewegungen_vKorrigierePalettenbewegungen_060913`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0385"></a>
### `dbo.Palettenbewegungen_vKorrigierePalettenbewegungen_060914`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0386"></a>
### `dbo.PalettenbewegungenLademittelkontoAnzeigeProfile`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0387"></a>
### `dbo.Palettenpreise`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0388"></a>
### `dbo.PersonalAblaufterminarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0389"></a>
### `dbo.PersonalAblauftermine`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0390"></a>
### `dbo.PersonalAusfallzeiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0391"></a>
### `dbo.PersonalGehalt`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0392"></a>
### `dbo.PersonalRestlenkzeiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0393"></a>
### `dbo.Personalstamm`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0394"></a>
### `dbo.PersonalstammHistorie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0395"></a>
### `dbo.PersonalStundensaetze`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0396"></a>
### `dbo.PersonalStundensaetzeHistorie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0397"></a>
### `dbo.Platzhalter`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0398"></a>
### `dbo.Postleitzahlengruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0399"></a>
### `dbo.Preisanfrage`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0400"></a>
### `dbo.Print_DTA_Bankliste`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0401"></a>
### `dbo.Print_DTA_Begleitzettel`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0402"></a>
### `dbo.Print_Faktura_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0403"></a>
### `dbo.Print_Faktura_Zeilen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0404"></a>
### `dbo.Print_Mahnung_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0405"></a>
### `dbo.Print_Mahnung_Zeilen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0406"></a>
### `dbo.Print_Paletten_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0407"></a>
### `dbo.Print_Paletten_Zeilen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0408"></a>
### `dbo.Produktgruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0409"></a>
### `dbo.Programmtipps_User`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0410"></a>
### `dbo.RechtRollen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0411"></a>
### `dbo.RechtRollenRechte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0412"></a>
### `dbo.RechtRollenUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0413"></a>
### `dbo.Rechtsarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0414"></a>
### `dbo.Relationen`

**Stand:** Name aus Q1; 11 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.RelationsID` → `dbo.Relationen.ID` – Relations-Lookup.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Nummer` | Q2 · WICHTIG | Transportauftragsnummer zum Suchen |
| `Bezeichnung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: angezeigte Relationsbezeichnung; keine direkte Benutzer-ID. |
| `Inaktiv` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBezRel_Gehr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ErmittlungsartGebiet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DHL_ESPReferenztypeID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Mandantentransfer` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LeistungenNr` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Conizi` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_KuehneUndNagel` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0415"></a>
### `dbo.ReportBeschreibungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0416"></a>
### `dbo.ReportTexte_AB`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0417"></a>
### `dbo.ReportTexte_Angebot`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0418"></a>
### `dbo.ReportTexte_Faktura`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0419"></a>
### `dbo.ReportTexte_HBH`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0420"></a>
### `dbo.Reporttexte_Mahnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0421"></a>
### `dbo.Reporttexte_PA`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0422"></a>
### `dbo.ReportTexte_TA`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0423"></a>
### `dbo.Reporttexte_Zahlungsavis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0424"></a>
### `dbo.RouteGebiet`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0425"></a>
### `dbo.Rueckmeldung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0426"></a>
### `dbo.SAP_AuftraegePositionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0427"></a>
### `dbo.SchnittstellenMapping`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0428"></a>
### `dbo.Sendungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0429"></a>
### `dbo.Sendungsportale_Stati`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0430"></a>
### `dbo.Shell_Dateiabschluss899`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0431"></a>
### `dbo.Shell_Dateikopf800`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0432"></a>
### `dbo.Shell_Rechnungseinzelsatz802`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0433"></a>
### `dbo.Shell_Rechnungseinzelsatz802_Org`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0434"></a>
### `dbo.Shell_Rechnungseinzelsatz802_Orig`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0435"></a>
### `dbo.Shell_Rechnungskopf801`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0436"></a>
### `dbo.Shell_Rechnungssummensatz809`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0437"></a>
### `dbo.Shell_Warenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0438"></a>
### `dbo.ShellGebuehren`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0439"></a>
### `dbo.Sicherheitssystem`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0440"></a>
### `dbo.SMS_Mitteilungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0441"></a>
### `dbo.SMS_Mitteilungen_Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0442"></a>
### `dbo.SMS_Optionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0443"></a>
### `dbo.SMS_Provider_Statusmitteilungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0444"></a>
### `dbo.SMS_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0445"></a>
### `dbo.Spedion_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0446"></a>
### `dbo.Spedion_Messages`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0447"></a>
### `dbo.Speditionsversicherung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0448"></a>
### `dbo.Sprachen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0449"></a>
### `dbo.Sprachen_Texte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0450"></a>
### `dbo.SQLBasis`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0451"></a>
### `dbo.SQLBasis_RollenRechte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0452"></a>
### `dbo.Staffeltarife_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0453"></a>
### `dbo.Staffeltarife_Werte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0454"></a>
### `dbo.StatistikFuhrparkAuswertungKM`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0455"></a>
### `dbo.StatistikKorrekturFzg`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0456"></a>
### `dbo.StatistikLKWDispo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0457"></a>
### `dbo.StatistikLKWDispoMSK`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0458"></a>
### `dbo.Steuerung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0459"></a>
### `dbo.Steuerung_DBUpdate`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0460"></a>
### `dbo.SteuerungVorCloudUpdate`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0461"></a>
### `dbo.Stornogrund_Fakturierung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0462"></a>
### `dbo.Stueckgut_Basisleistungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0463"></a>
### `dbo.Stueckgut_Basistouren`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0464"></a>
### `dbo.Stueckgut_Lieferscheine`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0465"></a>
### `dbo.Stueckgut_WarenProLieferschein`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0466"></a>
### `dbo.TabellenFelderOptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0467"></a>
### `dbo.TabellenfelderVerkettungsOptionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0468"></a>
### `dbo.TachoEasy_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0469"></a>
### `dbo.TachoEasy_Statusmeldungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0470"></a>
### `dbo.Tankstellenbewegungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0471"></a>
### `dbo.Tarife_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0472"></a>
### `dbo.Tarife_KundenUnternehmer_Rabatte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0473"></a>
### `dbo.Tarife_Kundenzuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0474"></a>
### `dbo.Tarife_Spaltenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0475"></a>
### `dbo.Tarife_Spaltendefinitionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0476"></a>
### `dbo.Tarife_Transportarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0477"></a>
### `dbo.Tarife_Verpackungsarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0478"></a>
### `dbo.Tarife_Werte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0479"></a>
### `dbo.Tarife_Zeilenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0480"></a>
### `dbo.Tarife_Zeilendefinitionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0481"></a>
### `dbo.Tarife_Zonen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0482"></a>
### `dbo.Telematik_Auftraege`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0483"></a>
### `dbo.Telematik_Bildimporte_Error`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0484"></a>
### `dbo.Telematik_Fahrzeugpositionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0485"></a>
### `dbo.Telematik_LadeEntladestellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0486"></a>
### `dbo.Telematik_Log`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0487"></a>
### `dbo.Telematik_LogUser`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0488"></a>
### `dbo.Telematik_Nachrichten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0489"></a>
### `dbo.Telematik_Nachrichten_Userinfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0490"></a>
### `dbo.Telematik_Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0491"></a>
### `dbo.Telematik_Status_Userinfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0492"></a>
### `dbo.Telematik_Touren`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0493"></a>
### `dbo.TempTabelleIDs`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0494"></a>
### `dbo.Test`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0495"></a>
### `dbo.Textbausteine`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0496"></a>
### `dbo.TextbausteinEditor`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0497"></a>
### `dbo.Textnachricht_Truck24Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0498"></a>
### `dbo.TimoCom_Fahrzeugausstattungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0499"></a>
### `dbo.TimoCom_Frachtinformationen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0500"></a>
### `dbo.TollCollect_Import`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0501"></a>
### `dbo.TomTomWork_Messages`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0502"></a>
### `dbo.TomTomWork_Messages_UserInfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0503"></a>
### `dbo.TomTomWork_OrderMessages`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0504"></a>
### `dbo.TomTomWork_OrderMessages_UserInfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0505"></a>
### `dbo.TomTomWork_Sendejournal`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0506"></a>
### `dbo.TomTomWork_StatusCodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0507"></a>
### `dbo.TOTAL_AZ_Dateikopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0508"></a>
### `dbo.TOTAL_BA_Rechnungsaufstellung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0509"></a>
### `dbo.TOTAL_BB_SummeRechnungProNiederlassung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0510"></a>
### `dbo.TOTAL_BC_SummeRechnungProFuhrpark`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0511"></a>
### `dbo.TOTAL_BJ_Rechnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0512"></a>
### `dbo.TOTAL_BK_SummeLandProNiederlassung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0513"></a>
### `dbo.TOTAL_BL_SummeLandProFuhrpark`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0514"></a>
### `dbo.TOTAL_BR_Tankstellen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0515"></a>
### `dbo.TOTAL_BS_MautstellenUndParkplaetze`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0516"></a>
### `dbo.TOTAL_BT_Rueckverguetungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0517"></a>
### `dbo.TOTAL_BU_GebuehrenAufKartenebene`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0518"></a>
### `dbo.TOTAL_BV_KostenFuerDokumentenerstellung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0519"></a>
### `dbo.TOTAL_BW_MautUndParkgebuehren`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0520"></a>
### `dbo.TOTAL_BZ_ZahlungsmodalitaetenAufKundenebene`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0521"></a>
### `dbo.TOTAL_ZZ_Dateiende`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0522"></a>
### `dbo.Tour_Anfragen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0523"></a>
### `dbo.Tour_Anfragen_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0524"></a>
### `dbo.Touren`

**Stand:** Name aus Q1; 70 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Auftraege.TourenID` → `dbo.Touren.ID` – Tour des Auftrags.
- `dbo.Touren.UnternehmerID` → `dbo.Unternehmerstamm.ID` – Unternehmer einer Tour.
- `dbo.Touren.ID` → `dbo.Touren_Kosten.TourenID` – Kostenpositionen einer Tour.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Nummer` | Q2 · WICHTIG | Transportauftragsnummer zum Suchen |
| `TourDatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RelationsID` | Q2 · PRÜFEN | Verweist auf dbo.Relationen.ID |
| `UnternehmerID` | Q2; Q3 Adapter/Flow | Tour: verweist auf dbo.Unternehmerstamm.ID |
| `LKWNummer` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: LKW-Kennzeichen. Die beiden Kennzeichen werden ohne doppelte identische Angabe dargestellt. |
| `Trailer` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Trailer-Kennzeichen. Die beiden Kennzeichen werden ohne doppelte identische Angabe dargestellt. |
| `Fahrer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Trailertage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Status` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PosInDispo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UnternehmerFahrzeugID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TourStart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TourEnde` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Rechnungsfreigabe` | Q2 · WICHTIG | Hinweis im extrahierten Arbeitskatalog unvollständig; fachliche Bedeutung noch prüfen. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechFreigabe_Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechFreigabe_Dat` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechFreigabe_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UnternehmerBelegNummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Freier_Text_1` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DispoAbgeschlossen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FahrerID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrer2ID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FahrerTelefon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Anhaenger` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Gesamtkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Autobahnkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leerkilometer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Geroutet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansprechpartner` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `StueckgutTourBewertet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZInternTour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `StueckgutAbholung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WiedTour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrer2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Fahrer2Telefon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ProformaTour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kopiervorlage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TourenKostenSindFixiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TourroutingGeaendert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragsstatusWorkflowTourErledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TAPerMailDatum` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Versandzeitpunkt des Transportauftrags. |
| `TAPerMailBearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TAPerMailBearbeiterId` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TAPerMailVersendetAn` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Versandempfänger des Transportauftrags. |
| `VonGehrConnectBearbeitet` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AnsprechpartnerID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `PosInTourenplan` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Faehrkosten_Kunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bahnkosten_Kunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MautkostenAusland_Kunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SonstigeKosten_Kunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextSonstigeKosten_Kunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Faehrkosten_Unternehmer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bahnkosten_Unternehmer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MautkostenAusland_Unternehmer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SonstigeKosten_Unternehmer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextSonstigeKosten_Unternehmer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IDUTNWaehrung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFWGueltigVon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursFWGueltigBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEURGueltigVon` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KursEURGueltigBis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0525"></a>
### `dbo.Touren_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0526"></a>
### `dbo.Touren_Kosten`

**Stand:** Name aus Q1; 39 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Touren.ID` → `dbo.Touren_Kosten.TourenID` – Kostenpositionen einer Tour.
- `dbo.Auftraege.ID` → `dbo.Touren_Kosten.AuftragID` – Nur eindeutig diesem Auftrag zugeordnete Tourkosten werden als dessen Kosten übernommen.
- `dbo.Touren_Kosten.RechKopfID` → `dbo.Faktura_Kopf.KopfID` – Optionale technische Belegkopfreferenz einer Kostenposition.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `TourenID` | Q2; Q3 Adapter/Flow | Verweist auf dbo.Touren.ID |
| `TourenPos` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsreihenfolge in der Tour, soweit vom jeweiligen Quellbereich geliefert. |
| `LeistungID` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LeistungText` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsbeschreibung, soweit vom jeweiligen Quellbereich geliefert. |
| `Menge` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionsmenge, soweit vom jeweiligen Quellbereich geliefert. |
| `Einheit` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Positionseinheit, soweit vom jeweiligen Quellbereich geliefert. |
| `Preis` | Q2; Q3 Adapter/Flow | Einzelpreis einer Position; nicht mit Auftraege.Preis gleichsetzen. |
| `Gesamt` | Q2; Q3 Adapter/Flow | Positionsbetrag; wird im Adapter für den passenden Auftrag summiert. Die vereinbarte Drehpunkt-Währung ist EUR. |
| `STS` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `FibuKonto` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kostenstelle` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Satzart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Zaehler` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: technische Positionskennung, soweit vom jeweiligen Quellbereich geliefert. |
| `Berechnet` | Q2 · OPTIONAL | Abrechnungsstatus dieser Preis-/Kostenposition |
| `RechnungNr` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `RechnungDatum` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Belegart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `AuftragID` | Q2; Q3 Adapter/Flow | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExterneBelegNr` | Q2 · WICHTIG | Externe Unternehmerbelegnummer / Rechnungsreferenz |
| `RechKopfID` | Q2; Q3 Adapter/Flow | Unternehmer-Belegkopf, kann leer sein |
| `TarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LadeEntladestellenID` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KumulierteLeistung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreisEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtEUR` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreisKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GesamtKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PositionErledigt` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaPosID` | Q2; Q3 Adapter/Flow | Technische Fakturapositionsreferenz gespeichert; Zielspalte und vollständige fachliche Bedeutung noch offen. |
| `AddFaktura` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Druckdatum` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `noch_nicht_berechnen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Konsolidiert` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZModulKilometerpreiseLKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistungsinfo2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FahrerID_Leistung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0527"></a>
### `dbo.Touren_Kosten_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0528"></a>
### `dbo.Touren_Kosten_Geloescht`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0529"></a>
### `dbo.Touren_Laendermaut`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0530"></a>
### `dbo.Touren_Truck24Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0531"></a>
### `dbo.Touren_Zusatzdaten_Telematiken`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0532"></a>
### `dbo.Tourenplan20Update_User`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0533"></a>
### `dbo.TourenplanUpdate_User`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0534"></a>
### `dbo.TransEU_Fahrzeugausstattungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0535"></a>
### `dbo.Transportarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0536"></a>
### `dbo.TransportauftragVorNachlauftexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0537"></a>
### `dbo.TravideaAdresssatz`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0538"></a>
### `dbo.TravideaAuftragskopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0539"></a>
### `dbo.TravideaAuftragsposition`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0540"></a>
### `dbo.TravideaLademittelKum`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0541"></a>
### `dbo.TravideaZusatzinfo`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0542"></a>
### `dbo.Trimble_Activities_LES_Zuordnung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0543"></a>
### `dbo.Truck24_Backofficenummern`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0544"></a>
### `dbo.Truck24_Protokoll`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0545"></a>
### `dbo.Truck24_StatusCodes`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0546"></a>
### `dbo.Truck24_Textnachrichten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0547"></a>
### `dbo.UNNummern`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0548"></a>
### `dbo.UnregelmaessigkeitenBeanstandungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0549"></a>
### `dbo.UnregelmaessigkeitenBeanstandungenAmKunden`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0550"></a>
### `dbo.UnregelmaessigkeitenBeanstandungenLng`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0551"></a>
### `dbo.UnregelmBeanstandungenTourAuftrag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0552"></a>
### `dbo.UnregelmBeanstandungenTourAuftragAmKunden`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0553"></a>
### `dbo.Unternehmer`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0554"></a>
### `dbo.UnternehmerFahrzeuge`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0555"></a>
### `dbo.UnternehmerFahrzeuge_Termine`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0556"></a>
### `dbo.UnternehmerFahrzeuge2`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0557"></a>
### `dbo.Unternehmerstamm`

**Stand:** Name aus Q1; 173 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Touren.UnternehmerID` → `dbo.Unternehmerstamm.ID` – Unternehmer einer Tour.
- `dbo.Unternehmerstamm.Zahlungsbedingung` → `dbo.Zahlungsbedingungen.ID` – Zahlungsbedingung des Unternehmers.
- `dbo.Adressstamm.UnternehmerID` → `dbo.Unternehmerstamm.ID` – Interne Gegenreferenz; nicht die Kreditorennummer. Im Stammdatenabruf nur zum Abgleich bereits bekannter Quell-IDs genutzt.
- `dbo.Unternehmerstamm.KundenID` → `dbo.Adressstamm.ID` – Interne Gegenreferenz; nicht die Debitorennummer. Es wird kein zusätzlicher Gegenpartner abgefragt.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bezeichnung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Firmenname des Geschäftspartners (companyName); im TA zusätzlich als Kunden-/Unternehmername. |
| `Strasse` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Straße der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Land` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Land der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `PLZ` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Postleitzahl der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Ort` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Ort der strukturierten Anschrift; kein zusammengefasster Adresstext. |
| `Ansprechpartner` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `Abteilung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TelefonAnsp` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Telefonnummer des zugehörigen Quell-Kontaktslots. |
| `FaxAnsp` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EMailAnsp` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: E-Mail des zugehörigen Quell-Kontaktslots; mehrere Adressen werden getrennt behandelt. |
| `Internet` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Website; enthält der Quellwert stattdessen eine E-Mail-Adresse, wird er als Kontaktmethode behandelt. |
| `Infos` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `ImTourenplanAnzeigen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kreditorennummer` | Q2; Q3 Adapter/Flow | Fachliche Unternehmernummer und exakter Suchschlüssel des Stammdaten-Flows; keine interne Unternehmer-ID. |
| `FibuKontonummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansprechpartner2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `AbteilungAnsp2` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TelefonAnsp2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Telefonnummer des zugehörigen Quell-Kontaktslots. |
| `FaxAnsp2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EMailAnsp2` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: E-Mail des zugehörigen Quell-Kontaktslots; mehrere Adressen werden getrennt behandelt. |
| `Ansprechpartner3` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Kontaktname. Parallele Namens-, Telefon-, E-Mail- und Mobilfeldfamilien nicht ungeprüft neu miteinander verknüpfen. |
| `AbteilungAnsp3` | Q2; Q3 Adapter/Flow | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TelefonAnsp3` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: Telefonnummer des zugehörigen Quell-Kontaktslots. |
| `FaxAnsp3` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EMailAnsp3` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung, sofern im aktuellen Adapter verwendet: E-Mail des zugehörigen Quell-Kontaktslots; mehrere Adressen werden getrennt behandelt. |
| `Bewertung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Kreditlimit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bankname` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Bankort` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `BLZ` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `KontoNr` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Suchwort` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Name2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Name3` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `USTID` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: USt-ID in den Unternehmensdaten. |
| `Steuernummer` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: Steuernummer in den Unternehmensdaten. |
| `KundenNrBeiLief` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Unternehmerart` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `LiefNrBeiKunde` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Unternehmergruppe` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Zahlungsbedingung` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: interne Lookup-Referenz auf Zahlungsbedingungen.ID; der dortige Bezeichnungstext wird als Zahlungsziel gespeichert. |
| `EigeneAdresse` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SprachenID` | Q2 · OPTIONAL | Sprach-ID; eine verlässliche ID-zu-Sprachcode-Zuordnung ist noch offen. |
| `KundenID` | Q2; Q3 Adapter/Flow | Interne ID des Gegenpartners im Adressstamm; kein Anlass für einen zusätzlichen Abruf. |
| `SchicktRechnung` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp1Mail` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Mail` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp3Mail` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp1Fax` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Fax` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp3Fax` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `StandardTarifID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Postfach` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PLZPostfach` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AbweichendesPalettenkonto` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KeineGegenbuchungEntlStelle` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Leistung_DKV_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistung_Tankstellen_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KZ_verbundenerUTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Erfassungsdatum` | Q2; Q3 Adapter/Flow | Erfassungsdatum in DyCoS, getrennt vom Anlagezeitpunkt in Drehpunkt. |
| `BearbeiterErfassung` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearbeiter` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Dat` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Bearb_Zeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistung_TollCollect_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MautabrechnungTC` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TankstellenGebuehren` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TankgebuehrenNichtBerechnen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Mustervorlage` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `PreiseingabeInW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `WaehrungID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ProzentualeUTNKostenVerwenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LAProzentualeUTNKosten` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ProzentsatzUTNKosten` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IstLieferant` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AuftragstransferAnMandant` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `BefoerdererNummer` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTNPreisNichtAusFrachtRInfo` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTNPostfachAdresseNichtVerwenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FrachtMautKombinieren` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SteuerfreiTextID` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `IBAN` | Q2; Q3 Adapter/Flow | Geschützte Bankangabe; nur im vorgesehenen Stammdatenablauf nutzen. Keine Werte in diese Dokumentation aufnehmen. |
| `SWIFT` | Q2; Q3 Adapter/Flow | Geschützte Bankangabe; vom Adapter als BIC verwendet. |
| `GSProLKW` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1HandyUTN` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Ansp2HandyUTN` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Ansp3HandyUTN` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: eigenständige Mobil-Kontaktmethode. Eine sichere Personenzuordnung allein aus dieser Nummerierung ist nicht bestätigt. |
| `Leistung_Shell_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaSortGroupOption` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaBelegPro` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `GebietID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IstAuchLieferant` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistung_AdBlue_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bLademittelProTour` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextTransportauftrag` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTN_VerwendeBemerkung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UTN_KZAuftragssperre` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TextUTNKZAuftragssperre` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `LoginKPI` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TimoComNummer` | Q2; Q3 Adapter/Flow | Drehpunkt-Zuordnung: TIMOCOM-Referenznummer; ein reiner Nullwert wird nicht als fachliche Referenz übernommen. |
| `bProFormaNichtAnFibuExportieren` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `EmailMahnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `KeinFahrzeugInFakturaKundeDrucke` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaInfo_UTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Leistung_Total_Abrechnung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `TrackingErinnerungSenden` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp1MahnungStandard` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2MahnungStandard` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3MahnungStandard` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Pfad` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IBANgeprueft` | Q2; Q3 Adapter/Flow | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `IBANgeprueftBearbeiter` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `IBANgeprueftDatum` | Q2; Q3 Adapter/Flow | Datum der IBAN-Prüfung; wird nur bei IBANgeprueft = true übernommen. |
| `bZahlungswunschdatumEintragen` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bFibuKontoDivers` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp1Avis` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Ansp2Avis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Ansp3Avis` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `EmailAvis` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailtextZahlungsavisPlain` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailtextZahlungsavisHtml` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UrlAdresseUTN_Lief` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ConiziHabbl_Input_ApiKey` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `ConiziHabbl_Output_ApiKey` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `EHLAccount` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ConiziHabbl_Preproduction_Verwend` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ConiziHabbl_NextUrl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ConiziHabbl_PreProduction_NextUrl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Zahlungsbedingung2` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `TelematikLink_SubUTN_inTA` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschKuehneUndNagelFtp` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `DatenaustauschKuehneUndNagelIm` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschKuehneUndNagelExp` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `AbweichenderKontoinhaber` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Logenios_ApiKey` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Eikona_ApiKey` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Eikona_EdiId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschEikonaSendungsport` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `UTN_NurGespeicherteFahrzeugeErla` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Faktura_Export_UTN_Format` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UyumSoft_BenutzerName` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `UyumSoft_Kennwort` | Q2 · GESCHÜTZT | Zugangsdatenfeld laut Katalog; keine Werte dokumentieren oder pauschal importieren. |
| `Bewertung2` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FarbwertBewertung2` | Q2 · PRÜFEN | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `DatenaustauschDBSchenkerFtpServ` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerFtpBenu` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `DatenaustauschDBSchenkerFtpKenn` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `DatenaustauschDBSchenkerImportV` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerExportV` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_DBSchenker_Branch` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerUNLOCO` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerFirmaKu` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerFtpProto` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerFtpVersc` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `DatenaustauschDBSchenkerFingerpr` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Transporeon_BenutzerName` | Q2 · GESCHÜTZT | Nicht pauschal an Drehpunkt ausgeben; Zugriff gesondert |
| `Transporeon_Kennwort` | Q2 · GESCHÜTZT | Zugangsdatenfeld laut Katalog; keine Werte dokumentieren oder pauschal importieren. |
| `BesteuerungsartManuellAenderbar` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UyumSoft_URI` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `UyumSoft_SendDraft` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_DBSchenker_ID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IsDatenaustauschDBSchenkerSGI` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_DBSchenker_Partner_ID` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `IsTestumgebungDBSchenker` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Fortas` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FortrasMailBoxId` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `CompanyCodeHellmann` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `FakturaBelegUTNPerEmailVersenden` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailtextFakturabelegPlain` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `MailtextFakturabelegHtml` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `CO2_ermitteln_UTN` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0558"></a>
### `dbo.Unternehmerstamm_Ansp`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0559"></a>
### `dbo.Unternehmerstamm_Diary`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0560"></a>
### `dbo.Unternehmerstamm_OpenTelematics_Einstellungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0561"></a>
### `dbo.Unternehmerstamm_Telematiken_Einstellungen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0562"></a>
### `dbo.User`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0563"></a>
### `dbo.UserEinstUebernahme`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0564"></a>
### `dbo.UserZaehler`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0565"></a>
### `dbo.UTA_6301_Detail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0566"></a>
### `dbo.UTA_6301_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0567"></a>
### `dbo.UTA_6301_Summen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0568"></a>
### `dbo.UyumsoftBelegnummern`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0569"></a>
### `dbo.Verbrauchsdatenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0570"></a>
### `dbo.VerbrauchsdatenStatistik`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0571"></a>
### `dbo.VerbrauchsdatenWarenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0572"></a>
### `dbo.VerbringungsnachweisEU`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0573"></a>
### `dbo.VerbringungsnachweisEUDetail`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0574"></a>
### `dbo.Verpackungseinheiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0575"></a>
### `dbo.Verpackungseinheiten_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0576"></a>
### `dbo.Verpackungseinheiten_TransEu`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0577"></a>
### `dbo.Versandart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0578"></a>
### `dbo.Verwaltung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0579"></a>
### `dbo.VorNachlaufTexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0580"></a>
### `dbo.WaehrungKurs`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0581"></a>
### `dbo.WaehrungKursK`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0582"></a>
### `dbo.WaehrungKursTCMB`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0583"></a>
### `dbo.WaehrungKursU`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0584"></a>
### `dbo.WaehrungStamm`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0585"></a>
### `dbo.Warenarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0586"></a>
### `dbo.Warenarten_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0587"></a>
### `dbo.Warenartenzuordnung_Tankstelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0588"></a>
### `dbo.Warenausgang_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0589"></a>
### `dbo.Warenausgang_Kopf_OLD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0590"></a>
### `dbo.Warenausgang_Positionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0591"></a>
### `dbo.Warenausgang_Positionen_OLD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0592"></a>
### `dbo.Wareneingang_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0593"></a>
### `dbo.Wareneingang_Kopf_OLD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0594"></a>
### `dbo.Wareneingang_Positionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0595"></a>
### `dbo.Wareneingang_Positionen_OLD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0596"></a>
### `dbo.Warengruppen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0597"></a>
### `dbo.WarenProLadeEntladestelle`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0598"></a>
### `dbo.WarenProLadeEntladestelle_Archiv`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0599"></a>
### `dbo.WarenProLadeEntladestelle_Save_150827`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0600"></a>
### `dbo.Werkstatt_Auftraege_Auftragsarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0601"></a>
### `dbo.Werkstatt_Auftraege_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0602"></a>
### `dbo.Werkstatt_Auftraege_Positionen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0603"></a>
### `dbo.Werkstatt_Auftragsarten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0604"></a>
### `dbo.YellowFox_Bildtypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0605"></a>
### `dbo.YellowFox_Status`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0606"></a>
### `dbo.YellowFox_Workflow`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0607"></a>
### `dbo.Zahlungsbedingungen`

**Stand:** Name aus Q1; 13 bekannte Feldbezeichnungen aus Q2/Q3. Vollständigkeit des SQL-Schemas und genaue SQL-Datentypen sind offen.

**Bekannte Verbindungen:**

- `dbo.Adressstamm.Zahlungsbedingung` → `dbo.Zahlungsbedingungen.ID` – Zahlungsbedingung des Kunden.
- `dbo.Unternehmerstamm.Zahlungsbedingung` → `dbo.Zahlungsbedingungen.ID` – Zahlungsbedingung des Unternehmers.

| Feldbezeichnung | Quelle / Status | Bedeutung / Hinweis |
| --- | --- | --- |
| `ID` | Q2; Q3 Adapter/Flow | Interne ID im jeweiligen Tabellenkontext; kein nachgewiesener SQL-PK-Constraint. |
| `Bezeichnung` | Q2; Q3 Adapter/Flow | Zahlungszieltext. Drehpunkt speichert diesen trotz des internen Namens paymentTermDays als Text. |
| `Skontoprozente` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Skontofaelligkeit` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Nettofaelligkeit` | Q2 · WICHTIG | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Drucktext` | Q2 · OPTIONAL | Feld im Arbeitskatalog erfasst; genaue fachliche Bedeutung noch nicht bestätigt. |
| `Geloescht` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `Bankeinzug` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `bZumMonatsende` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZumXtenDesFolgemonats` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ZumXtenDesZweitenFolgemonats` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `ExtBez_Prostahl` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |
| `SonderZahlungsbedingung` | Q2 · SELTEN/LEER | Im begrenzten Katalog-Sample ohne aussagekräftige Belegung; Bedeutung und Nutzung offen. 0/false können dennoch fachlich gültig sein. |

<a id="table-0608"></a>
### `dbo.Zahlungsbedingungen_Sprachtexte`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0609"></a>
### `dbo.Zahlungsvorschlag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0610"></a>
### `dbo.Zahlungsvorschlag_Historie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0611"></a>
### `dbo.Zahlungsvorschlag_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0612"></a>
### `dbo.Zahlungsvorschlag_Kopf_Historie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0613"></a>
### `dbo.ZahlungsvorschlagLS`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0614"></a>
### `dbo.ZahlungsvorschlagLS_Historie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0615"></a>
### `dbo.ZahlungsvorschlagLS_Kopf`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0616"></a>
### `dbo.ZahlungsvorschlagLS_Kopf_Historie`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0617"></a>
### `dbo.Zeiterfassung`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0618"></a>
### `dbo.ZUGFeRD_DatenTypen`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0619"></a>
### `dbo.ZUGFeRD_EAS`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0620"></a>
### `dbo.ZUGFeRD_Faktura`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0621"></a>
### `dbo.ZUGFeRD_FakturaXMLValue`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0622"></a>
### `dbo.ZUGFeRD_FakturaXMLValue_XMLAttributeValue`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0623"></a>
### `dbo.ZUGFeRD_ICD`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0624"></a>
### `dbo.ZUGFeRD_Item`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0625"></a>
### `dbo.ZUGFeRD_KundenArt_UNTID5305`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0626"></a>
### `dbo.ZUGFeRD_MIME`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0627"></a>
### `dbo.ZUGFeRD_PaymentMethod`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0628"></a>
### `dbo.ZUGFeRD_Profile`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0629"></a>
### `dbo.ZUGFeRD_Unit`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0630"></a>
### `dbo.ZUGFeRD_Units_Einheiten`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0631"></a>
### `dbo.ZUGFeRD_UNTDID_1001`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0632"></a>
### `dbo.ZUGFeRD_UNTDID_1153`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0633"></a>
### `dbo.ZUGFeRD_UNTDID_4451`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0634"></a>
### `dbo.ZUGFeRD_UNTDID_5305`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0635"></a>
### `dbo.ZUGFeRD_VATEX`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0636"></a>
### `dbo.ZUGFeRD_XML`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0637"></a>
### `dbo.ZUGFeRD_XML_Attribute`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0638"></a>
### `dbo.ZUGFeRD_ZeitFormate`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0639"></a>
### `dbo.Zusatzdokumente`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0640"></a>
### `dbo.ZusatzdokumenteAngebot`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0641"></a>
### `dbo.ZusatzdokumenteAuftrag`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0642"></a>
### `dbo.ZusatzdokumenteBelegart`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.

<a id="table-0643"></a>
### `dbo.ZusatzdokumenteTour`

**Belegt:** technischer Objektname aus Q1. Spalten, Bedeutung, Objekttyp und Verbindungen sind noch nicht erhoben.
