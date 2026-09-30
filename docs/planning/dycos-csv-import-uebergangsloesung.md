# DyCoS CSV-Import – Übergangslösung

**Status dieses Dokuments:** Die als **verbindlich** bezeichneten Punkte sind für die Umsetzung festgelegt. **Offen** bezeichnet Punkte, die erst mit weiteren Daten oder Entscheidungen konkretisiert werden.

## 1. Ziel und Grundprinzip

**Verbindlich:** Zunächst werden DyCoS-CSV-Dateien für Kunden, Unternehmer und anschließend Transportaufträge importiert. Die Fachmodule dürfen nicht an CSV gebunden sein: Eine spätere Read-only-SQL-Schnittstelle ersetzt ausschließlich Datenquelle bzw. Importschicht, nicht die Fachlogik.

**Offen:** Es werden keine Annahmen über tatsächliche CSV-Spalten getroffen. Das verbindliche Feldmapping folgt erst nach Vorlage der Export-Kopfzeilen und anonymisierter Beispielzeilen.

## 2. Aktueller Bestand im Projekt

- **Verbindlicher Ist-Stand:** Kunden und Unternehmer liegen gemeinsam in der Firestore-Collection `businessPartners`. `debtorNumber` kennzeichnet den Kunden, `creditorNumber` den Unternehmer; sind beide befüllt, ist ein Partner Kunde und Unternehmer zugleich.
- Transportaufträge liegen inzwischen in `transportOrders` mit eigener Auftragsliste; importierte Kunden- und Unternehmerbezüge enthalten die ursprüngliche Firestore-Partner-ID.
- To-dos speichern technische Partnerbezüge (`customerId`/`carrierId`) samt Namen, technische Bezüge zu Schaden, Insolvenz, Gericht/Streit und Inkasso sowie die Freitext-TA-Referenz `reference`.
- Schäden speichern `claimantPartnerId` und `contractorPartnerId` samt Namen sowie `transportReference` als Freitext. Aus einem Schaden kann ein To-do mit diesen Werten vorausgefüllt werden.
- Insolvenzen sind über `partnerId` an genau einen `businessPartner` gebunden; der Insolvenzfall verwendet diesen Partner als Dokument-ID und speichert `partnerName` als Snapshot. Ein To-do kann technisch auf den Insolvenzfall verweisen.
- Gericht/Streit speichert die erforderliche `transportReference` nur als Freitext; es besteht derzeit keine technische Partner- oder TA-Verknüpfung. To-dos können technisch auf Gericht/Streit verweisen.
- Inkasso speichert `debtorPartnerId` mit Rolle und Schuldner-Snapshot. To-dos können technisch auf Inkasso verweisen.
- Haftbarhaltung ist heute ein nicht persistiertes Dokumentformular: Es enthält eine Freitext-Auftragsnummer und Adress-/Transportdaten, aber keinen technischen TA- oder Partnerbezug.
- **Nutzen einer echten TA-ID:** Sie ersetzt die Freitext-TA-Referenzen in To-dos, Schäden, Gericht/Streit und Haftbarhaltung durch stabile Verknüpfungen. Sie erlaubt außerdem, Kunde, Unternehmer und verfügbare Auftragsdaten dort konsistent vorzubelegen. Insolvenzen profitieren indirekt über den Partnerbezug und künftig aus einem TA heraus erzeugte To-dos/Fälle.

## 3. Verbindliche Identitäten

| Objekt | Eindeutiger DyCoS-Schlüssel | Regel |
|---|---|---|
| Kunde | Kundennummer, Nummernkreis ab 10000 | unveränderlich |
| Unternehmer | Unternehmernummer, Nummernkreis ab 70000 | unveränderlich |
| Transportauftrag | TA-Nummer, z. B. 260600123 | unveränderlich; Format JJMM + laufende Nummer |

- **Verbindlich:** Diese IDs sind externe fachliche Schlüssel; technische Drehpunkt-IDs bleiben davon getrennt.
- **Verbindlich:** Ein sichtbarer Partner kann mehrere Debitorennummern und/oder mehrere Unternehmer-/Kreditorennummern besitzen. Jede DyCoS-Nummer ist systemweit genau einem sichtbaren Partner zugeordnet.
- **Verbindlich:** Der Import sucht über sämtliche hinterlegten DyCoS-Referenzen eines Partners, nicht nur über eine mögliche Hauptnummer. Eine Nummer kann als Hauptnummer angezeigt werden; weitere Nummern bleiben nachvollziehbar als zusätzliche DyCoS-Referenzen erhalten.
- **Verbindlich:** Damit kann eine echte DyCoS-Dublette dauerhaft auf einem sichtbaren Stammdatenblatt geführt werden, ohne dass ein späterer Import erneut einen Partner anlegt.
- **Verbindlich:** Dieselbe USt-IdNr. bedeutet nicht automatisch denselben Partner. Niederlassungen bleiben auch bei gleicher USt-IdNr. eigenständige Partnerdatensätze, wenn Ansprechpartner, Abrechnung oder weitere Daten vollständig abweichen. Die USt-IdNr. ist ausschließlich ein Hinweis auf eine mögliche Dublette.

## 4. Importregeln für Stammdaten

- **Verbindlich:** Der Import legt Datensätze neu an oder ergänzt sie, löscht aber niemals Datensätze.
- **Verbindlich:** Nur leere Drehpunkt-Felder dürfen automatisch aus DyCoS befüllt werden. Bereits befüllte Felder werden niemals automatisch überschrieben.
- **Verbindlich:** Jede Abweichung ist prüfpflichtig, auch bei Leerzeichen- oder Schreibweisenabweichungen. Es gibt keine stillschweigende Normalisierung oder Gleichsetzung.
- **Verbindlich:** Im Stammdatenblatt weist „Neue Daten“ auf Abweichungen hin. Ein Klick öffnet ein Modal mit externer ID und Firmenname im Titel, bestehendem Wert links und neuem DyCoS-Wert rechts. Es zeigt nur tatsächlich abweichende Felder; Berechtigte können einzelne oder alle Änderungen übernehmen oder verwerfen.
- **Verbindlich:** Der produktive Kundenimport führt die Status `Neu`, `Ergänzt`, `Unverändert`, `Prüfung erforderlich` und `Fehlerhaft`. Sichere Werte werden direkt übernommen; abweichende Stammdaten, ungewöhnliche Werte und Fehler bleiben als dauerhafte Prüfzeile erhalten. Eine nicht auflösbare Kreditorenreferenz allein ist kein Prüfgrund.

### Kunden-CSV (produktive Variante)

- **Verbindlich:** Kunden werden ausschließlich über `Kunden- nummer` bzw. bereits hinterlegte DyCoS-Debitorenreferenzen identifiziert. Firmenname, USt-IdNr., Anschrift oder E-Mail lösen niemals eine automatische Zusammenführung aus.
- **Verbindlich:** Die CSV wird lokal als UTF-8-CSV mit Semikolon oder Komma, BOM und korrekt gequoteten Feldern geprüft. Überschriften werden robust gegen Leerzeichen, Zeilenumbrüche und Schreibweisen wie `Kunden- nummer` gelesen.
- **Verbindlich:** `Firma`, Anschrift, Sprache, UStID, Steuernummer, Internet, Zahlungsbedingung, `Erfasst am DyCoS`, die Gutschrift-Kennzeichnung und bis zu drei Ansprechpartner werden nur auf sichere, bisher leere Felder übertragen. `Erfasst am DyCoS` ist ein externer Fachwert und ersetzt nie `createdAt`.
- **Verbindlich:** Die DyCoS-`Zahlungsbedingung` wird als vollständiger Text in das Partnerfeld `Zahlungsziel` übernommen; eine Tageszahl wird nicht mehr extrahiert. Der Rohwert bleibt zusätzlich in der Importherkunft erhalten. Ein Text ohne Tageszahl ist allein kein Prüfgrund.
- **Verbindlich:** In Kontaktspalten falsch abgelegte E-Mail- oder Webwerte werden als Kandidaten erkannt; die unveränderten Rohwerte bleiben nachvollziehbar. Ein Kontakt ohne Namen ist als allgemeiner Kontakt zulässig. Re-Importe nutzen die technische Kontakt-ID bzw. die E-Mail, damit keine Dublette entsteht.
- **Verbindlich:** Ein Stammdatenblatt ist ein Partner: eine Debitorennummer bzw. Debitorenreferenz gibt ihm die Rolle Kunde, eine Kreditorennummer bzw. Kreditorenreferenz die Rolle Unternehmer. Beide Rollen können auf demselben Partner gleichzeitig bestehen; Debitoren und Kreditoren werden getrennt gesucht und geführt.
- **Verbindlich:** `zugeordneter Unternehmer` enthält eine Kreditorennummer und wird ausschließlich gegen Kreditorennummern oder Kreditorenreferenzen aller Partner-Stammdatenblätter aufgelöst. Ein Treffer wird immer über dessen Firestore-Partner-ID verknüpft, auch wenn derselbe Partner zugleich Kunde ist. Ohne Treffer wird der Kunde dennoch angelegt bzw. ergänzt und die offene Referenz mit leerer Partner-ID gespeichert; es wird kein namenloser Unternehmer angelegt. Eine manuelle Kundenübernahme wird damit als „geprüft übernommen“ abgeschlossen. Ein späterer Unternehmerimport oder Kunden-Re-Import ergänzt die Verbindung sicher, sobald die Kreditorennummer vorhanden ist.
- **Verbindlich:** Vorschau, kontrollierte Übernahme und Importlauf sind ausschließlich serverseitig durch `dataImports: edit` abgesichert. Jede Anlage oder Ergänzung erhält Quelle, Datei, Nutzer, Zeitpunkt und Historieneintrag.
- **Verbindlich:** Für den Kundenimport gilt zusätzlich eine gemeinsame, dauerhafte Abarbeitungsliste. Sie ist nur mit `dataImports: edit` und `masterData: edit` sichtbar und bearbeitbar; Superadmins folgen dem bestehenden Vollzugriff. Sichere Zeilen werden direkt als „automatisch übernommen“ protokolliert. Jede offene Zeile speichert Vergleichswerte, Gründe und Importherkunft; eine geprüfte Übernahme protokolliert Nutzer, Zeitpunkt, Ausgangswerte und tatsächlich übernommene Werte. Eine zeitlich begrenzte Prüfreservierung verhindert parallele Bearbeitung, der Abschluss wird zusätzlich serverseitig transaktional gegen Doppelentscheidungen abgesichert.

## 5. Ansprechpartner

- **Verbindlich:** Ansprechpartner können aus Stamm- und Transportauftragsimporten stammen.
- **Verbindlich:** Innerhalb eines Partnerdatensatzes darf eine E-Mail-Adresse nur einmal angelegt werden. Die E-Mail-Adresse ist der einzige technische Dublettenprüfschlüssel.
- **Verbindlich:** Gleiche E-Mail verwendet den vorhandenen Ansprechpartner; leere Felder dürfen ergänzt werden.
- **Verbindlich:** Abweichungen bei Name, Abteilung, Telefon usw. erzeugen keine dauerhafte Prüfung und bleiben jederzeit manuell änderbar. Es gibt keine automatische Namens-zu-E-Mail- oder sonstige Kontaktzuordnung.

## 6. Transportaufträge

- **Verbindlich:** Ein TA wird nur angelegt, wenn Kunde und Unternehmer aus DyCoS enthalten sind. Nicht disponierte Aufträge ohne Unternehmer werden nicht importiert.
- **Verbindlich:** `KundenNr.` ist die unveränderliche DyCoS-Debitorennummer. Der TA-Import sucht sie sowohl als Haupt-Debitorennummer als auch in gültigen zusätzlichen DyCoS-Referenzen. Fehlt der Partner, wird beim bewussten Import ein Kunden-Stammdatenblatt angelegt, sofort verknüpft und mit Debitorennummer, `FZ Name`, FZ-Anschrift und Standard-E-Mailadresse Frachtzahler befüllt. Bestehende Stammdaten werden nie überschrieben; nur eindeutig leere Felder dürfen ergänzt werden.
- **Verbindlich:** Unternehmer werden zuerst über die 100/95/60%-Namensmatchinglogik gesucht. Nur ein eindeutiger 100%-Treffer wird direkt verknüpft. Bei 95%- oder etwa 60%-Kandidaten entscheidet der Importeur in der Vorschau bewusst zwischen vorhandenem Unternehmer und bestätigter Neuanlage. Ohne brauchbaren Treffer wird beim bewussten Import ein Unternehmer-Stammdatenblatt mit Firmenname und Standard-E-Mailadresse UTN angelegt; eine Kreditorennummer wird niemals erfunden.
- **Verbindlich:** Jede aus einem TA-Import erzeugte Partneranlage dokumentiert Quelle, TA-Nummer, Importlauf und Zeitpunkt. Ein späterer Re-Import verbindet vorhandene Partner automatisch und legt keine Dublette an.
- **Verbindlich:** TA-Kunde und TA-Unternehmer speichern ausschließlich die echte Firestore-Dokument-ID (`partnerId`) des bei der Anlage fachlich verknüpften Partnerdatensatzes. Nach einem Merge bleibt diese ursprüngliche ID im TA erhalten; die aktuelle Anzeige löst sie über die flache Weiterleitung auf. Bei einer kontrollierten Neuanlage werden Partner, Historie und TA-Verknüpfung gemeinsam geschrieben. Ein sicherer Re-Import darf einen fehlenden oder fehlerhaften technischen Link nur dann auf die dokumentierte Importanlage reparieren, wenn deren Importherkunft eindeutig dieselbe TA belegt.
- **Verbindlich:** Ein aus dem TA-Import angelegter Unternehmer ohne Kreditorennummer führt die fehlende Pflichtinformation, Quelle, TA-Nummer, Importlauf und Zeitpunkt ausdrücklich als Importstatus. Die technische Firestore-Partner-ID bleibt trotzdem eine gültige Verknüpfung. Der Hinweis endet erst mit einer echten Kreditorennummer oder einer fachlichen Zusammenführung; die normale manuelle Partneranlage behält ihre Pflichtlogik.
- **Verbindlich:** In der ersten Ausbaustufe werden genau eine Ladestelle (erste aus DyCoS) und eine Entladestelle (letzte aus DyCoS) abgebildet.
- **Offen:** Mehrstopp-Transporte folgen erst bei zuverlässig verfügbarer Datenquelle, voraussichtlich über die spätere SQL-Schnittstelle.
- **Verbindlich:** Änderungen an einem bereits importierten TA werden nicht blind überschrieben, sondern als prüfbarer neuer Stand vorgemerkt; der bisherige Stand bleibt nachvollziehbar.

## 7. Partner-Dubletten und manuelle Zusammenführung

### Kontrollierte Trennung einer Zusammenführung

- Neue Zusammenführungen verwenden ein serverseitiges Protokoll `partnerMergeOperations` mit `schemaVersion: 2`, eindeutiger Merge-ID, Bearbeiter/Zeitpunkt, vollständigem Quell-Snapshot, eigenständig zugeordneten Nummern, Zielwerten vorher/nachher und allen abgeflachten Weiterleitungen. Es werden **keine fachlichen Partnerreferenzen in Aufträgen, Fällen, To-dos, Paletten oder Importzeilen automatisch umgeschrieben**; CRM- und Insolvenzdaten bleiben an ihrem Ursprungsdokument und werden nicht mehr kopiert. Frühere Protokolle der Version 1 bleiben ausschließlich für ihre sichere Altfall-Rückabwicklung lesbar.
- Flaches Weiterleitungsmodell: Jeder archivierte Partner zeigt mit `mergedIntoPartnerId` unmittelbar auf genau einen nicht archivierten Hauptpartner. Wird ein Hauptpartner mit eigenem Cluster zusammengeführt, werden alle bisherigen Mitglieder atomar direkt auf den neuen Hauptpartner gesetzt. Zyklen, Selbstverweise, fehlende Ziele und Ketten werden bei der Auflösung abgewiesen. Für Cluster oberhalb der sicheren Firestore-Batch-Grenze wird der Merge vor jeder Änderung abgelehnt; es bleibt kein teilweise umgeleiteter Cluster zurück.
- Die technischen IDs in Fachobjekten bleiben deren historische Ursprungsreferenz. Anzeige, Navigation und Listenabfragen lösen diese IDs über den aktiven Cluster auf; ein aus einem Schaden, TA oder Fall erzeugtes To-do behält zusätzlich dessen unveränderte Fall-/Auftragsreferenz. Neue unabhängige Objekte am aktiven Hauptpartner verwenden dessen ID. Der zentral dokumentierte Katalog in `functions/partnerCluster.js` (Web-Re-Export über `src/lib/partnerCluster.js`) führt die tatsächlichen Partner- und Ursprungsfelder je Collection.
- Eine Trennung der Version 2 entfernt nur die Weiterleitung des ausgewählten Quellpartners, stellt dessen ursprünglichen Status (etwa „Insolvenz“) wieder her und gibt nur dessen eigene Debitoren-/Kreditorennummern zurück. Andere zuvor zu seinem Cluster gehörende Mitglieder bleiben direkt am bisherigen aktiven Hauptpartner; Fall-/Auftrags-/To-do-Referenzen werden nicht bewegt. Die serverseitige Vorschau verwendet eine Prüfsumme; parallel geänderte Daten erzwingen eine neue Vorschau. Später geänderte Stammdatenwerte bleiben erhalten und werden als Warnung/Historieneintrag ausgewiesen.
- Beide Partner und das Merge-Protokoll erhalten nachvollziehbare Historieneinträge mit Bearbeiter, Zeitpunkt und Ergebnis. Die vorhandene Berechtigung „Partner zusammenführen“ gilt auch für Vorschau und Trennung; Superadmins bleiben berechtigt.
- Bestandsdaten aus dem früheren Protokoll `schemaVersion: 1` können bereits physisch umgeschriebene Fachreferenzen oder Weiterleitungsketten enthalten. Die neue Logik ändert diese Altfälle nicht stillschweigend: Vor einer produktiven Aussage über den gesamten Datenbestand sind eine lesende Inventur und gegebenenfalls eine gesondert freigegebene, protokollierte Altfallbereinigung erforderlich. Emulatorprüfungen allein belegen die Invariante für neue und im Test bearbeitete Cluster, nicht den unveränderten Firebase-Dev-Bestand.
- Gericht/Streit besitzt derzeit keine technische Partner-ID und nur eine Freitext-TA-Referenz; Kalenderereignisse besitzen keinen Partner-/Fallbezug. Diese Felder lassen sich daher nicht als Partnerweiterleitung testen. Fallbezogene To-dos behalten dagegen ihre `legalDisputeId`, `damageCaseId`, `insolvencyId` bzw. `inkassoCaseId`.

- **Verbindlich:** Es gibt keine automatische Partner-Zusammenführung. Eine gleiche USt-IdNr. erzeugt nur „Mögliche Dublette“.
- **Verbindlich:** Liefert ein Kunden- oder Unternehmerimport eine Debitoren- und Kreditorennummer, die auf zwei getrennten Partnern liegen, ist dies eine eigene Prüfzeile „Zusammenführung erforderlich“. Die Gegen-ID gehört fachlich zum selben Partner; sie wird nicht als externer Unternehmer-Verweis verknüpft. Der Bearbeiter wählt bewusst den Zielpartner.
- **Verbindlich:** Nur Nutzer mit der eigenen Berechtigung „Partner zusammenführen“ sowie Superadmins dürfen die serverseitige Zusammenführung ausführen. Der Zielpartner erhält alle eindeutigen Debitoren- und Kreditorennummern sowie sichere Ergänzungen von Adresse und Kontakten. Der Quellpartner bleibt als „zusammengeführt mit …“ erhalten, wird aus der normalen Liste ausgeblendet und nicht mehr bearbeitet. Fachobjekte behalten ihre ursprüngliche gespeicherte Partner-ID; ihre wirksame Anzeige wird über die flache Weiterleitung aufgelöst. Beide Seiten erhalten unveränderbare Historieneinträge.
- **Verbindlich:** Die Merge-/Trennaktion selbst erfordert das gesonderte Recht „Partner zusammenführen“ oder Superadmin; für Import-Prüfzeilen gelten zusätzlich die jeweiligen Import- und Stammdatenrechte.
- **Verbindlich:** Die Ansicht zeigt alle Treffer mit Firmenname, Debitor/Kreditor und Anschrift. Der Zusammenführungsdialog unterscheidet klar zwischen „identischer Partner“ und „eigenständige Niederlassung“.
- **Verbindlich:** Bei „Als identischen Partner verschmelzen“ werden übernommene Debitoren- und Unternehmernummern dem Zielpartner als DyCoS-Referenzen zugeordnet. Ansprechpartner werden anhand ihrer E-Mail-Adresse zusammengeführt.
- **Verbindlich:** Bestehende Verknüpfungen in To-dos, Schäden, Inkasso, Paletten, Transportaufträgen und Importzeilen werden nicht umgehängt; die aktive Partneridentität wird beim Lesen aus dem Cluster ermittelt.
- **Verbindlich:** Der Quellpartner wird nicht gelöscht, sondern als „zusammengeführt mit …“ archiviert und regulär nicht mehr angezeigt. Alte Aufrufe bleiben nachvollziehbar und führen auf den Zielpartner.
- **Verbindlich:** Die Zusammenführung erhält eine unveränderbare Historie mit Zeitpunkt, ausführendem Nutzer, Quelle, Ziel, übernommenen IDs und wesentlichen Datenentscheidungen.

### Partnerverbünde

- **Verbindlich:** Eigenständige Niederlassungen bleiben immer separate Partnerdatensätze, auch bei gleicher USt-IdNr. Sie können vollständig unterschiedliche Ansprechpartner, Abrechnung, Konditionen und DyCoS-Nummern besitzen.
- **Verbindlich:** Statt einer Verschmelzung kann ein Nutzer manuell einen neuen Verbund, etwa „DHL“, anlegen oder einen Partner einem bestehenden Verbund hinzufügen. Ein Verbund kann beliebig viele eigenständige Partner enthalten.
- **Verbindlich:** Ein Verbund ist keine Dubletten- oder Importlogik und löst keine automatische Zusammenführung aus. Es gibt keine automatische Verbundzuordnung über USt-IdNr., Firmenname, Anschrift oder E-Mail.

## 8. Berechtigungen

**Zielrechte – verbindlich:**

| Rolle/Recht | Berechtigung |
|---|---|
| Superadmin | alles |
| Datenimporteur | Importdateien hochladen; Vorschau und Validierung ausführen; Stammdaten- und TA-Änderungen übernehmen oder verwerfen; Partner zusammenführen |
| Eigenes Recht „Partner zusammenführen“ | für ausgewählte Nutzer, z. B. Buchhaltung, Service, Versicherung oder Schäden; unabhängig von Importberechtigung |
| Nutzer ohne Freigaberecht | Änderungen sehen, aber nicht übernehmen oder verwerfen |

**Transportaufträge – verbindlich:**

- DyCoS liefert in `Relation` Werte wie `02 Struck Torben`. Der führende Relationscode (`02`) ist der stabile technische Schlüssel, der Name nur die lesbare Bezeichnung.
- Der TA speichert Relationscode und Relationsbezeichnung als Import-Snapshot.
- Im Adminbereich erhält jeder Nutzer eine Mehrfachauswahl freigegebener DyCoS-Relationen. Eine TA-Relation darf mehreren Nutzern zugeordnet sein, etwa für Team oder Vertretung.
- Passt die TA-Relation zu einer Freigabe, darf der Nutzer nur Änderungen dieses Auftrags übernehmen. Datenimporteure und Superadmins dürfen unabhängig von der Relation übernehmen.
- Seltene echte Änderungen eines Relationscodes werden bewusst in der Admin-Zuordnung gepflegt.

## 9. Verknüpfungskonzept Transportauftrag

**Ziel – verbindlich:** Ein echter Transportauftrag wird über eine stabile TA-ID mit To-dos, Schäden, Insolvenzen, Gericht/Streit, Inkasso und Haftbarhaltung verknüpft.

- Aus einem TA heraus sollen später „To-do hinzufügen“, „Schadenfall anlegen“ und „Haftbarhaltung an Unternehmer“ möglich sein.
- Kunde, Unternehmer und verfügbare TA-Daten werden dabei vorausgefüllt.
- Die heute vorhandenen Freitext-TA-Referenzen bleiben bis zur Einführung der echten TA-Verknüpfung zu berücksichtigen.

## 10. Geplanter Importablauf

1. CSV auswählen.
2. Struktur prüfen.
3. Vorschau und Validierung erzeugen.
4. Fehlerliste und Status je Zeile anzeigen.
5. Bewusste Übernahme durch berechtigten Nutzer.
6. Protokoll mit Zeitpunkt, Nutzer, Quelle und Ergebnis führen.
7. Differenzen im jeweiligen Stammdaten- oder Transportauftragskontext prüfen.
8. Niemals automatisch löschen.

## 11. Offene Punkte und nächste Schritte

1. Unternehmer-Export: Kopfzeile und anonymisierte Beispielzeilen prüfen; danach verbindliches Feldmapping.
2. Transportauftrag-Export: ebenso.
4. Finales Datenmodell der Transportliste und der TA-Versionen.
5. Konkrete Statusdefinitionen für `Unverändert` und `Fehlerhaft`.
6. Technisches Detailmodell für zusätzliche DyCoS-Referenzen, Archiv-Weiterleitung nach einer Zusammenführung und die unveränderbare Zusammenführungshistorie.
7. Technisches Modell und Verwaltungsoberfläche für Partnerverbünde; die manuelle, nicht automatische Zuordnung bleibt verbindlich.
8. Spätere SQL-Schnittstelle: CSV-Datenquelle austauschen, Fachmodule unverändert lassen.

## 12. Produktiver Transportauftragsimport aus DyCoS-CSV

**Verbindlich:** Der erste produktive TA-Import nutzt DyCoS-CSV-Dateien. Er bildet nur die erste Ladestelle und letzte Entladestelle ab; Zwischenstopps sind im aktuellen Export bewusst nicht verfügbar. CSV wird als UTF-8 (mit oder ohne BOM), Semikolon- oder Komma-CSV verarbeitet; eine leere erste Excel-Exportspalte wird ignoriert. `Nummer` bleibt immer Text, damit etwa `260400210` unverändert bleibt. `Auftragzeit von` und `Auftragzeit bis` werden, falls vorhanden, ausdrücklich ignoriert.

DyCoS liefert im Produktivexport weder Transportstatus noch Statuszeit. Status, Ereignisse, Handlungsempfehlungen und Zeitverlauf entstehen später ausschließlich im Drehpunkt-Modul Sendungsverfolgung.

| CSV-Spalte | Bedeutung / Ziel |
|---|---|
| `Nummer` | Unveränderliche externe DyCoS-Transportauftragsnummer; zentrale Import-ID |
| `Relation` | Hinterlegte Mitarbeiterrelation; zunächst original speichern |
| `Unternehmer` | Unternehmername aus DyCoS; zunächst Importwert, spätere Zuordnung über die separat geplante 100/95/60%-Regel |
| `Ref.Nr` | Kundenreferenznummer zur Zuordnung im Kunden-TMS und Abrechnung |
| `Ladestellenort`, `Ladestelle` | Strukturierter Ort und vollständiger Originaltext der ersten Ladestelle |
| `Entladestellenort`, `Entladestelle` | Strukturierter Ort und vollständiger Originaltext der letzten Entladestelle |
| `Ankunft (Plan) 1.LD`, `Slot (Plan) 1.LD` | Beginn und Ende des Zeitfensters der ersten Ladestelle |
| `Ankunft (Plan) letzte ED`, `Slot (Plan) letzte ED` | Beginn und Ende des Zeitfensters der letzten Entladestelle |
| `Kosten`, `Ertrag` | Netto-Kosten bzw. Netto-Ertrag in EUR |
| `LKW-Kennz.` | Kennzeichen; ein einzelner Punkt `.` bedeutet nicht hinterlegt |
| `Gewicht`, `LDM`, `Fahrzeugart`, `Kolli` | Gewicht in kg, Lademeter, Fahrzeugart und Anzahl Packstücke |
| `Info-1`, `Im Auftrag` | Freie, manuelle und nur auftragsbezogene Kontaktfelder des Unternehmers bzw. Kunden |
| `KundenNr.` | Unveränderliche Debitorennummer des Frachtzahlers; Grundlage der Kundenverknüpfung |
| `Bemerkung 1.LD`, `Bemerkung letzte ED` | Operative Bemerkungen zur ersten Ladestelle bzw. letzten Entladestelle |
| `FZ Name`, `FZ Land`, `FZ PLZ`, `FZ Ort`, `FZ Strasse` | Frachtzahler-/Kunden-Snapshot zum Auftrag |
| `L/E Referenz erste LD`, `L/E Referenz letzte ED` | Zusätzliche operative Referenzen zur ersten Ladestelle bzw. letzten Entladestelle |
| `Mailversanddatum der TA`, `Mail TA zuletzt versendet an` | Letzter dokumentierter Versandzeitpunkt und Empfänger des Transportauftrags |
| `Standard E-Mailadresse Frachtzahler`, `Standard E-Mailadresse UTN` | Verlässliche, stammdatenbezogene Importnachweise für Kunde bzw. Unternehmer |

- **Verbindlich:** Ein Slot mit nur Uhrzeit übernimmt das Datum der zugehörigen Ankunft; ein vollständiger Slot-Zeitpunkt bleibt unverändert. So wird aus `10.09.2026 07:00` und `14:00` ein Zeitfenster von `10.09.2026 07:00` bis `10.09.2026 14:00`.
- **Verbindlich:** `Info-1` und `Im Auftrag` werden unverändert gespeichert, nicht als E-Mail validiert oder zusammengeführt und niemals in Stammdaten zurückgeschrieben. Die beiden Standard-E-Mailadressen dürfen ebenso keine Stammdaten überschreiben; bei späterer Partnerverknüpfung kann die Oberfläche die aktuelle Stammdatenadresse zusätzlich zeigen, der CSV-Wert bleibt Importnachweis.
- **Verbindlich:** Kunden werden ausschließlich über `KundenNr.` und die DyCoS-Referenzlogik verknüpft. Fehlende Kunden sind kein Prüfungsfall: Die Vorschau kündigt die kontrollierte Neuanlage an. Unternehmernamen verwenden die 100/95/60%-Logik: Nur echte Kandidaten sind „Prüfung erforderlich“ und erfordern eine bewusste Auswahl oder bestätigte Neuanlage.
- **Verbindlich:** `Info-1` und `Im Auftrag` bleiben ausschließlich freie, auftragsbezogene Felder. Sie werden niemals zu Ansprechpartnern oder anderen Stammdaten. Ausschließlich die beiden Standard-E-Mailadressen sind sichere Importwerte; auch sie ergänzen nur leere Stammdatenfelder.
- **Verbindlich:** Ein TA-Import schreibt Partner ausschließlich serverseitig unter `dataImports: edit`. Ein Re-Import derselben TA-Nummer aktualisiert nur den externen TA-Snapshot und ergänzt eine inzwischen mögliche Partnerverknüpfung. Manuelle Daten, Sendungsverfolgung sowie spätere Fall- und To-do-Verknüpfungen bleiben erhalten. Jeder Importlauf wird mit Nutzer, Zeitpunkt, Dateiname, Ergebnis und Zeilenfehlern protokolliert.
- **Verbindlich:** Der Transportauftragslink verweist bei Kunde und Unternehmer ausschließlich über die technische Firestore-Partner-ID. Für einen aus TA-Import angelegten Unternehmer ohne Kreditorennummer zeigt das Partner-Stammdatenblatt einen nicht wegklickbaren Hinweis; im TA erscheint direkt am verlinkten Unternehmer ein zugängliches gelbes Warnzeichen.

## 13. Produktiver Unternehmer-/Kreditorenimport

Der Unternehmerimport ist ein eigener DyCoS-CSV-Ablauf mit eigenen Importläufen (`carrierImportRuns`) und dauerhaften Prüfzeilen (`carrierImportRows`). Die gemeinsame Oberfläche und Übernahmeregeln entsprechen dem Kundenimport, ohne dessen Zeilen oder Ergebnisse zu vermischen. Import und Prüfung erfordern gleichzeitig `dataImports: edit` und `masterData: edit`; eine Zusammenführung erfordert zusätzlich `partnerMerges: edit`.

- `UTN/Lief.Nummer` ist die verpflichtende, unveränderliche Kreditorenidentität. `zugeordn. Kunde` ist optional und bezeichnet eine Debitorennummer **desselben** Partners. Beide werden ausschließlich als getrimmter Text verglichen; Firmenname, USt-ID, E-Mail, Adresse und Ähnlichkeit sind nie automatische Identitäten. Die TA-Namenssuche bleibt ausschließlich beim TA-Import.
- Exakter Kreditorentreffer aktualisiert nur diesen Partner. Fehlt er, kann eine exakt vorhandene Gegen-Debitorennummer denselben Partner ergänzen. Sind beide unbekannt, entsteht ein neuer Unternehmer. Führen beide Nummern zu unterschiedlichen aktiven Partnern, entsteht eine dauerhafte Zeile „Zusammenführung erforderlich“; zusammengeführt wird nur bewusst über die bestehende Merge-Funktion. Archivierte Nummern werden zum aktiven Zielpartner weitergeleitet.
- `Unternehmer`, `Strasse`, `PLZ`, `Ort`, `Land`, `USTID`, `Steuernummer`, `Internet`, die drei Ansprechpartner mit Abteilung/Telefon/Handy/Mail, `Zahlungsbedingung-1`, `IBAN`, `BIC`, `IBAN geprüft Datum`, `Erfasst am` und `TimoCom-Nr` werden in die entsprechenden Partnerfelder übernommen. `Internet` ist nur mit `www.`, `http://` oder `https://` eine Website; ein `@` wird als E-Mail interpretiert. Aus `Infos` werden ausschließlich E-Mail-Adressen als namenlose Kontakte extrahiert; sonstiger Text wird ignoriert. E-Mails werden normalisiert und dedupliziert. Nur `Zahlungsbedingung-1` wird als vollständiger Text für `Zahlungsziel` verwendet; die zweite Zahlungsbedingung bleibt unberücksichtigt.
- Nur neue Partner, identische Werte und Ergänzungen leerer Felder werden automatisch geschrieben. Abweichende gefüllte Werte bleiben in der gemeinsamen Unternehmer-Prüfwarteschlange; Übernahme erfolgt einzeln mit serverseitigem Vergleich, Reservierung und Historie. Aktueller Import und dauerhafter Importverlauf zeigen den tatsächlich betroffenen Partner und Zuordnungsweg. Keine automatische Löschung oder Zusammenführung.
- Nach einer bewusst ausgeführten Zusammenführung werden sichere zusätzliche Werte der auslösenden CSV-Zeile im selben serverseitigen Vorgang ergänzt. Bleiben abweichende gefüllte CSV-Werte, wechselt dieselbe Prüfzeile zur normalen Feldprüfung; sie gilt erst danach als übernommen. Die Merge- und Importentscheidungen bleiben getrennt nachvollziehbar.
