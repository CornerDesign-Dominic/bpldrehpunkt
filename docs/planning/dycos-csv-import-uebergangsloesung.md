# DyCoS CSV-Import – Übergangslösung

Stand: 28.10.2026. Dieses Dokument führt die fachlichen CSV-Datenverträge und
die verbleibende Planung. Kunden-, Unternehmer- und Transportauftragsimport
sowie Partnerzusammenführung sind implementiert. Eine spätere SQL-Datenquelle
und Mehrstopp-Unterstützung sind keine bereits freigegebenen Funktionen.

**Status dieses Dokuments:** Die als **verbindlich** bezeichneten Punkte sind für die Umsetzung festgelegt. **Offen** bezeichnet Punkte, die erst mit weiteren Daten oder Entscheidungen konkretisiert werden.

## 1. Ziel und Grundprinzip

**Verbindlich:** Zunächst werden DyCoS-CSV-Dateien für Kunden, Unternehmer und anschließend Transportaufträge importiert. Die Fachmodule dürfen nicht an CSV gebunden sein: Eine spätere Read-only-SQL-Schnittstelle ersetzt ausschließlich Datenquelle bzw. Importschicht, nicht die Fachlogik.

**Vorhanden:** Die produktiven Feldmappings sind in den Kunden-CSV-Regeln sowie den Abschnitten 12 und 13 dokumentiert. Zusätzliche Exportvarianten werden erst nach Prüfung ihrer Kopfzeilen und anonymisierter Beispiele unterstützt.

## 2. Aktueller Bestand im Projekt

- **Verbindlicher Ist-Stand:** Kunden und Unternehmer liegen gemeinsam in der Firestore-Collection `businessPartners`. `debtorNumber` kennzeichnet den Kunden, `creditorNumber` den Unternehmer; sind beide befüllt, ist ein Partner Kunde und Unternehmer zugleich.
- Transportaufträge liegen inzwischen in `transportOrders` mit eigener Auftragsliste; importierte Kunden- und Unternehmerbezüge enthalten die ursprüngliche Firestore-Partner-ID.
- To-dos speichern technische Partnerbezüge (`customerId`/`carrierId`) samt Namen, technische Bezüge zu Schaden, Insolvenz, Gericht/Streit und Inkasso sowie die Freitext-TA-Referenz `reference`.
- Schäden speichern `claimantPartnerId` und `contractorPartnerId` samt Namen sowie `transportReference` als Freitext. Aus einem Schaden kann ein To-do mit diesen Werten vorausgefüllt werden.
- Insolvenzen sind über `partnerId` an genau einen `businessPartner` gebunden; der Insolvenzfall verwendet diesen Partner als Dokument-ID und speichert `partnerName` als Snapshot. Ein To-do kann technisch auf den Insolvenzfall verweisen.
- Gericht/Streit behält `transportReference` als Freitext und unterstützt zusätzlich eine bewusst gewählte Gegenseite über `counterpartyPartnerId`/`counterpartyPartnerRole`; Altakten ohne ID bleiben Freitext. Technische TA-Verknüpfungen liegen zusätzlich in `caseTransportOrderLinks`; To-dos können auf Gericht/Streit verweisen.
- Inkasso speichert `debtorPartnerId` mit Rolle und Schuldner-Snapshot. To-dos können technisch auf Inkasso verweisen.
- Haftbarhaltung ist heute ein nicht persistiertes Dokumentformular: Es enthält eine Freitext-Auftragsnummer und Adress-/Transportdaten, aber keinen technischen TA- oder Partnerbezug.
- **Nutzen einer echten TA-ID:** Sie ergänzt Freitext-TA-Referenzen durch stabile Verknüpfungen und erlaubt, Kunde, Unternehmer und verfügbare Auftragsdaten konsistent vorzubelegen. Insolvenzen können mehrere Transportaufträge referenzieren und aus einem TA heraus verknüpft oder neu angelegt werden. Haftbarhaltung besitzt weiterhin keine persistierte technische Verknüpfung.

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
- Gericht/Streit unterstützt optionale technische Partner-IDs; seine Freitext-TA-Referenz bleibt von technischen Einträgen in `caseTransportOrderLinks` getrennt. Freie Kalenderereignisse besitzen keinen Partner-/Fallbezug; projizierte Fall-/To-do-Fristen besitzen technische Zielreferenzen. Fallbezogene To-dos behalten ihre `legalDisputeId`, `damageCaseId`, `insolvencyId` bzw. `inkassoCaseId`.

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

**Vorhanden:** To-dos können mehrere Aufträge verknüpfen. Schäden, Inkasso, Gericht/Streit und Insolvenzen werden über `caseTransportOrderLinks` mit Aufträgen verbunden; diese Falltypen sind in `shared/caseTransportLinks.js` registriert.

- Aus der Auftragsdetailseite können berechtigte Nutzer To-dos sowie die unterstützten Falltypen mit vorausgefüllten Daten anlegen.
- Bestehende Freitextreferenzen bleiben zusätzlich erhalten; sie sind keine technische Identität.
- **Verbleibende Grenze:** Haftbarhaltung ist nicht als Falltyp in `caseTransportOrderLinks` registriert und bleibt ein eigenes Dokumentformular ohne persistierte technische TA-Verknüpfung. Die Insolvenz-Mehrfachverknüpfung ist lokal implementiert; Prüf- und Veröffentlichungsstand siehe [Verknüpfungsprüfung](../operations/case-link-review.md).

## 10. Vorhandener Importablauf

1. CSV auswählen.
2. Struktur prüfen.
3. Vorschau und Validierung erzeugen.
4. Fehlerliste und Status je Zeile anzeigen.
5. Bewusste Übernahme durch berechtigten Nutzer.
6. Protokoll mit Zeitpunkt, Nutzer, Quelle und Ergebnis führen.
7. Differenzen im jeweiligen Stammdaten- oder Transportauftragskontext prüfen.
8. Niemals automatisch löschen.

## 11. Umsetzungsstand und verbleibende Planung

Implementiert sind die Kunden-/Unternehmer-Feldmappings, die Auftragsliste mit
Importvergleich, Importstatus und Prüfwarteschlangen, zusätzliche DyCoS-Referenzen
sowie Merge-v2-Protokolle und kontrollierte Trennung. Deren Regeln stehen in
diesem Dokument und im jeweiligen Import-/Merge-Code; sie sind keine offenen
Grundsatzentscheidungen mehr.

Verbleibende Planung, ohne neue Releasezusage:

1. Eine spätere Read-only-SQL-Datenquelle über einen geprüften Datenvertrag anbinden; die Fachmodule nicht an deren Transporttechnik koppeln.
2. Mehrstopp-Transporte erst bei belastbarer Datenquelle und geklärtem Datenmodell ergänzen.
3. Partnerverbünde als eigenständige fachliche Erweiterung behandeln; keine automatische Zusammenführung daraus ableiten.
4. Weitere Fall-/Dokumentverknüpfungen nur gezielt mit Berechtigungen, Speicherung und Historie ergänzen.

## 12. Produktiver Transportauftragsimport aus DyCoS-CSV

**Verbindlich:** Der erste produktive TA-Import nutzt DyCoS-CSV-Dateien. Er bildet nur die erste Ladestelle und letzte Entladestelle ab; Zwischenstopps sind im aktuellen Export bewusst nicht verfügbar. CSV wird als UTF-8 (mit oder ohne BOM), Semikolon- oder Komma-CSV verarbeitet; eine leere erste Excel-Exportspalte wird ignoriert. `Nummer` bleibt immer Text, damit etwa `260400210` unverändert bleibt. `Auftragzeit von` und `Auftragzeit bis` werden, falls vorhanden, ausdrücklich ignoriert.

DyCoS liefert im Produktivexport weder Transportstatus noch Statuszeit. Status, Ereignisse, Handlungsempfehlungen und Zeitverlauf entstehen im separaten Drehpunkt-Modul Sendungsverfolgung.

| CSV-Spalte | Bedeutung / Ziel |
|---|---|
| `Nummer` | Unveränderliche externe DyCoS-Transportauftragsnummer; zentrale Import-ID |
| `Relation` | Hinterlegte Mitarbeiterrelation; zunächst original speichern |
| `Unternehmer` | Unternehmername aus DyCoS; Zuordnung über die vorhandene 100/95/60%-Regel und bewusste Prüfung uneindeutiger Kandidaten |
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

## 14. SQL-/Power-Automate-Abgleich für manuellen Einzelabruf

Prüfstand: **29.10.2026**, Besprechungsgrundlage, noch keine implementierte oder
freigegebene Schnittstelle. Quelle: vom Nutzer bereitgestellter
**DyCoS_SQL_Feldkatalog_V2.pdf**, Version 2.0 vom 28.10.2026, 44 Seiten.
Abgleich gegen den aktuellen lokalen Importcode, nicht gegen einen Live-Export
aller Firebase-Dokumente oder eine ausgeführte Power-Automate-Anfrage.

### Einordnung und heutiger Vertrag

Der Katalog enthält den Großteil der heute importierten Fachdaten, aber noch
keinen nachgewiesenen vollständigen Ersatz aller CSV-Felder. Er dokumentiert
Spalten und Stichproben, nicht den tatsächlichen HTTP-/JSON-Vertrag, die
Datentypen oder abschließend bestätigte Feldsemantik. Allgemeine Hinweise wie
„Nummer = Transportauftragsnummer“ gelten nicht ungeprüft für andere Tabellen
(etwa Relationen). Fehlende JSON-Eigenschaften, `null`, `0` und `false` sind
unterschiedlich zu behandeln. Die im Feldkatalog dokumentierte
1899-Datumskonvention darf insbesondere bei Uhrzeitfeldern nicht pauschal zu
`null` führen: Der anschließende Exportabgleich in Abschnitt 15 enthält
1899-Slotwerte mit Bis-Uhrzeiten. Der Nutzer hat bestätigt: Aus `Slotzeit`
ausschließlich die Uhrzeit extrahieren, das enthaltene Datum verwerfen.

Heute liest `src/lib/transportOrderCsv.js` CSV und erzeugt bereits JSON.
`functions/transportOrderImports.js` verarbeitet diesen internen Snapshot,
ergänzt Partnerreferenzen und speichert ihn in `transportOrders`. Die
Feldvergleichsliste steht in `functions/transportOrderImportChanges.js`.
Der Server prüft derzeit Baumstruktur und Pflichtwerte; ein neuer Adapter
braucht zusätzlich eine vollständige serverseitige Typ-/Feldvalidierung.

### Auftragsfelder: Zuordnung und offene Semantik

Alle Zielpfade dieser Tabelle liegen unter `transportOrders.imported`.
„Kandidat“ bezeichnet eine plausible Zuordnung, die mit einer echten Antwort
und einem bekannten CSV-/DyCoS-Auftrag noch zu bestätigen ist.

| Bisheriger Zielpfad | SQL-Quelle/Kandidat | Bewertung |
| --- | --- | --- |
| `externalNumber` | `Auftraege.Nummer` | Fachlicher Suchschlüssel; als Text behandeln. `Auftraege.ID` separat als Quell-ID behalten. |
| `relation` | `Auftraege.RelationsID` → `Relationen` | Nummer oder Bezeichnung noch gegen bisherigen Mitarbeiterrelationswert und Benutzerzuordnung prüfen. |
| `customerReference` | `Auftraege.Referenznummer` | Kandidat für bisherige CSV-Referenz. |
| `customer.debtorNumber`, `customer.name` | `FrachtzahlerID` → `Adressstamm.Debitorennummer`, `.Firma` | Nummer und tabellenbezogene SQL-ID strikt unterscheiden. |
| `customer.snapshot.country/postalCode/city/street` | `Adressstamm.Land/PLZ/Ort/Strasse` | Entsprechende Felder vorhanden. |
| `carrier.originalName` | `TourenID` → `Touren.UnternehmerID` → `Unternehmerstamm.Bezeichnung` | Kreditorennummer ist zusätzlich vorhanden; künftig genau damit zuordnen, nicht nur per Namensähnlichkeit. |
| `loading.city`, `unloading.city` | `LadeEntladestellen.Ort` | Erster Lade-/letzter Entladestopp anhand Typ und `Zeile_In_Auftrag`. |
| `loading.originalText`, `unloading.originalText` | Stoppfelder `Firma/Strasse/Land/PLZ/Ort` | Strukturierte Adresse vorhanden. Bisherigen zusammengesetzten CSV-Adresswert bewusst ersetzen/formatieren; Scheindifferenzen und Routing beachten. |
| `loading.window.from`, `unloading.window.from` | `LadeEntladestellen.Ankunft` | Geplante Ankunft; Stopp-ID verwenden. Lokale Zeit-/Zeitzonensemantik des JSON noch offen. |
| `loading.window.until`, `unloading.window.until` | `LadeEntladestellen2.Slotzeit` | Als Bis-Uhrzeit vom Nutzer bestätigt. Nur Uhrzeit extrahieren, Slotdatum auch bei regulärem Datum ignorieren. Im bisherigen Datum-/Zeitmodell mit dem Ankunftsdatum derselben Station verbinden. Join über `LadeEntladestellenID`. `Slotzeit_Von_Plan` gesondert prüfen. |
| `loading.note`, `unloading.note` | Stopp-`Bemerkung` bzw. Auftrags-Lade-/Entladebemerkung | Mehrere mögliche Quellen; exakte Entsprechung zur CSV offen. |
| `loading.reference`, `unloading.reference` | Bisher CSV „L/E Referenz erste LD/letzte ED“ | Im Katalog keine eindeutige gleichwertige Zuordnung belegt. `LieferscheinNr` oder Zustellinformation nicht ungeprüft gleichsetzen. |
| `financial.revenueNet` | `Auftraege_Preise.Gesamt` je `AuftragID` | Positionen, Steuer-/Währungsbezug sowie Proforma/Storno klären. `Auftraege.Preis` ist ausdrücklich kein verlässlicher Betrag. |
| `financial.costNet` | `Touren_Kosten.Gesamt` | Zusätzlich `AuftragID` vorhanden. Nicht pauschal gesamte Tourkosten jedem TA zuordnen; gemeinsame/nicht zugeordnete Kosten klären. |
| `shipment.licensePlate` | `Touren.LKWNummer` + `.Trailer` | Kandidaten für bisherige kombinierte Fahrzeugangabe. |
| `shipment.weightKg/loadingMeters/packages` | `Auftraege.Gewicht/Lademeter/AnzahlKolli` | Felder vorhanden; Einheiten und JSON-Typen bestätigen. Stoppwerte nicht zusätzlich aufsummieren. |
| `shipment.vehicleType` | `FahrzeugartID` → `Fahrzeugarten.Bezeichnung` | Lookup vorhanden; Anzeigename mit CSV vergleichen. |
| `contacts.customerForOrder` | `Auftraege.ImAuftrag` | Kandidat; enthält möglicherweise Kontakttext statt einer einzelnen Adresse. |
| `contacts.carrierForOrder` | bisher CSV „Info-1“ | Kein eindeutiges Auftrags-/Tourfeld bestätigt. `Faktura_Zeilen.Info1` ist kein belegter gleichwertiger Ersatz. |
| `contacts.customerStandardEmail` | etwa `Adressstamm.EMailZentrale` | Auswahlregel gegenüber mehreren Ansprechpartner-/Standardmarkierungen bestätigen. |
| `contacts.carrierStandardEmail` | mehrere E-Mail-Felder im Unternehmerstamm | Eindeutige Entsprechung zur CSV-Standardadresse noch offen. |
| `dispatch.sentAt`, `dispatch.sentTo` | `Touren.TAPerMailDatum/TAPerMailVersendetAn` | Gute Kandidaten; tatsächliche JSON-Zeitdarstellung und letzte Versandadresse prüfen. |
| `customer/carrier.partnerId`, `.partnerName`, `.masterDataStatus`, `carrier.matchStatus` | In Drehpunkt erzeugt/aufgelöst | Keine SQL-Spalten kopieren; bestehende Partner-IDs und Merge-Ursprünge erhalten. |

### Stammdaten und zusätzliche Daten

Kunden-/Unternehmernamen, Anschriften, Steuerkennungen, Internet,
Erfassungsdatum, TimoCom-Nummer, Zahlungsbedingungs-Lookup und Bankfelder des
heutigen Unternehmerimports sind grundsätzlich dokumentiert. Noch zu klären:

- `SprachenID`: Eine Sprachtabelle bzw. verbindliche ID→Sprachcode-Zuordnung
  fehlt im Katalog; sie ersetzt nicht unmittelbar das bisherige Textfeld.
- Ansprechpartner: mehrere parallele Familien (`EMailAnsp*`, `Ansp*Mail`,
  `Telefon*`, `Ansp*Tel`, Mobilfelder) und unterschiedliche Namensnummerierung
  bei Kunde/Unternehmer. Drei Kontakte sind möglich, ihre Slotzuordnung zum
  bisherigen Export ist noch nicht bewiesen. Firmen-`Name2/Name3` sind keine
  bestätigten Personennamen.
- `Zahlungsbedingung` ist eine Fremd-ID. `Bezeichnung`/`Drucktext` mit dem
  bisherigen vollständigen Zahlungszieltext vergleichen; `paymentTermDays`
  enthält im bestehenden Modell trotz seines Namens Text, keine reine Tageszahl.
- Zugeordnete Gegennummern erfordern zusätzliche Joins:
  `Adressstamm.UnternehmerID` → Kreditorennummer und
  `Unternehmerstamm.KundenID` → Debitorennummer. Die fachliche Gleichheit zur
  bisherigen CSV-Gegenbeziehung bestätigen, nicht aus gleichen IDs ableiten.
- Gutschriftverfahren/-anforderung ist fachlich abzugleichen.
  Unternehmer-`SWIFT` ist Kandidat für `bankData.bic`, `IBANgeprueftDatum` für
  das bisherige Prüfdatum. Bankdaten nur innerhalb des vorgesehenen
  Stammdatenvertrags übernehmen, nicht in allgemein lesbare Auftragssnapshots.

Der Katalog bietet darüber hinaus alle Stopps, Rechnungspositionen und
Belegköpfe. Diese werden vom heutigen TA-CSV-Import nicht vollständig
gespeichert. Ein SQL-Feld ist deshalb weder automatisch ein benötigtes
Drehpunkt-Feld noch ein freigegebenes neues Modul. PDF-Dateipfade sind keine
Webdownloads. Drehpunkteigene Fälle, To-dos, Bewertungen, manuelle
Trackingdaten, Rechte und Historien bleiben eigenständige Daten.

### Bestätigte fachliche Regeln für den neuen Abruf

Vom Nutzer am 29.10.2026 bestätigt; diese Regeln beschreiben den Zielzustand
des SQL-/Power-Automate-Abrufs, nicht bereits geänderten Produktcode:

- Fehlende Fachdaten verhindern den Import nicht. Kunde, Unternehmer, Relation,
  Anschriften, Kontakte, Fahrzeug, Termine und weitere Angaben sind fachlich
  optional und bleiben bei fehlenden Daten leer. Keine Ersatzpartner oder
  erfundenen Termine erzeugen.
- Fehlende Einkaufs-/Verkaufspreise werden als **numerischer Wert 0 Euro**
  gespeichert und angezeigt. Dies ist eine ausdrücklich vereinbarte
  Behandlung fehlender Preise, kein aus SQL belegter Preis. Vorhandene
  Preispositionen weiterhin fachlich korrekt zuordnen und berechnen.
- Aufträge ohne Unternehmer oder Stationen dürfen gespeichert werden.
  Ohne Stationen bleiben Routing und terminabhängiges Tracking inaktiv.
- Alle gelieferten Stationen strukturiert erhalten. Bestehende Ansichten
  verwenden zunächst erste Ladung und letzte Entladung.
- Erneuter Abruf aktualisiert denselben Auftrag; bestehende Verknüpfungen
  und manuelle Daten bleiben erhalten.
- Technisch erforderlich bleiben eine eindeutige TA-Identität und eine
  gültige, dem angefragten Auftrag zuordenbare Antwort. Ein fehlgeschlagener
  Abruf oder eine unlesbare Antwort ist kein erfolgreicher leerer Auftrag.
  Fehlerhafte mitgelieferte Werte nicht pauschal als fehlend behandeln.

Damals offen waren die Behandlung ausgelassener/geleerter Quellfelder und
die Teilnahme an der Tracking-/Mailautomatik. Der implementierte Vertrag und
die inzwischen bestätigte Automatikteilnahme stehen in Abschnitt 18.

### Vorgeschlagener technischer Ablauf, noch abzustimmen

1. Eingabe „TA-Nummer“ und „Abrufen“ in der Auftragsliste; sichtbare
   Rückmeldung „Neu“, „Aktualisiert“, „Unverändert“, „Prüfung nötig“ oder Fehler
   und danach Link zum vorhandenen/neuen Auftrag.
2. Geschützte Firebase-Function prüft aktives Profil und ausdrückliches
   Abruf-/Importrecht. Der Browser erhält weder SQL-Zugang noch geheimen
   Flow-Endpunkt. Bisher benötigt Import `dataImports:edit`; allgemeines
   Auftragsleserecht erweitert sich nicht automatisch zum Importrecht.
3. Power Automate liefert den eindeutig angefragten TA mit abhängigen
   Tabellen als begrenzte JSON-Antwort. SQL-Parametrisierung, fehlender TA,
   mehrere Treffer, Teilantwort und nicht disponierter Auftrag benötigen
   ausdrückliche Ergebnisse. Der aktuelle Import verlangt einen Unternehmer;
   Fälle ohne Tour/Unternehmer dürfen keine erfundenen Ersatzpartner erhalten.
4. Ein serverseitiger Adapter bildet das versionierte Quellformat auf den
   gemeinsamen Importvertrag ab. Neue und vorhandene Aufträge behalten
   `dycos-<kodierte TA-Nummer>` als Dokument-ID. SQL-Auftrags-/Tour-/Partner-IDs,
   Datenquelle, Abrufzeitpunkt, Benutzer und Anfragekennung separat erfassen.
5. Partner über Debitoren-/Kreditorennummern und bestehende Merge-Referenzen
   auflösen. Wiederholungen und parallele Abrufe dürfen weder Dubletten
   erzeugen noch neuere Daten durch ältere Antworten überschreiben. Der
   bestehende Import ist dafür gezielt zu härten; reine Wiederverwendung der
   Callable mit erfundenem Dateinamen/Zeilennummer ist kein fertiger Adapter.
6. CSV während der geprüften Übergangsphase erhalten. Später nutzt ein
   automatischer Abruf dieselbe Validierung/Zuordnung/Speicherung; dafür ist
   jetzt noch kein Zeitplan oder automatischer Trigger nötig.

Wichtig für die Besprechung: Manuell ausgelöster **Import** bedeutet nicht
automatisch manuelles **Tracking**. Neue TA können bereits Routenberechnung
und anschließend bestehende Tracking-/Mailautomatiken auslösen. Gewünschte
Wirkung des ersten Schnittstellentests vor einer Dev-/Produktionsprobe
festlegen. Der Import sendet selbst keine Mail.

Zum Zeitpunkt dieses ersten Abgleichs fehlten der tatsächliche Trigger-/Antwortvertrag, mindestens
eine bereinigte vollständige JSON-Antwort und die Bestätigung der offenen
Feldzuordnungen. Eine Antwort mit mehreren Stopps/Preispositionen sowie ein
bereits vorhandener TA dienen dem Vergleich und Wiederholungstest.
Keine Schnittstellenanfrage, Produktänderung, Migration oder Veröffentlichung
im Rahmen dieses ersten Abgleichs durchgeführt. Die anschließende Umsetzung
und ihre echten Prüfungen sind in Abschnitten 16–18 dokumentiert.

## 15. Abgleich der tatsächlichen Flow-Exporte

Stand: **29.10.2026**. Nutzer bestätigt einen bisher manuell gestarteten Flow.
Der Screenshot zeigt SQL-Abfragen, eine Slotdaten-Variable/Schleife und ein
zusammengesetztes Gesamtergebnis. Er belegt keinen HTTP-Eingang und zeigt
weder Abfragefilter noch Fehlerbehandlung oder vollständige Flow-Definition.

Die bereitgestellte Datei `260900123.txt` ist gültiges JSON. Im gleichen
Exportverzeichnis wurden außerdem die zwölf weiteren JSON-Dateien strukturell
geprüft. Originaldateien bleiben unverändert außerhalb des Repositorys; keine
vollständigen Stammdaten, Bank- oder Zugangsfelder in Testfixtures übernommen.

- Alle 13 Exporte besitzen dieselben 14 Hauptschlüssel: `auftrag`,
  `ladeEntladestellen`, `kunde`, `tour`, `unternehmerstamm`, `fahrzeugart`,
  `auftragspreise`, `tourkosten`, `relation`, `zahlungsbedingungKunde`,
  `zahlungsbedingungUnternehmer`, `fakturaZeilen`, `fakturaKopf` und
  **`LadeEntladestellen2`**. Die Großschreibung ist Teil des tatsächlichen
  Vertrags. Einzelobjekte, Listen und ausdrücklich `null` kommen vor.
- Zahlen sind gemischt typisiert: etwa TA-Nummer als Zahl, Gewicht als Text,
  Lademeter mit Dezimalkomma und Kolli als Text mit Nachkommastellen. Ein
  bloßes Kopieren oder `Number()` auf allen Feldern wäre falsch.
- Auftrags-/Kunden-/Tour-/Unternehmer-IDs, Stationen, Slotjoins sowie Preis- und
  Kostenzuordnungen passen in den geprüften vorhandenen Datensätzen zusammen.
  Das bestätigt die Stichprobe, keine allgemeine Vollständigkeit der Abfragen.
- Beispiel 260900123: zwei Stationen mit passender Slot-ID. Ankunft am
  01.09.2026 um 08:00 und am 02.09.2026 um 08:00. Zugehörige `Slotzeit`:
  `1899-12-30T16:00:00Z` bzw. `1899-12-30T11:00:00Z`. Insgesamt finden sich
  unter 22 Slotdatensätzen 16 solche 1899-Werte mit nicht mitternächtlicher
  Uhrzeit, vier mit Mitternacht und zwei mit regulärem Datum. **Vom Nutzer am
  29.10.2026 bestätigt:** Dies sind die Bis-Uhrzeiten der Stationen; nur die
  Uhrzeit übernehmen, das Slotdatum ist nicht maßgeblich. Für das bestehende
  `window.until` mit dem geplanten Ankunftsdatum derselben Station verbinden:
  im Beispiel Laden bis `2026-09-01T16:00`, Entladen bis `2026-09-02T11:00`.
  Keine UTC-/Sommerzeitverschiebung auf die extrahierte Stationsuhrzeit
  anwenden. Ohne Stationsdatum keinen vollständigen Zeitpunkt erfinden.
  Weiter offen: bedeutet Mitternacht eine echte Bis-Uhrzeit oder einen
  Leerwert, und wie werden über Mitternacht reichende Zeitfenster abgebildet?
- Vier Aufträge enthalten `tour: null` und `unternehmerstamm: null` ohne
  Unternehmerkosten. Der bisherige Import würde sie wegen des fehlenden
  Unternehmer-Pflichtwerts abweisen. Für den neuen Abruf ist inzwischen
  bestätigt: trotzdem speichern, Unternehmer leer lassen; keinen
  Ersatzunternehmer erzeugen.
- Drei Aufträge besitzen keine Stationen, darunter die beiden bezeichneten
  Palettenaufträge und der bezeichnete Schadenfall. Das ist nicht dasselbe
  wie ein fehlerhafter Abruf. Bestätigte Zielregel: speichern, ohne Stationen
  kein Routing und kein terminabhängiges Tracking. Der Dateiname „Schaden erfasst“ belegt keine technische
  Schadenrelation im Export und erzeugt keine Drehpunkt-Schadenakte.
- Auftrag 261000803 besitzt vier Stationen. Die Listenreihenfolge ist L/E/L/E,
  die fachliche Reihenfolge nach `Zeile_In_Auftrag` dagegen L/L/E/E.
  Auswahl ausschließlich anhand der Datensatz-IDs und Sequenz durchführen.
  Ein fehlender Verkaufspreis ist ein weiterer belegter Zustand. Der Nutzer
  hat dafür inzwischen ausdrücklich die Speicherung/Anzeige von 0 Euro
  festgelegt; diese Zuordnung nicht mit einem belegten Quellpreis verwechseln.
- Bei 260900123 verweisen vier Fakturazeilen auf vier Kopf-IDs; geliefert
  werden zwei Köpfe. Zwei Kopf-IDs bleiben unaufgelöst. Die gelieferten Köpfe
  passen zu den aktuellen Preis-/Kostenreferenzen; ob historische, ersetzte
  oder weitere Köpfe bewusst fehlen, ist anhand der Flow-Abfragen zu klären.
  Für einen vollständigen Rechnungsabgleich reicht diese Antwort so nicht.
- Zahlungsbedingungen enthalten sowohl kurze `Bezeichnung` als auch
  längeren `Drucktext` mit Platzhalter. Welcher Text den bisherigen Import
  ersetzt, bleibt eine ausdrückliche Feldzuordnung. Standard-E-Mail und
  Kontaktfamilien werden durch ihre bloße Belegung noch nicht gleichwertig.

Diese Ergebnisse sind Datensatz-/Strukturprüfungen und keine automatisierten
Produkttests oder Live-Schnittstellenprüfung. Für die erste Implementierung
steht ein verwendbares Rohformat zur Verfügung; Trigger, Antwortvertrag,
Zeitsemantik und Behandlung der Sonderfälle sind noch abzustimmen.

## 16. HTTP-Flow als vollständiger Entwurf aufgebaut

Stand: **29.10.2026**. Im integrierten Browser direkt bearbeitet, gespeichert
und nach delegierter Zugriffswahl veröffentlicht:
**Http -> Zeilen abrufen (V2) Auftraege**. Die
Power-Automate-Flowprüfung meldet **0 Fehler, 0 Warnungen**. Das ist eine
Designerprüfung, noch kein erfolgreicher SQL-/Gateway-/HTTP-Testlauf.

Der HTTP-POST-Trigger nimmt `taNummer` als String entgegen. Eine Bedingung
prüft vor dem SQL-Aufruf die numerische Darstellbarkeit. Ungültige Eingaben
erhalten HTTP 400; eine nicht gefundene TA erhält HTTP 404. Beide Zweige
beenden den Lauf nach ihrer Antwort, ohne die weiteren SQL-Abfragen auszuführen.
Die serverseitig eindeutige TA-Nummer wird mit Top-Anzahl 1 gesucht.

Die 14 SQL-Abfragen nutzen die vorhandene Verbindungsreferenz. Abgefragt
werden Auftrag, Stationen, Kunde, Tour, Unternehmer, Fahrzeugart,
Auftragspreise, Tourkosten, Relation, beide Zahlungsbedingungen,
Fakturazeilen, Fakturaköpfe und die Slot-Zusatzdaten. Fehlende optionale IDs
erzeugen einen gültigen Filter ohne Treffer, keinen leeren OData-Ausdruck.
Stationen werden nach `Zeile_In_Auftrag` und `ID` sortiert.

Zwei Select-Schritte erzeugen begrenzte OData-ODER-Filter:

- Belegköpfe aus allen gelieferten `KopfID`-/`RechKopfID`-Referenzen der
  Fakturazeilen, Preispositionen und Tourkosten; dadurch nicht nur die zwei
  aktuellen Köpfe des bisherigen Beispielexports abfragen.
- Slot-Zusatzdaten aus den IDs aller Stationen. Eine einzelne gefilterte
  SQL-Abfrage ersetzt die bisherige Schleife mit Arrayvariable. Ohne Stationen
  ist das Ergebnis leer; kein unbeschränkter Tabellenabruf.

`Gesamtergebnis` erzeugt ein JSON-Objekt mit den unveränderten 14
Hauptschlüsseln aus Abschnitt 15. Listen bleiben Arrays; fehlende
Einzelobjekte werden `null`. Die Erfolgsantwort liefert HTTP 200 mit
`Content-Type: application/json` und dem Objekt, ohne zusätzliche
Text-Serialisierung. Ein abschließender Fehlerpfad liefert HTTP 500, wenn
der Erfolgszweig wegen Fehler, Timeout oder übersprungener Verarbeitung
keine Erfolgsantwort erzeugt. Es wird keine unvollständige Antwort als
erfolgreicher leerer Auftrag behandelt.

Der Flow liest nur SQL und schreibt noch nichts nach Firestore. Rohwerte wie
Slotdatum/-uhrzeit bleiben entsprechend dem Export erhalten; die bestätigten
internen Regeln zu Slot-Uhrzeit, optionalen Fachdaten und Preisen von 0 Euro
werden im anschließenden Drehpunkt-Abrufadapter umgesetzt.

Wichtige Umgebungsgrenze: Der Flow liegt in **Brennpunkt Logistik GmbH
(default)**, nicht in einer durch den Git-Branch `dev` isolierten
Power-Automate-Umgebung. Der Nutzer hat die Zugriffswahl delegiert. Der
veröffentlichte Trigger ist auf das Eigentümerkonto und die ausdrücklich
freigegebene technische Dev-Anwendung beschränkt ("Spezifische Benutzer in
meinem Mandanten", explizite Aufruferliste; Konfiguration siehe Abschnitt 17).
Ein Firebase-/Drehpunkt-Recht schützt diesen direkten
HTTP-Endpunkt nicht zusätzlich. Kein anonymer oder mandantenweiter Zugriff.

Reale SQL-/Gateway-/HTTP-Prüfungen folgen in Abschnitt 17. Der Zugriffsschutz
wurde für die Tests nicht abgeschwächt. Firebase-Import und Einbindung in
Drehpunkt bleiben anschließende Arbeiten. Kein Git-Push oder Firebase-Deployment.

## 17. Technische Dev-Identität und authentifizierte Abrufprüfung

Stand: **29.10.2026**. Separate, mandanteninterne Entra-Anwendung
**Drehpunkt DyCoS – Dev**; nicht die Anwendung der Graph-Postfachintegration.

- Mandant: `b829bbdc-c0b7-4128-a341-6715a67b451b`.
- Anwendungs-/Client-ID: `af6ea757-8148-4a7b-b4ce-1317a0c78c7d`.
- Unternehmensanwendung-/Service-Principal-Objekt-ID:
  `9e4a1b27-1461-46eb-b309-1dbbd5fadb79`. Diese ID steht zusätzlich zum
  Eigentümerkonto in der Aufruferliste des HTTP-Triggers. Nicht die Objekt-ID
  der App-Registrierung verwenden. Freigabe und Veröffentlichung wurden
  unmittelbar vor der Änderung ausdrücklich vom Nutzer bestätigt.
- Lokales RSA-3072-Testzertifikat; öffentlicher Teil vom Nutzer in Entra
  hochgeladen. Gültig bis **27.01.2027, 14:35 UTC**. Vor Ablauf ein neues
  Zertifikat ergänzen, den Aufruf damit prüfen und anschließend das alte
  entfernen. Keine unbeaufsichtigte dauerhafte Betriebsanmeldung zugesichert.
- Private Schlüsseldatei und HTTP-Adresse bleiben in einem durch Windows-ACL
  auf den aktuellen Benutzer beschränkten lokalen Verzeichnis außerhalb des
  Repositorys. Keine Tokens, Schlüssel oder Rohantworten in Git oder Logs;
  Test-Rohantworten ausschließlich lokal im selben geschützten Verzeichnis.

Die Anmeldung erfolgt per OAuth-Client-Credentials mit kurzlebiger,
zertifikatsignierter Assertion (`PS256`, `x5t#S256`). Tokenziel ist der
mandantenspezifische Entra-v2-Tokenendpunkt. Der Scope
`https://service.flow.microsoft.com//.default` liefert die erforderliche
Audience `https://service.flow.microsoft.com/` einschließlich End-Schrägstrich.
Audience, Mandant und Service-Principal-Objekt-ID wurden lokal geprüft;
Tokens werden nicht ausgegeben oder an externe Decoder übertragen.
Keine zusätzlichen Mail-/Graph-/Flow-Verwaltungsrechte für diesen Aufruf vergeben.

Referenzen: [Microsoft: HTTP-Trigger mit OAuth](https://learn.microsoft.com/en-us/power-automate/oauth-authentication),
[Microsoft: Zertifikatsignierte Client-Assertion](https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials).

### Reale Prüfergebnisse vom 29.10.2026

Alle **13 bereitgestellten TA-Beispiele** wurden mit der technischen Anwendung
seriell über den veröffentlichten HTTP-Flow und das vorhandene SQL-Gateway
abgerufen: jeweils HTTP 200, vollständiges JSON-Objekt mit 14 Hauptschlüsseln,
passende angefragte TA-Nummer und unveränderte Auftragsidentität.
Laufzeit pro Abruf in dieser Serie: **13,56–18,49 Sekunden**. Dies ist eine
Messung dieser Stichprobe, keine garantierte maximale Antwortzeit.

Enthaltene Sonderfälle: drei Aufträge ohne Stationen, zwei ohne
Kundenpreispositionen, ein Auftrag mit vier Stationen, mehrere Preispositionen
sowie vier Aufträge ohne Tour und Unternehmer. Fehlende Einzelobjekte sind
`null`, fehlende Listen leer. Fehlende Preise werden hier noch als leere
Rohpositionen übertragen; die bestätigte Abbildung auf **0 Euro** gehört in
den anschließenden internen Adapter.

Automatisch geprüft wurden Objekt-/Arraystruktur, TA- und SQL-Auftragsidentität,
Partner-/Tour-/Fahrzeug-/Relations-/Zahlungsbedingungs-IDs, Zugehörigkeit der
Stationen, Preis- und Fakturazeilen zum Auftrag, Tourkostenzugehörigkeit,
Stationensortierung, Slot-Verknüpfungen und die Vollständigkeit der positiven
Rechnungskopfreferenzen. Keine sachfremden Köpfe oder Slots in der Stichprobe.

Der Feldvergleich mit den ursprünglichen 13 Exportdateien ignoriert nur
wechselnde Connector-Metadaten (`ItemInternalId`, `@odata.etag`), die
Listenreihenfolge beim Inhaltsvergleich und äquivalente JSON-Zahlendarstellungen.
Die vorgesehene Stationensortierung wurde zusätzlich separat geprüft.
Festgestellte fachliche Abweichungen:

- TA **260900123** liefert vier statt zwei Fakturaköpfe. Die zwei zusätzlichen
  Köpfe gehören zu bereits im alten Export enthaltenen Fakturazeilen; die
  bisher fehlenden Verknüpfungen werden jetzt vollständig aufgelöst.
- Bei TA **261000803** unterscheidet sich `tour.PosInTourenplan` vom alten
  Export. Es handelt sich um einen Live-Quellwert; die Ursache der Änderung
  wurde nicht untersucht. Alle übrigen verglichenen Fachwerte stimmen überein.

| Prüfung | Ergebnis |
| --- | --- |
| Anfrage ohne Bearer-Token | HTTP 401, `DirectApiAuthorizationRequired` |
| Authentifizierte Anfrage mit `abc` | HTTP 400, `INVALID_TA_NUMBER` |
| Authentifizierte Anfrage mit `999999999` | HTTP 404, `TA_NOT_FOUND` |
| 13 vorhandene Beispielaufträge | Jeweils HTTP 200, Struktur-/Zuordnungsprüfungen bestanden |

Die zunächst als möglicher Nichttreffer probierte Nummer `0` existiert
tatsächlich in SQL und wurde korrekt als Auftrag 0 zurückgegeben. Daraus keine
fachliche Regel über zulässige TA-Nummern ableiten. Der Nichttreffer wurde
anschließend ausdrücklich mit `999999999` geprüft.

Die erfolgreichen Ausführungen sind auch im Power-Automate-Verlauf sichtbar.
Ein technischer SQL-/Gateway-Ausfall wurde nicht künstlich erzeugt; der
HTTP-500-Pfad ist daher noch nicht durch einen realen Störungstest bestätigt.
Ein gültiges Token einer anderen, nicht zugelassenen Anwendung wurde nicht
getestet. Die Aufruferliste bleibt explizit auf Eigentümer und Dev-Anwendung
begrenzt; keine mandantenweite oder anonyme Freigabe.

Es wurden **keine Firebase-Daten geschrieben, keine Dev-Functions bereitgestellt
und keine Tracking-/Mailabläufe ausgelöst**. Die Browserfreigabe betrifft nur
den beschriebenen Power-Automate-Flow, keinen Git-/Produktionsrelease.
Anschließend erforderlich: serverseitiger Drehpunkt-Abruf mit bestehender
Rechteprüfung, geprüfte Feldzuordnung und Normalisierung (Slot-Uhrzeit,
0-Euro-Preise, optionale Daten), wiederholungssichere Speicherung und Diagnose.

## 18. Manueller TA-Abruf in Drehpunkt

Stand: **29.10.2026**, als gesonderter Dev-Umfang freigegeben. Die benötigten
Backend-Funktionen sind in `db-bpl-drehpunkt-dev` bereitgestellt; die Oberfläche
dieses Änderungssatzes wird gebündelt über den Git-Branch `dev` ausgeliefert.
Die ursprünglichen lokalen Prüfungen stehen unten, der konkrete
Veröffentlichungsumfang in Abschnitt 19. Keine Produktionsfreigabe.

### Ablauf und Datenvertrag

Auf der vorhandenen Importseite `/transportauftraege/import` steht ein
TA-Eingabefeld mit „Abrufen und übernehmen“. Die CSV-Übergangsfunktion bleibt
daneben verfügbar. Der Browser ruft ausschließlich die App-Check-geschützte
Callable `fetchDycosTransportOrder({ taNummer, requestId })` auf. Sie prüft
aktives Profil und `dataImports: edit`; allgemeines Leserecht reicht nicht.
Zurück kommen Status (`new`, `updated`, `unchanged`), Dokument-ID, TA-Nummer,
Anfragekennung, Importlauf-ID und begrenzte fachliche Warncodes. Der Link zum
Auftrag erscheint nur mit entsprechendem Auftragsleserecht.

`dycosFlowClient.js` trennt Anmeldung/Abruf von `dycosOrderMapping.js`
(Validierung/Feldzuordnung) und `dycosTransportOrders.js` (Berechtigung,
Partnerauflösung, atomare Speicherung, Diagnose). SQL-Identitäten werden
getrennt unter `imported.source` geführt, alle Stationen unter `imported.stops`.
Die bestehenden Auftragsansichten und Trackingregeln verwenden weiterhin erste
Ladung/letzte Entladung. Routing kann deren strukturierte Länder/PLZ/Orte nutzen.
Keine vollständigen SQL-Stammdaten, Bank-/Zugangsfelder oder Rechnungsobjekte
werden ungefiltert gespeichert.

- Nur kanonische numerische TA-Strings im SQL-Int32-Bereich akzeptieren;
  keine mehreren Dokument-IDs durch führende Nullen oder Exponentialschreibweise.
- Der Flow muss alle 14 vereinbarten Hauptbereiche liefern. Optionale Objekte
  dürfen `null`, Listen leer und fachliche Felder unbefüllt sein. Falsche TA,
  widersprüchliche IDs, doppelte Stationen/Slots und ungültige gelieferte Werte
  verwerfen die Antwort vor Speicherung. Fehlende Hauptbereiche sind kein
  erfolgreicher Teilimport.
- Der vollständige Quellsnapshot ersetzt die zugeordneten importierten Felder;
  leere optionale Quellwerte leeren auch deren importierte Gegenstücke.
  Manuelle Felder, Tracking und Fallverknüpfungen werden nicht ersetzt.
- Noch nicht fachlich eindeutig zugeordnet sind `loading.reference`,
  `unloading.reference`, `contacts.carrierForOrder`,
  `contacts.carrierStandardEmail`, `contacts.customerStandardEmail`.
  Nichtleere bestehende Werte dieser fünf Pfade bleiben ausdrücklich erhalten;
  die Pfade sind unter `importMeta.preservedLegacyFields` nachvollziehbar.
  Bei neuen Aufträgen bleiben sie leer. Kein erfundener E-Mail-Fallback.
- Slotdatum wird ignoriert; die lokale Uhrzeit bleibt ohne Zeitzonenverschiebung
  unter `slotUntilTime` erhalten. Für normale Fenster wird sie mit dem
  Stationsdatum verbunden. Bei `00:00` oder einem Ende vor dem Beginn bleibt
  das abgeleitete Fensterende bis zur fachlichen Klärung leer; der Original-
  Uhrzeitanteil und ein sichtbarer Warnhinweis bleiben erhalten.
- Kundenpreis ist die Summe der aktuellen `Auftraege_Preise.Gesamt`-Positionen.
  Unternehmerkosten summieren nur Tourkosten mit exakt passender `AuftragID`;
  gemeinsame/unzugeordnete Tourkosten werden nicht willkürlich verteilt und
  erzeugen einen Hinweis. Fehlende Preise ergeben numerisch **0 Euro**.
  `GesamtEUR` und historische/pro-forma Rechnungen ersetzen diese Preise nicht.

### Identitäten, Wiederholung und Nebenwirkungen

Partner werden über genaue Debitoren-/Kreditorennummern und vorhandene
Zusammenführungsreferenzen aufgelöst. Namensähnlichkeit allein verknüpft keine
Partner. Widersprüchliche oder mehrdeutige Kontonummern brechen den Vorgang ab.
Neue Partner entstehen nur mit stabiler Kontonummer und Namen; fehlende Partner
blockieren ansonsten den TA nicht und erzeugen keine leeren Stammdatensätze.
Bestehende Partnerstammdaten werden durch diesen Abruf nicht überschrieben.

TA, neue Partner, Feldhistorie, Importlauf/-zeile und Wiederholungsbeleg werden
gemeinsam in einer Firestore-Transaktion gespeichert. Eine benutzergebundene
Anfrage-ID erkennt Wiederholung nach unklarem Antwortausgang. Ein serverseitiger
TA-Lease begrenzt parallele Abrufe; ein Versionsvergleich verhindert Überschreiben
zwischenzeitlicher Änderungen. Höchstens zehn Abrufversuche pro Benutzer und
Minute. Ein Fehler erzeugt keinen leeren TA oder isoliert angelegten Partner.

Bereits über die Schnittstelle aktualisierte Aufträge dürfen nicht wieder mit
CSV überschrieben werden. CSV prüft den Kanal vorab und sichert den tatsächlichen
Commit zusätzlich mit der gelesenen Dokumentversion ab, auch gegen den
gleichzeitigen Wechsel zur Schnittstelle. Der alte CSV-Pfad behält sonst seine
Pflichtfelder und Zuordnungsregeln. Importhistorie unterscheidet einen
`dycos-api`-Auftragsabruf von einer CSV-Datei.

Der Nutzer hat die Teilnahme wie beim CSV-Import ausdrücklich bestätigt:
Routenberechnung und bestehende Trackingautomatik greifen, soweit die jeweiligen
Datenvoraussetzungen erfüllt sind. Ohne Stationen keine automatische Route und
kein terminabhängiger Trackingstart. Bestehende Empfänger-/Partnerregeln,
Betriebszeiten und Dev-Versandsperren gelten weiterhin; der Abruf selbst sendet
keine Mail. Keine neue Termin-/Empfängerregel aus unklaren Quellwerten ableiten.

Technische Anmelde-, Abruf-, Zuordnungs- und Speicherfehler landen in der
zentralen Diagnose unter „DyCoS-Auftragsabruf“ mit Benutzer, Serverzeit,
Stufe, sicherem Fehlercode, Auswirkung und Anfrage-ID. Keine Rohantwort,
Zugangsdaten oder Anbieterfehlermeldung übernehmen. Nichttreffer und normale
Eingabe-/Zuordnungskonflikte sind keine technischen Diagnosefehler; ein
Diagnosefehler ersetzt nicht den ursprünglichen Fehler.

### Einrichtung vor dem Dev-Test

Die Callable benötigt ausschließlich im Firebase-Projekt
**`db-bpl-drehpunkt-dev`** diese sechs Secret-Manager-Einträge:

| Secret | Inhalt |
| --- | --- |
| `DYCOS_TENANT_ID` | Mandant aus Abschnitt 17 |
| `DYCOS_CLIENT_ID` | Client-ID der separaten DyCoS-Dev-Anwendung |
| `DYCOS_SERVICE_PRINCIPAL_ID` | Objekt-ID ihrer Unternehmensanwendung |
| `DYCOS_CERTIFICATE_PEM` | Hochgeladenes öffentliches Zertifikat im PEM-Format |
| `DYCOS_PRIVATE_KEY_PEM` | Zugehöriger privater Schlüssel, nur serverseitig |
| `DYCOS_FLOW_URL` | Generierte HTTP-POST-Adresse des geprüften Leseflows |

Lokale Zertifikatsdateien sind nicht automatisch Firebase-Secrets. Die sechs
Dev-Secrets wurden nach ausdrücklicher Freigabe eingerichtet; die Function
ist ausschließlich im Dev-Projekt bereitgestellt. Frontend und realen
Firebase-Auth-/App-Check-Ablauf nach dessen Auslieferung gemeinsam prüfen.
Keine neuen Firestore-Rules oder Indizes erforderlich; interne
Anfrage-/Lease-/Quota-Daten bleiben serverseitig. Für Produktion ist eine eigene
Einrichtung und ausdrückliche Freigabe erforderlich.

### Prüfstand dieser Implementierung

- **59 fokussierte Unit-Tests** für Zertifikatsclient, Mapping, Änderungen,
  Routing, Diagnose und bestehende Trackingautomatik bestanden.
- **14 Tests in der Emulator-Suite** bestanden (zwölf echte Firestore-
  Integrationsfälle und zwei reine Vertrags-/Trackingprüfungen). Enthalten:
  aktive/verweigerte Konten, fehlender TA, ungültige Antwort, atomare Speicherung,
  Wiederholung, Parallelität, manuelle Zwischenänderung, genaue/mehrdeutige
  Partneridentität, CSV/API-Rennen und bestehender CSV-Import.
- **Alle 13 echten Exportbeispiele** zusätzlich vollständig im lokalen
  Demo-Firestore gespeichert, mit derselben Anfrage-ID wiederholt und mit
  neuer Anfrage-ID unverändert reimportiert. Dabei keine externen SQL-Aufrufe
  und keine Cloud-Firebase-Schreibzugriffe; Emulator anschließend beendet.
- Der **neue Node-Serverclient** hat TA 260900123 zusätzlich real über
  Zertifikat/Entra/Power Automate/SQL abgerufen und gemappt. Kein Firestore-
  Schreiben bei diesem echten Schnittstellenaufruf.
- Lokale Browserprüfung des echten Formularcodes mit synthetischer API und
  synthetischen Rechten: DE/EN, Light/Dark, Validierung, Laden, Erfolg,
  Nichttreffer, Warnungen, fehlende Lese-/Importrechte und stabile Anfrage-ID
  bei Antwortunterbrechung. Keine Browserfehler; vier Übersetzungstests bestanden.
  Die Mockprüfung ersetzt nicht den noch offenen angemeldeten Dev-Cloud-Ablauf.
- Lint, Build und `check:functions-shared` bestanden. Temporäre Harness-Dateien
  unter `tmp/` werden entsprechend den Arbeitsvereinbarungen von ESLint
  ausgeschlossen; der Build meldet weiterhin die vorhandene Chunkgrößenwarnung.

Offen nach den ursprünglichen lokalen Prüfungen war die echte Dev-Abnahme
mit Firebase-Auth-/App-Check-/Speicher-/Neuladeablauf; die danach freigegebene
Bereitstellung steht in Abschnitt 19. Die fünf Kontakt-/Referenzzuordnungen sowie die Bedeutung
von Mitternachts-/Übernacht-Slots bleiben fachlich zu klären; die Anwendung
kennzeichnet bzw. erhält diese Fälle wie oben beschrieben.

## 19. Freigegebener Dev-Veröffentlichungsumfang am 29.10.2026

Der Nutzer hat Einrichtung, Dev-Deployment und gebündelten Dev-Push ausdrücklich
freigegeben; `main` und Produktion bleiben unberührt. Der veröffentlichbare
Änderungssatz wurde von noch offenen Kalender-/Falländerungen im ursprünglichen
Arbeitsordner getrennt. Diese übrigen Arbeiten wurden nicht zurückgesetzt oder
mit veröffentlicht. Bestehende Postfachfunktionen aus dem vorherigen Dev-Stand
bleiben erhalten.

Alle sechs oben genannten Secrets besitzen im Projekt `db-bpl-drehpunkt-dev`
eine aktive Version 1. Der Laufzeitdienst erhält Zugriff auf genau diese
Secret-Namen; Werte werden nicht ausgegeben oder versioniert. Wegen der
projektweiten Parameteranalyse wurden die drei unveränderten bestehenden
`MAILBOX_*`-Parameter aus der laufenden Dev-Konfiguration in eine ignorierte
Dev-Dotenv-Datei übernommen. Keine Postfachfunktion dafür neu bereitgestellt.

Firebase bestätigt die erfolgreiche Bereitstellung dieser sieben Exporte in
`europe-west3`:

- `fetchDycosTransportOrder` (neu),
- `importTransportOrders`, `listTransportOrderImportRuns`,
- `listDiagnosticsPage` (neuer Modulfilter),
- `calculateTransportOrderRoute`, `calculateImportedTransportOrderRoute`,
  `processImportedTransportOrderRoute` (strukturierte Stationsadressen).

Keine Rules-/Index-/Storage-Bereitstellung. Der getrennte Release-Kandidat
bestand Lint, Build, Shared-Prüfung, 55 fokussierte Unit-Tests und die komplette
14-Tests-Emulator-Suite. Die geringere Unit-Zahl gegenüber Abschnitt 18 entsteht
durch bewusst nicht mit veröffentlichte Kalender-/Fall-Diagnoseänderungen.
Die anschließende Browserabnahme wird gegen
`https://dev.drehpunktlogistik.de/transportauftraege/import` durchgeführt;
ein erfolgreicher Backend-Deploy allein gilt nicht als Frontend-/Benutzerabnahme.
