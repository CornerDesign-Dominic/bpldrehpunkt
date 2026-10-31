# DyCoS-Feldklärung: Kontakte, Stationsreferenzen und Belege

Stand: 31.10.2026. Untersuchung auf Nutzerwunsch mit drei parallelen
Teilprüfungen und anschließender autorisierter lokaler Umsetzung.
Noch nicht veröffentlicht; Main bleibt unberührt.

Der bestehende authentifizierte TA-Flow wurde einmal lesend für `260600100`
abgerufen; Antwortnummer geprüft. Produktions-Firestore `db-bpl-drehpunkt`
wurde auf sieben bekannte TA-Nummern begrenzt und ausschließlich mit Projektion
der Stations-/Importherkunftsfelder gelesen. Keine Aufträge, Partner,
Trackingempfänger oder Historien geändert. Vollständige Exporte und minimierter
Produktionsauszug liegen außerhalb von Git in der geschützten lokalen Ablage.

## Auftragskontakte und Kundenreferenz

| Bedeutung | Quelle und Stand |
| --- | --- |
| Kundenkontakt im Auftrag | `Auftraege.ImAuftrag` → `contacts.customerForOrder` bereits vorhanden; Live-Beispiel entspricht der Nutzerangabe |
| Letzter TA-Versandempfänger | `Touren.TAPerMailVersendetAn` → `dispatch.sentTo`, Zeitpunkt aus `TAPerMailDatum`, bereits vorhanden |
| Dispositionsbemerkung | `Auftraege.DispoBemerkung`, noch nicht übernommen; im Live-Beispiel ohne Mailadresse |
| Kundenabrechnungs-/Auftragsreferenz | `Auftraege.Referenznummer` → `customerReference`, bereits vorhanden; Ortsangaben bleiben gültiger Freitext |

Standard-Mailkennzeichen gehören nach Nutzerklärung zu den Stammdaten und sind
für den Auftragskontaktblock nicht mehr maßgeblich. Aktuell nennt die Oberfläche
den Kundenwert irreführend „Info-1“ und den bislang ungemappten Unternehmerwert
„Im Auftrag“. Anzeige entsprechend den tatsächlichen Quellen anpassen.

In den 14 geprüften Antworten existiert `Info1` nicht im Auftrag oder der Tour,
sondern nur in `Faktura_Zeilen`. Bei `260600100` entspricht eine solche Adresse
dem aktuellen TA-Versandempfänger; die andere Fakturazeile ist leer. Das belegt
keinen allgemeinen aktuellen Auftragskontakt. Beleg-Snapshots dürfen diesen
nicht still ersetzen. Dispositionsbemerkung vollständig als Freitext erhalten;
enthaltene Adressen nicht ohne Zuordnung Kunde oder Unternehmer zuschlagen.

Der Trackingstart verwendet den validierten TA-Versandempfänger. Ein späterer
TA-Abruf ändert den gespeicherten Trackingempfänger aktuell nicht automatisch.
Noch abzustimmender Vorschlag: Nur zuvor automatisch übernommene Empfänger
nachführen; manuelle Entscheidungen erhalten.

## Stationsbemerkungen und bisherige CSV-Referenzen

`260600100` liegt unter dieser Nummer nicht im geprüften Produktionsbestand.
Der Alt-/Neu-Abgleich erfolgte deshalb mit dem dort vorhandenen `261000115`:

| Alter CSV-Zielwert in Produktion | Bestätigte DyCoS-Quelle |
| --- | --- |
| `loading.note`, `unloading.note` | `LadeEntladestellen.Bemerkung`; Unterschiede nur Leerzeichen/Zeilenumbrüche |
| `loading.reference`, `unloading.reference` | `LadeEntladestellen.Zustellinformation`; beide Werte exakt gleich |

In der ursprünglichen Stichprobe entsprechen gefüllte Auftragsfelder
`LadestelleBemerkung`/`EntladestelleBemerkung` und
`LadestelleZustellinfo`/`EntladestelleZustellinfo` jeweils den Stationswerten,
ergänzt um `(L1)`/`(E1)` usw. Bei mehreren Stationen Einzelwerte über IDs
verwenden, keinen aggregierten Auftragstext auf eine einzelne Station kopieren.

Live-Beispiel `260600100`: Auftrag-ID `75343`, Ladestation `160288`,
Entladestation `160289`. Lade-Bemerkung enthält die Planensprinter-/Beladungs-
und Palettentauschanweisung, Lade-Zustellinformation den Abholhinweis.
Entladefelder und Lieferscheinnummern sind leer. Zusatzzeilen verknüpfen
`161252 → 160288` und `161253 → 160289`; vorhandene Join-Prüfung genügt.

Der Adapter speichert bereits je Station `note`, `deliveryInformation` und
`deliveryNoteNumber`. Die Zusammenfassung erste Lade-/letzte Entladestelle
übernimmt bisher nur `note`; `reference` ist absichtlich ungemappt. Nächste
Umsetzung: bestätigte `Zustellinformation` auch in diese Zusammenfassung
übernehmen. Vollständigen Freitext erhalten: Nummern, Kontakte und Hinweise sind
möglich. `LieferscheinNr` ist kein belegter Ersatz der alten L/E-Referenz.

## Belege: interne und externe Nummern trennen

Live-Beispiel `260600100`, Auftrag-ID `75343`:

| Bedeutung | Nachgewiesener Wert/Feld |
| --- | --- |
| Eigene Kundenrechnung | `BelegNr=63369`, `KopfID=126893`, `bUnternehmer=false`, `bProformabeleg=false`, `Belegart=3` |
| Interne UTN-Verbuchung | `BelegNr=115726`, `KopfID=127519`, `bUnternehmer=true`, `bProformabeleg=true`, `Belegart=7` |
| Externe UTN-Rechnung | `Faktura_Kopf.ExterneBelegnummer=1099/06/2026`; zusätzlich `Touren_Kosten.ExterneBelegNr` |

Interne Proforma-Gutschrift nicht als tatsächlich von uns ausgestellte
UTN-Gutschrift behandeln. `TextStorno` enthält auch normale Verbuchungstexte;
im Beispiel `Storniert=false`, `StornoRechungNr=0` (exakte Quellschreibweise).
Keine externe Nummer aus Freitext extrahieren, wenn strukturierte Felder
vorliegen. Internes Proforma-Belegdatum nicht als nachgewiesenes Datum der
externen Rechnung ausgeben.

Die Nutzererklärung zum Dateinamen lässt sich auf das richtige Feld präzisieren:

- `PDFDateiname`/`PDFBeleglink` können die externe Originalrechnung bezeichnen.
- Der interne DyCoS-Originalbeleg steht unter
  `PDFDateinameMitPfadFakturaBelegOriginal`; im Beispiel
  `ProformaGutschriftUTN_115726_127519_260623131951.pdf`.
- Bei allen 17 geprüften Köpfen aus 13 alten Exporten plus neuem Live-Abruf
  passen interne Originaldateinamen zu Partner-/Proformakennzeichen: sieben
  `Rechnung_…`, neun `ProformaGutschriftUTN_…`, eine `ProformaRechnung_…`.
  Bestätigte Stichprobe, keine Vollständigkeitsgarantie für weitere Belegarten.
- Nur belegbar dem Auftrag zugeordnete Köpfe übernehmen: über Fakturazeilen
  bzw. auftragsbezogene Preis-/Kostenpositionen, keine übrigen Tourbelege.

## Lokale Umsetzung und verbleibende Punkte

1. Auftragskontaktblock, Dispositionsbemerkung und bestätigte Stationsreferenzen
   sind umgesetzt; vorhandene Karten, Anordnung und CSS bleiben erhalten.
   Belegdaten nutzen die bestehenden Abschnitts-/Tabellenklassen.
2. Belegblock für die drei nachgewiesenen Fälle mit getrennten internen/externen
   Nummern umgesetzt. Die Kunden-Stornorechnung ist durch die Ergänzung unten
   inzwischen belegt und lokal umgesetzt. Ohne technische Beispiele bleiben
   Stornogutschrift, Kunden-Rechnungskorrektur, eigene UTN-Gutschrift ohne
   Proforma und Rechnung an Unternehmer. Zunächst passende TA-Beispiele nutzen,
   keine aufwendige Erschließung sämtlicher Belegcodes. Der Unterschied von
   `Belegart=2` und `3` allein ist ebenfalls nicht vollständig belegt.
3. Nutzerentscheidung umgesetzt: Automatische Trackingempfänger nachführen,
   manuelle erhalten. Details und Abnahme siehe unten.
4. Zeitfenstersemantik für `00:00` und Ende vor Beginn bleibt offen.
   Automatischer Hintergrundimport folgt als eigenständige Entscheidung.

### Verhalten der Umsetzung

`imported.dispositionNote` enthält den vollständigen Dispositionstext.
Die bestätigten Stationsreferenzen werden nun aus den Einzelstationen übernommen;
die bisherige Sonderkonservierung dieser zwei ungeklärten CSV-Felder entfällt.
Manuelle Auftragsdaten und die weiterhin ungeklärten alten Kontaktwerte bleiben
erhalten. Eine eindeutige externe Positionsnummer kann eine fehlende
Kopf-`ExterneBelegnummer` ergänzen; bei widersprüchlichen Nummern bleibt die
Auswahl leer und ein Prüfhinweis sichtbar. Nur exakt auftragsbezogene Belegköpfe
werden gespeichert. Belegdatum ist ausdrücklich das Datum des internen Belegs.
Dateien werden nur als Basename gespeichert, keine Serverpfade oder Bankdaten.

Tracking folgt ausschließlich `recipients.carrier.source=transport-order-import`
bei aktiver Verfolgung. Leere, ungültige oder mehrdeutige neue Versandziele
leeren diesen automatischen Empfänger, damit keine weitere Anfrage an die alte
Adresse geht. Der Quellmarker bleibt für eine spätere gültige Adresse erhalten.
Manuell gespeicherte Werte einschließlich gleicher Adresse oder bewusster
Leerung behalten `source=manual`. Legacy ohne belegte Autoquelle und
abgeschlossene Verfolgungen bleiben unangetastet.

Empfängeränderung und TA-Import werden atomar gespeichert. Ein Trackingereignis
enthält alte/neue Adresse, Akteur, Zeitpunkt und Importlauf; historische
Versandnachweise werden nicht verändert. Automatische und manuelle Versandwege
prüfen das aktuelle Ziel erneut unmittelbar vor dem Versand. Bereits laufende
HTTP-Versandaufrufe lassen sich nicht nachträglich zurückrufen.
Das vorhandene Empfängerformular kann dieselbe Auto-Adresse bewusst manuell
bestätigen und zeigt nach einem Refresh den aktuellen gespeicherten Empfänger.

Disposition und Belege sind im Importfingerprint sowie in der kompakten
Vorher-/Nachher-Historie berücksichtigt. Unbekannte Belegtypen, widersprüchliche
Quellen/Nummern und ungeklärte Datums-/Stornowerte erzeugen verständliche
Prüfhinweise statt erfundener Zuordnungen. Technische Abruf-/Mappingfehler
verwenden weiterhin die bestehende Diagnose.

### Prüfung und spätere Dev-Veröffentlichung

Gezielte Backend-/Client-Tests, 22 bestehende/erweiterte DyCoS-Emulatorfälle und
ein zusätzlicher Emulatorablauf für Speicherung, tatsächliche Feldänderungen,
Historie, Wiederholung und Erhalt manueller Daten erfolgreich. Alle 14 lokalen
Antworten wurden gemappt: 17 korrekt zugeordnete Belege, keine Belegwarnungen.
ESLint aller geänderten/neuen JS-Dateien, Produktionsbuild und Abgleich der
42 gemeinsamen Functions-Module erfolgreich.

Browserabnahme ausschließlich mit synthetischen lokalen Daten: DE/EN,
hell/dunkel, alte Datensätze ohne Belege, leere Beleglisten, mehrzeiliger
Dispositionstext und bewusste manuelle Bestätigung einer unveränderten
Auto-Adresse. Keine CSS-Datei geändert, keine Live-Daten geschrieben.

Für eine spätere ausdrücklich freigegebene Dev-Veröffentlichung: Frontend und
`fetchDycosTransportOrder`, `updateManualShipmentTracking`,
`scheduledShipmentTrackingAutomation`, `sendManualShipmentTrackingMail`.
Für konsistente Erstinitialisierung über sämtliche bestehenden Einstiege auch
`applyMailboxTracking`, `processStatusMailAiOnCreate`, `retryStatusMailAi`
berücksichtigen; diese verwenden denselben Tracking-Grundaufbau.
Keine neuen Secrets, Rules, Indizes oder Power-Automate-Änderungen erforderlich.
Bestehende Aufträge erhalten neue Quelldaten beim erneuten Abruf; keine
pauschale Migration oder erneuter Massenimport wurde ausgeführt.

## Ergänzung: echte Kundenstornierungen, lesend geprüft am 31.10.2026

Nutzerbeispiele: `261000653`, `261000309`, `260900070`, `260900707`.
Die doppelt genannte `261000653` wurde nur einmal abgefragt. Vier erfolgreiche
HTTP-Abrufe über den bestehenden authentifizierten TA-Flow, ohne Übernahme nach
Drehpunkt oder Änderung der Importregeln. Rohantworten und begrenzte
Vergleichsergebnisse bleiben in der geschützten Ablage außerhalb von Git.

Alle Antworten liefern je vier Belegköpfe: alte Kundenrechnung, deren
Stornorechnung, neue Kundenrechnung sowie eine UTN-Proforma-Verbuchung.
Damit ist die Kunden-Stornorechnung als weiterer Fall belegt; ihre anschließende
lokale Umsetzung wurde vom Nutzer ausdrücklich beauftragt.

| TA | Alte Rechnung / KopfID | Stornorechnung / KopfID | Stornodatum | Neue Rechnung / KopfID | Aktueller Kundenpreis netto |
| --- | --- | --- | --- | --- | --- |
| 261000653 | 66966 / 134198 | 66966 / 134302 | 27.10.2026 | 67025 / 134304 | 195 EUR |
| 261000309 | 66718 / 133765 | 66718 / 133883 | 19.10.2026 | 66821 / 133884 | 280 EUR |
| 260900070 | 66684 / 133731 | 66684 / 133898 | 20.10.2026 | 67054 / 134372 | 260 EUR |
| 260900707 | 66245 / 132694 | 66245 / 133476 | 13.10.2026 | 66556 / 133477 | 450 EUR |

### Bestätigte Erkennungsmerkmale

- Alte Rechnung: `TextRechnung=RECHNUNG`, `Belegart=2` oder `3`,
  `Storniert=true`. `StornoRechungNr` entspricht ihrer eigenen Belegnummer;
  `StornoRechnungDatum` enthält das Stornodatum.
- Stornorechnung selbst: `TextRechnung=STORNO-RECHNUNG`, `Belegart=5`,
  `bUnternehmer=false`, `bProformabeleg=false`, `Storniert=false`.
  Das letzte Flag beschreibt also den Status eines Belegs, nicht dessen Art.
  `Storniert=false` bedeutet keinesfalls, dass es kein Stornobeleg ist.
- Stornobeleg und alte Rechnung verwenden in allen vier Fällen dieselbe
  `BelegNr` und `BelegNrID`, aber unterschiedliche `KopfID`. Die Kopf-ID bleibt
  die Identität; niemals nach Belegnummer deduplizieren.
- Beim Stornobeleg steht die ursprüngliche Nummer zusätzlich in `TextStorno`;
  `StornoRechungNr=0`. Nur im bestätigten Stornokontext ist dieser Text ein
  Referenzhinweis. Bei Proforma-Belegen bleibt er eine gewöhnliche Beschreibung.
- Interne Originaldateien heißen `Rechnung_…` beziehungsweise
  `Stornorechnung_…`. Die Dateinamen passen in allen vier Fällen zu Text und Code.
- Netto- und Bruttokopfbeträge des Stornos sind jeweils das exakte negative
  Gegenstück zur alten Rechnung. Fakturazeilen zeigen ebenfalls negativen
  `Betrag` und `Menge=-1`. Negative Werte nicht entfernen oder in positive ändern.
- `Auftraege_Preise.RechKopfID` verweist in allen vier Antworten auf die neue
  Rechnung. Die Belegart allein oder die höchste Belegnummer genügt nicht zur
  Bestimmung aktuell zugeordneter Rechnungen.

Die Zuordnung alte Rechnung ↔ Storno lässt sich in diesen Antworten eindeutig
über Auftrag, Partnerseite, Belegart und dieselbe Belegnummer mit unterschiedlichen
Kopf-IDs nachvollziehen. Eine direkte Kopf-ID-Verbindung von Storno zu Original
ist damit noch nicht belegt. Bei mehreren passenden Kandidaten nicht raten.

### Weitere Erkenntnisse und Grenzen

Bei `261000309` bleibt netto 280 EUR erhalten; die alte Rechnung hat 53,20 EUR
MwSt und 333,20 EUR brutto, die neue 0 EUR MwSt und 280 EUR brutto. Eine Änderung
der Steuerbehandlung ist sichtbar. Ein expliziter Stornogrund ist dadurch nicht
belegt. Bei den übrigen drei Beispielen bleiben die geprüften Netto-/Bruttowerte
der neuen Rechnung identisch zur alten; aus Beträgen allein folgt kein Grund.

`Belegart=2` und `3` kommen weiterhin beide bei gewöhnlichen Rechnungen vor.
Die Codes dürfen insbesondere nicht pauschal als steuerfrei/steuerpflichtig
interpretiert werden. `bRechnungskorrektur` ist bei allen 16 gelieferten Köpfen
false; daraus ergibt sich kein Beispiel für die separate Rechnungskorrektur.

Nebenfund `261000653`: UTN-Proformakopf enthält 2.630 EUR netto, die zu diesem TA
gelieferte Fakturazeile 150 EUR. Kopfwerte können Sammelbelege betreffen und
dürfen nicht als auftragsbezogener Ertrag/Kostenwert übernommen werden.

Der lokale Mapper verarbeitet inzwischen alle vier Antworten mit stabilen,
getrennten Kopf-IDs und ordnet die Kunden-Stornorechnungen korrekt zu.
Die Stornorechnung erhält `businessType=customer_invoice_cancellation`,
`internalType=invoice_cancellation`, `issuer=us` und den Originalbezug
`originalDocumentSourceId`/`originalDocumentNumber`. Das tatsächlich stornierte
Original erhält bei vorhandener Quelle das `cancellationDate`. Mehrfachstornos,
Teilstornos, Stornogutschriften, Rechnungskorrekturen und weitere Sonderfälle
werden durch diese vier Beispiele nicht vollständig nachgewiesen.


### Abnahme der Kunden-Stornorechnung

Die Zuordnung erfolgt nur innerhalb der exakt auftragsbezogen gelieferten
Köpfe. Originalnummer und BelegNrID müssen zum stornierten Kunden-Original
passen; Titel, Code, Dateiname, Partner-/Proformakennzeichen und vorhandene
Referenz-/Datumsangaben dürfen sich nicht widersprechen. Fehlende oder mehrere
passende Originale bleiben unaufgelöst und sichtbar gewarnt. Stornogutschriften
werden weiterhin nicht ohne bestätigte Beispiele klassifiziert.

Die bestehende Belegtabelle behält sämtliche Spalten und CSS. In ihrer
Hinweisspalte stehen Stornodatum am Original und ein Verweis zur Ursprungsrechnung
am Stornobeleg; der Verweis springt direkt zur Originalzeile derselben Tabelle.
Bezug und Datum sind in der vorhandenen Änderungshistorie berücksichtigt.

44 fokussierte Tests, zwei vollständige Speicher-/Refresh-/Historienfälle im
Firestore-Emulator, gezieltes ESLint und Build erfolgreich. Die vier echten
Stornoantworten wurden ausschließlich lokal gemappt: jeweils vier getrennte
Belege und der korrekte Originalbezug, keine Belegwarnungen. Browserprüfung mit
synthetischen Daten in DE/EN und hell/dunkel einschließlich Originalverweis.
Keine CSS-Datei geändert, kein Deployment, keine Live-Datenänderung.

## Zahlungsstatus: aktueller Erkenntnisstand

Die bisher geprüften TA-Antworten liefern Zahlungsbedingungen und Fälligkeiten,
aber keinen bestätigten Zahlungsbetrag, offenen Restbetrag oder Zahlungsstatus.
`InTPAnzeigenWennOffen`, Mahnkontakt-Flags und fehlende Stornomarker sind kein
Nachweis einer offenen oder bezahlten Rechnung. Auch eine Stornobuchung ist
kein Zahlungseingang.

Drehpunkt bietet bei Inkasso-Rechnungen bereits eine manuell gepflegte
`isPaid`-Markierung. Diese fallbezogene Angabe ist weder ein allgemeiner
DyCoS-Zahlungsstatus noch ein Nachweis für Teilzahlungen und wird nicht auf
Transportauftragsbelege übertragen.

Im DyCoS-Katalog sind `dbo.OffenePosten`, `dbo.OffenePosten_Archiv` und
`dbo.OffenePostenZahlungen` belegt. Bisher sind für diese Tabellen lediglich die
Namen bekannt; Spalten, Verknüpfungen, tatsächliche Pflege und Vollständigkeit
sind ungeprüft. Das ist ein Ansatz für einen begrenzten künftigen Lesetest,
keine bereits verfügbare Zahlungsanbindung. Ein nicht gefundener OP-Datensatz
belegt für sich allein keine Zahlung.

Für eine spätere Umsetzung zwei getrennte Merkmale führen:
- Belegstatus bzw. Belegart: Rechnung, Stornorechnung, stornierte Originalrechnung.
- Zahlungsstatus: unbekannt, offen, teilbezahlt, bezahlt, erst bei belastbarer
  Quelle für Zahlungen/offenen Betrag und eindeutiger Belegzuordnung.

Zahlungsdaten werden in diesem Schritt noch nicht gespeichert oder angezeigt;
insbesondere erhalten vorhandene Belege keinen erfundenen Standardstatus „offen“.
