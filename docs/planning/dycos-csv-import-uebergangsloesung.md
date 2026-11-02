# DyCoS CSV-Import – Übergangslösung

Stand: 31.10.2026. Dieses Dokument beschreibt die Entwicklung vom historischen
CSV-Import zum aktuellen DyCoS-Abruf über Power Automate. Maßgeblich für den
aktuellen Stand sind die späteren Abschnitte, insbesondere Abschnitt 39.
Die früheren CSV-Verträge bleiben zur Erklärung bestehender Daten und
Importverläufe erhalten; sie beschreiben keinen weiterhin angebotenen Upload.
Einzelabruf, Sammelimport, eigenständiger Stammdatenabruf und Aktualisierung
verwenden inzwischen die Schnittstelle.

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

Die Abnahme des bereits veröffentlichten TA-Abrufs auf Commit `650f70e` ist
erfolgt: Neuanlage, unveränderter Wiederholungsabruf, Öffnen/Neuladen, Nichttreffer,
fehlende Stationen/Preise/Unternehmer und Diagnosefilter wurden auf Dev geprüft.
Die nachfolgende Stammdatenergänzung aus Abschnitt 20 gehört noch nicht zu
diesem veröffentlichten Stand.

## 20. Erweiterte Kunden-/Unternehmerdaten aus dem TA-Abruf

Stand **29.10.2026**: lokal implementiert, noch nicht auf Dev bereitgestellt.
Der Nutzer bestätigt: **leere Felder ergänzen, Abweichungen melden**. Das
**Kreditlimit bleibt ausschließlich in Drehpunkt gepflegt**; DyCoS überschreibt
es nicht und füllt auch ein leeres Kreditlimit nicht.

`dycosPartnerData.js` bildet ausschließlich freigegebene fachliche Felder auf
das vorhandene Partner-Modell ab. Die Partneridentität und die fünf noch offenen
TA-Kontakt-/Referenzzuordnungen aus Abschnitt 18 bleiben davon getrennt.

| Ziel | Verwendete Quelle |
| --- | --- |
| Firma und Anschrift | `Firma`/`Bezeichnung`, `Strasse`, `PLZ`, `Ort`, `Land` |
| Allgemeiner Kundenkontakt | `TelefonZentrale`, `FaxZentrale`, `EMailZentrale` |
| Website | `Internet`; E-Mail-Inhalt wird als Kontakt behandelt, nicht als Website |
| USt-ID / Steuernummer | `USTID`, `Steuernummer` |
| Zahlungsziel | Vollständige `Zahlungsbedingungen.Bezeichnung`, keine erfundene Tageszahl |
| Kundenseitiges Gutschriftverfahren | Explizites Boolean `KundeSchicktGutschrift`; keine entsprechende Unternehmerregel erfunden |
| TimoCom | `TimoComNummer`; Nullnummern nicht als echte Referenz übernehmen |
| Erfasst am | `Erfassungsdatum`; technische 1899-/1900-Daten bleiben leer |
| Bankdaten | `IBAN`, `SWIFT` → BIC, Prüfdatum nur mit gesetztem `IBANgeprueft`; keine eigene Bankprüfung behaupten |
| Ansprechpartner | Gleich benannte Gruppen aus Name, Abteilung, Telefon und `EMailAnsp...`; mehrere Adressen werden getrennt und nach E-Mail dedupliziert |

`Ansp1Mail` usw. sind Ja/Nein-Felder, keine E-Mail-Adressen. Die separate
Mobilnummernfamilie `Ansp...HandyKD/UTN` bleibt als eigenständiger Kontaktweg
erhalten; ohne bestätigte Zuordnung zu den Namens-/E-Mail-Indizes wird sie nicht
willkürlich einer Person angehängt. Nichtleere Abteilungen bleiben als
„Sonstiges“ mit Originaltext erhalten. Ein neu erzeugter Kontakt besitzt eine
stabile, nach Quelle und E-Mail getrennte ID. Vorhandene Kontakt-IDs bleiben
bei E-Mail-Treffern erhalten; manuelle Werte werden nicht überschrieben.

Keine automatische Auswahl einer Standardadresse aus mehreren Kontakten.
Eine einzelne `EMailZentrale` ist die allgemeine Firmenadresse im Stammdatenblatt,
nicht automatisch die noch ungeklärte TA-Standardadresse. Mehrere zentrale
Adressen werden als Kontakte gespeichert und sichtbar erklärt. Ungültige
Kontakt-/Bankformate werden nicht still übernommen, sondern als begrenzte
Warncodes zurückgemeldet. Freitext-`Infos`, Portalpasswörter und andere
Zugangsspalten werden nicht pauschal kopiert. Handelsregister, Registergericht,
Trans.eu/DPL/PAKI und Sprache werden ohne eindeutig zuordenbare Quelle nicht
erfunden; eine `SprachenID` ist keine bestätigte Sprache.

Zusätzliche Stammdaten erfordern neben dem TA-Importrecht `masterData: edit`
oder Superadmin. Ohne dieses Recht bleibt der bisherige TA-Import möglich,
die erweiterte Übernahme wird sichtbar ausgelassen. Fehlende Kontonummer oder
Partnerzuordnung erzeugt ebenfalls einen Hinweis, keinen leeren Ersatzpartner.

Alle Ergänzungen erfolgen in derselben Transaktion wie TA und Importlauf.
Bestehende Werte einschließlich Boolean `false` gelten als befüllt. Bei
widersprechenden Kunden-/Unternehmerwerten desselben Partners wird kein Wert
nach zufälliger Schreibreihenfolge ausgewählt. Unter `dycosImport` bleiben
Quellreferenzen mit Entität/SQL-ID, Zeitpunkt, Akteur, ergänzte Feldpfade und
Konflikte nachvollziehbar. Stammdaten-Historien verwenden die vorhandenen
Benutzer-/Zeitfelder; unveränderte Wiederholungen erzeugen keine identischen
Konflikthistorien. Neue Partner erhalten die vollständige zugeordnete Erstausstattung,
statt technische Leer-Defaults als bereits manuell gepflegte Werte zu behandeln.

Der TA-Abruf meldet ergänzte Partner und verbleibende Konflikte separat vom
TA-Änderungsstatus. Das Stammdatenblatt zeigt aktuelle Werte und abweichende
DyCoS-Werte zum Vergleich; nach manueller Angleichung verschwinden erledigte
Abweichungen aus der Anzeige. Ein erneuter TA-Abruf aktualisiert den Vergleich.
Bank-/Erfassungsangaben sind als weitere importierte Daten sichtbar, ohne
zusätzliche allgemeine TA-Leserechte auf diese Werte auszuweiten.

Prüfung: gezielte Unit- und Firestore-Emulatortests für Ergänzung, Rechte,
manuelle Werte, gleiche Kontaktadresse, Wiederholung, Kreditlimit-Ausschluss,
neue Partner und widersprüchliche Doppelrollen. Alle 13 bereitgestellten
Originalexporte wurden lokal gemappt, gespeichert und erneut unverändert
importiert; keine SQL-/Cloud-Schreibaufrufe für diese Prüfung. Browserprüfung
mit synthetischen Daten: DE/EN, Light/Dark und erledigte Konflikte. Abschließend
33 fokussierte Unit-Tests sowie die 18-Tests-Emulator-Suite bestanden. Lint,
Build und Shared-Prüfung sind erfolgreich; die vorhandene Chunkgrößenwarnung
bleibt bestehen. Keine neue Cloud-Bereitstellung oder Dev-/Main-Veröffentlichung
für diese Erweiterung durchgeführt.


## 21. Preispositionen, Stationsware und offene Belegzuordnung (29.10.2026)

Für den manuellen TA-Abruf werden einzelne Kunden-Ertragspositionen und nur die
explizit dem angefragten Auftrag zugeordneten Tour-Kostenpositionen übernommen:
Reihenfolge, Leistungstext/-ID, Menge, Einheit, Einzelpreis und Gesamt netto in
EUR sowie vorhandene technische Stations-/Belegreferenzen. Maßgeblich bleibt
`Gesamt`; kein Neuberechnen aus Menge × Preis und keine Übernahme fremder oder
nicht auftragsbezogener Tourkosten. Fehlende Preise sind 0 EUR. Gleichartige
Positionen bleiben einzeln bestehen; wechselnde SQL-Connector-IDs und andere
Antwortreihenfolgen erzeugen keine künstlichen Änderungen.

Alle Lade-/Entladestationen erhalten Gewicht (kg), Kolli, Lademeter und den
Palettentausch als Ja/Nein/unbekannt. Fehlende Mengen bleiben leer; explizite
Nullen bleiben Null. Stationsmengen werden weder zwischen Laden und Entladen
summiert noch aus bisherigen CSV-Auftragssummen auf Stationen verteilt.
Bestehende CSV-Gesamtmengen bleiben bei fehlenden neuen Auftragssummen erhalten;
ein ausdrücklich gelieferter Wert einschließlich 0 ersetzt die alte Summe.
Palettentausch ist nur die Quellenangabe, keine automatische Palettenbuchung.
`BearbeiterErfassung` wird unverändert als Bearbeitercode übernommen, ohne ihn
einem Drehpunkt-Benutzer zuzuordnen. Das Auftragsblatt zeigt die neuen Angaben;
Änderungshistorie und Wiederholungsprüfung berücksichtigen sie ebenfalls.
Reine Waren-/Palettentauschänderungen lösen keine Routenneuberechnung aus.

**Auf ausdrücklichen Nutzerwunsch zurückgestellt:** Der Rechnungs-/Gutschriftsblock
wartet auf die fachliche Bedeutung der DyCoS-Belegarten **2, 3 und 7** und die
Zuordnung des Ausstellers (wir oder Geschäftspartner). Nach Klärung nachholen:
eigene/externe Rechnungs- und Gutschriftsnummern, Belegart, Belegdatum, EUR,
Proforma-Kennzeichnung und Stornoreferenzen. Keine Zuordnung aus Nummern oder
Belegtexten erraten. Bei späterer Umsetzung nur Belege des angefragten Auftrags
berücksichtigen; der Flow kann über Tourkosten auch weitere Belegköpfe liefern.
Diese Erweiterung verändert den bestehenden Flow nicht und benötigt für die
bereits gelieferten Daten keine zusätzlichen SQL-Abfragen.

Die Umsetzung bleibt lokal auf dem Dev-Arbeitszweig; keine Veröffentlichung
auf Dev/Main und keine Cloud-Bereitstellung in diesem Arbeitsschritt.

Prüfung dieser Erweiterung: 37 fokussierte Unit-Tests und 19 Tests in der
Firestore-Emulator-Suite bestanden. Zusätzlich alle 13 bereitgestellten
Originalexporte ausschließlich im lokalen Emulator übernommen und unverändert
wiederholt; Positionszahlen, Stationsmengen und Bearbeiter geprüft. Browsercheck
mit synthetischen Daten in DE/EN und Light/Dark, inklusive expliziter Nullwerte,
unbekanntem Palettentausch und alten CSV-Aufträgen ohne neue Detailfelder.
Lint, Build und Shared-Prüfung erfolgreich; bestehende Chunkgrößenwarnung bleibt.


## 22. Erneute Dev-Freigabe am 29.10.2026

Der Nutzer hat die Veröffentlichung der erweiterten Partnerdaten und der
Preis-/Kostenpositionen, Stationsmengen, Palettentauschangaben sowie des
Bearbeiters ausdrücklich für Dev freigegeben. Die Zurückstellung des
Rechnungs-/Gutschriftsblocks wegen ungeklärter Belegarten bleibt bestehen.
Der aktuelle Dev-Postfachstand wurde konfliktfrei übernommen und bleibt erhalten.
Main und Produktion gehören nicht zum freigegebenen Umfang.

Die Bereitstellung umfasst ausschließlich `fetchDycosTransportOrder` und
`importTransportOrders` im Firebase-Projekt `db-bpl-drehpunkt-dev` sowie das
Frontend über den Branch `dev`. Keine Rules-, Index- oder Secret-Änderungen.
Vor Bereitstellung bestanden Lint, Build, Shared-Prüfung, 37 fokussierte
Unit-Tests und die vollständige 19-Tests-Emulator-Suite auch nach Zusammenführung
mit dem aktuellen Dev-Stand. Anschließend erfolgt der Live-Test durch den Nutzer:
TA erneut abrufen, Partnerergänzungen/Abweichungen und neue Auftragsdetails prüfen.
Bestehende Aufträge erhalten die zusätzlichen Angaben beim erneuten Abruf;
eine rückwirkende Massenübernahme ist nicht Teil dieser Veröffentlichung.


## 23. Auftrag direkt im Auftragsblatt aktualisieren

Ein einzelner Button „Auftrag aktualisieren“ steht über der Streckenkarte.
Er verwendet den bestehenden authentifizierten TA-Abruf mit der Nummer des
offenen Auftrags. Sichtbarkeit und Aufruf bleiben an `dataImports: edit`
gebunden; bloße Bearbeitungsrechte für Transportaufträge genügen nicht.
Nach erfolgreichem Abruf werden Auftrag, Route, Tracking und verknüpfte
Partnerdaten neu geladen. Die bestehenden Importregeln zum Erhalt manueller
Angaben und zur Konfliktanzeige bleiben maßgeblich.

Während einer Anfrage ist der Button gesperrt. Unterbrochene Antworten werden
mit derselben Anfrage-ID wiederholt; nach einem abgeschlossenen Abruf führt der
nächste Klick einen neuen Quellenabruf aus. Ergebnis, Partnerergänzungen und
Warnungen werden direkt am Button angezeigt. Ein Fehler beim Nachladen der
Ansicht wird ausdrücklich von einem fehlgeschlagenen Import unterschieden.
Die Importseite und der neue Button verwenden dieselben Rückmeldungen.

Browserprüfung mit synthetischen Daten: Doppelklick nur ein Abruf, aktualisiert,
unverändert, Verbindungsfehler mit stabiler Wiederholungs-ID, neue Anfrage nach
Erfolg, Partnerhinweise, Nachladefehler und fehlende Rechte. DE/EN geprüft.
Keine zusätzlichen Backend-Funktionen oder SQL-Abfragen erforderlich.
Der Nutzer hat die Dev-Veröffentlichung dieses Buttons anschließend ausdrücklich freigegeben.
Es handelt sich ausschließlich um eine Frontend-Ergänzung; keine erneute
Firebase-Bereitstellung ist dafür erforderlich. Main und Produktion bleiben unberührt.


## 24. Kompakte Stammdatenhistorie statt zusätzlicher Importkarte

Die Karte „Weitere importierte Daten“ entfällt. Ihre Angaben werden nicht
entfernt: IBAN/BIC/Prüfdatum stehen weiterhin in Abrechnung, die DyCoS-Anlage
im Kopf des Stammdatenblatts. Konflikthinweise bleiben unabhängig davon sichtbar.
Im Drei-Punkte-Menü öffnet „Historie“ ein Modal mit genau drei Spalten:
Datum/Uhrzeit/Person, alte Daten und neue Daten. Das Menü ist auch ohne
Zusammenführungsrecht und auf archivierten Blättern für Stammdaten-Leser
verfügbar; Zusammenführungsaktionen bleiben separat geschützt.

Neue Blätter erhalten genau einen Anlageeintrag mit Akteur und Zeitpunkt,
ohne vollständige Startwerte. Initiale DyCoS-Anreicherung zählt nicht als zweite
Änderung. Erst spätere tatsächliche Änderungen erhalten Vorher-/Nachher-Werte
unter `metadata.changes` (Pfad, lesbare Bezeichnung, Kategorie, alter/neuer Wert).
Leere Werte werden als Gedankenstrich dargestellt; false und 0 bleiben echte
Werte. Ein manueller Speichervorgang wird über eine gemeinsame operationId in
einer Tabellenzeile gebündelt, auch wenn die vorhandenen CRM-Kategorien mehrere
Historiedokumente benötigen. Unverändertes Speichern erzeugt keinen Eintrag.
Portal-Zugangsdaten werden ausschließlich als „Geschützt“ historisiert.

Manuelle Neuanlage und Änderung speichern Daten und Historie atomar. Die
vorhandenen TA-, Kunden- und Unternehmerimportwege protokollieren ebenfalls
Akteur und tatsächliche Feldänderungen. Verglichene, aber bewusst nicht
überschriebene Konflikte werden nicht als Datenänderung dargestellt.
Die Historie lädt erst beim Öffnen und in Seiten mit 50 Dokumenten, direkt
für dieses Stammdatenblatt; allgemeine CRM-Aktivitäten/Bewertungen werden nicht
hineingemischt. Bestehende CRM-Historien bleiben erhalten. Ältere Formate mit
vorhandenen Vorher-/Nachher-Daten und Zusammenführungsentscheidungen werden
angezeigt. Ohne damals protokollierte Werte steht „Nicht protokolliert“;
es werden keine alten Daten oder Personen nachträglich erfunden.

Prüfung: gezielte Unit-Tests für Feldänderungen, Leerwerte, false/0,
Kontaktidentität, geschützte Zugangsdaten, Legacyformate und Gruppierung.
Zusätzlich echte Browser-Speicherlogik gegen lokalen Firestore-Emulator:
Anlage, Bearbeitung, unverändert, Akteur sowie Leser-/Schreibschutz. Bestehende
TA-/Kunden-/Unternehmer-Integrationsprüfungen ebenfalls erfolgreich.
Browserprüfung mit Beispieldaten: DE/EN, Light/Dark, kompakte Anlage,
Nachladen älterer Einträge, Ladefehler, Escape und Fokus-Rückgabe.
Kein Dev-Push, kein Cloud-Deployment und keine Main-Änderung für diese Ergänzung.

Abschlussprüfung: 45 fokussierte Unit-Tests und 29 Emulator-Integrationsprüfungen
bestanden; Lint, Build und Shared-Prüfung erfolgreich. Die bekannte
Chunkgrößenwarnung ist unverändert vorhanden.


## 25. Freigabe zur Veröffentlichung der Stammdatenhistorie auf Dev

Der Nutzer hat die Veröffentlichung der kompakten Stammdatenhistorie ausdrücklich
freigegeben. Bereits auf Dev veröffentlichte Postfach- und Qualitätsänderungen
wurden zuvor übernommen. Die Historie verwendet weiterhin die bestehenden
Stammdatenrechte; keine Änderung an Rules, Indizes oder Secrets.

Neben dem Frontend werden ausschließlich diese Funktionen im Projekt
`db-bpl-drehpunkt-dev` aktualisiert, damit auch die bestehenden Importwege
Akteur und tatsächliche Vorher-/Nachher-Werte protokollieren:
`fetchDycosTransportOrder`, `importTransportOrders`, `processCustomerImport`,
`approveCustomerImportRow`, `processCarrierImport`, `approveCarrierImportRow`.
Main und Produktion bleiben außerhalb der Freigabe.

Für den anschließenden Live-Test: Stammdatenblatt öffnen, über die drei Punkte
„Historie“ wählen und eine kleine Änderung speichern. Alte und neue Werte
sowie die Person müssen erscheinen; unverändertes Speichern erzeugt keinen
zusätzlichen Eintrag. Neuanlagen zeigen nur den Anlageeintrag. Fehlende alte
Historienwerte werden nicht rückwirkend ergänzt oder erfunden.


## 26. Dieselbe kompakte Historie für Transportaufträge

Das Drei-Punkte-Menü oben rechts im Auftragsblatt öffnet „Historie“ mit den
Spalten Zeitpunkt/Person, alte Daten und neue Daten. Stammdaten und Aufträge
verwenden dieselbe Dialogdarstellung. Die Historie lädt beim Öffnen in Seiten
mit 50 Dokumenten und benötigt ausschließlich Transportauftrags-Leserechte;
Datenimportrechte sind nur für „Auftrag aktualisieren“ erforderlich.

Die vorhandenen serverseitigen Feldänderungen des CSV-Imports und des
DyCoS-Einzelabrufs werden anhand ihrer importRunId zu einem Abruf zusammengefasst.
Auch ältere bereits gespeicherte Änderungen durch „Auftrag aktualisieren“
werden angezeigt. Neue API-/CSV-Aufträge erhalten einen einzelnen atomaren
Anlageeintrag ohne Startwerte. Für frühere Aufträge wird die belegte Anlage aus
createdAt/createdByName angezeigt. Unveränderte Abrufe erzeugen keinen Eintrag.

Stations- und Preisarrays werden in lesbare einzelne Felder aufgelöst,
einschließlich Mengen, Palettentausch und einzelner Kosten-/Ertragspositionen.
Doppelte Positionen bleiben erhalten. Technische Quell-IDs, Schemazähler und
Belegreferenzen werden nicht als fachliche Änderungen ausgegeben; eine Änderung
des erfassenden DyCoS-Bearbeiters ist sichtbar. Fehlende alte Werte erscheinen
als Gedankenstrich, explizite 0/false bleiben Werte. Beträge erscheinen in EUR.
Der bestehende Trackingverlauf bleibt der Verlauf der Sendungsverfolgung;
die neue Historie zeigt die importierten Auftragsdaten.

Prüfung: 18 fokussierte Unit-Tests, 20 bestehende/erweiterte API-/CSV-
Integrationsprüfungen sowie ein echter Browser-SDK-Emulatortest mit Anlage,
Bearbeitung, unverändertem Speichern, Historien-Leserechten, schreibgeschützter
Auftragshistorie und Pagination bestanden. Browserprüfung mit Beispieldaten:
beide Historien, DE/EN, Light/Dark, kompakte Anlage und Nachladen ohne doppelten
Anlageeintrag. Lint, Build und Shared-Prüfung erfolgreich; bekannte
Chunkgrößenwarnung unverändert. Keine neue Dev-/Main-Veröffentlichung durchgeführt.


## 27. Dev-Freigabe der Auftragshistorie

Der Nutzer hat die Auftragshistorie ausdrücklich zur Veröffentlichung auf Dev
freigegeben; Main und Produktion bleiben unberührt. Die aktuelle Dev-Anpassung
der Postfachoberfläche wurde übernommen. Der Umfang enthält das gemeinsame
Historienmodal für Stammdaten/Aufträge und ausschließlich die beiden
Importfunktionen `fetchDycosTransportOrder` und `importTransportOrders` im
Firebase-Projekt `db-bpl-drehpunkt-dev`. Keine Rules-, Index- oder Secret-Änderung.

Für den Live-Test: Auftragsseite neu laden, Drei-Punkte-Menü → Historie öffnen.
Nach einem Abruf über „Auftrag aktualisieren“ sind tatsächliche Änderungen mit
alten/neuen Werten und Person sichtbar; ein unveränderter Abruf ergänzt keinen
Eintrag. Alte bereits gespeicherte Importänderungen erscheinen ebenfalls.

## 28. Eigenständiger Stammdatenabruf ohne Transportauftrag

Am 29.10.2026 wurde in der Power-Automate-Lösung „BPL Drehpunkt“ der Flow
„Drehpunkt – DyCoS Stammdaten abrufen“ angelegt (ID
`0a4c748a-e0d3-f111-84ea-6045bd93bcb8`). Aktueller Stand: nach ausdrücklicher
Nutzerfreigabe veröffentlicht; die vorhandene technische Anwendung
„Drehpunkt DyCoS – Dev“ ist zusätzlich zum Besitzerkonto als Aufrufer zugelassen.
Die Veröffentlichung wurde im Designer bestätigt. Echte Abrufprüfungen wurden
anschließend erfolgreich abgeschlossen (siehe unten). Die vorherige
Entwurfsprüfung meldete 0 Fehler und 0 Warnungen;
eine erst beim Veröffentlichen erkannte Einschränkung wurde korrigiert:
Der Trigger unterstützt kein JSON-Schema-`pattern`. Das Schema prüft Typ und
Länge; die separate Bedingung prüft Integer und Wertebereich vor der SQL-Abfrage.
Der bisherige TA-Flow wurde nicht verändert.

Anfrage: POST mit `{"typ":"kunde","nummer":"18618"}` beziehungsweise
`{"typ":"utn","nummer":"74321"}`. Die Nummer ist eine Ziffernfolge als Text
im Wertebereich einer nicht negativen SQL-Int32-Zahl. Die Abfrage verwendet
`Adressstamm.Debitorennummer` oder `Unternehmerstamm.Kreditorennummer` und
höchstens zwei Treffer. Es werden gezielt die bereits unterstützten Stamm-,
Kontakt-, Bank- und Zahlungsbedingungsfelder ausgewählt; kein Kreditlimit,
keine Zugangsdaten und keine vollständigen Datenbankzeilen.

Erfolg: `schemaVersion: 1`, `typ`, normalisierte `nummer`, `partner` und
`zahlungsbedingung` (gegebenenfalls null). Antworten unterscheiden 400 für
ungültige Eingaben, 404 für keinen Treffer, 409 für mehrdeutige Nummern und
500 für technische Fehler mit Flow-Lauf-ID. Der Flow liest SQL und schreibt
selbst keine Drehpunkt-Daten.

Verbindliche Abgrenzung des Nutzers: Der Gegenpartner wird nicht zusätzlich
abgefragt oder angelegt. Nur die bereits am angefragten Datensatz vorhandene
interne Referenz (`UnternehmerID` beim Kunden, `KundenID` beim Unternehmer)
darf zum Abgleich mit einem bereits vorhandenen Drehpunkt-Partner dienen.
Bei sicherer Zuordnung wird dieser um die angefragte Rolle/Nummer und leere
Felder ergänzt. Bestehende abweichende Werte bleiben erhalten und werden
gemeldet; das Kreditlimit bleibt in Drehpunkt gepflegt. Eine unsichere
Zuordnung darf keine automatische Zusammenführung auslösen.

Die Drehpunkt-Anbindung muss dafür dauerhafte Quell-IDs je
Debitoren-/Kreditorenreferenz erhalten und die vorhandenen Rechte-,
Konflikt- und Historienregeln wiederverwenden. Die lokale Umsetzung ist in
Abschnitt 29 beschrieben; ihre Veröffentlichung steht noch aus.

### Reale Stammdaten-Abrufprüfung vom 29.10.2026

Die technischen Zertifikatsanmeldedaten wurden wiederverwendet. Alle 20
unterschiedlichen Partner aus den 13 bestehenden TA-Beispielen wurden einzeln
abgerufen: 11 Kunden und 9 Unternehmer, jeweils HTTP 200 mit korrekter Rolle,
Nummer, Quell-ID und Antwortstruktur. Sämtliche zurückgegebenen Fachfelder
stimmen mit den vorhandenen Beispielantworten überein. Auch alle 23
Zahlungsbedingungszuordnungen der Beispiele stimmen hinsichtlich ID und
Bezeichnung überein. Laufzeit der erfolgreichen Partnerabrufe: 2,21–2,66 Sekunden
in dieser Stichprobe. Es wurde kein Gegenpartner zusätzlich abgefragt.

Zusätzlich bestanden: Aufruf ohne Token → 401, `abc` als Nummer → 400
`INVALID_REQUEST`, nicht vorhandene Nummer `2147483647` → 404
`PARTNER_NOT_FOUND`. Insgesamt 23 erfolgreiche HTTP-Prüfungen nach Korrektur.
Der 409-Zweig wurde mangels eines bekannten echten Mehrfachtreffers nicht
live ausgelöst. Keine Daten in Drehpunkt angelegt oder geändert.

Der erste echte Kundenabruf deckte einen Fehler der Antwortaufbereitung auf:
Power Automate unterstützt `removeProperty` nicht für den Eigenschaftsnamen
`@odata.etag` mit Punkt. Die Entfernung dieser Connector-Metadaten entfällt;
die ausgewählten Fachfelder bleiben begrenzt. Nach Korrektur wurde erneut
veröffentlicht und die vollständige Serie erfolgreich wiederholt. Der
technische Fehler wurde zuvor korrekt als HTTP 500 mit `FLOW_FAILED`
zurückgegeben. Hinweis: Ein behandelter Fehler kann im Power-Automate-Verlauf
als erfolgreicher Ablauf erscheinen; für den Aufrufer zählt der HTTP-Status.
Rohantworten, Abrufadresse und Testskripte liegen ausschließlich im vorhandenen
geschützten lokalen Testverzeichnis außerhalb des Repositorys.

## 29. Standalone-Stammdatenabruf in Drehpunkt

Lokal implementiert am 29.10.2026, noch nicht auf Dev veröffentlicht. Main und
Produktion bleiben unberührt. Auf „Kunden & Unternehmer“ können Benutzer mit
Stammdaten-Bearbeitungsrechten Kunde/Unternehmer auswählen, eine Debitoren- oder
Kreditorennummer eingeben und „Abrufen und übernehmen“ wählen. Das Ergebnis
verlinkt direkt zum effektiven Stammdatenblatt. Datenimportrechte allein
berechtigen nicht zur Übernahme von Stammdaten.

Die neue Callable `fetchDycosMasterData` verwendet App Check, aktive Benutzerprofile
und serverseitige Stammdatenrechte. Sie verwendet dieselbe Zertifikatsidentität
wie der TA-Abruf, aber die separate Secret-Konfiguration
`DYCOS_MASTER_DATA_FLOW_URL`. Der bestehende Flow-URL-Secret bleibt unverändert.
Die Adresse liegt bereits im geschützten lokalen Testverzeichnis und darf
weder in Frontend-Konfiguration noch in Git übernommen werden.

Zuordnung: exakte angefragte Kontonummer einschließlich vorhandener Aliasnummern,
gespeicherte angefragte DyCoS-ID und gegebenenfalls die bereits im angefragten
Datensatz enthaltene Gegenreferenz. Unterschiedliche Zielpartner, mehrere
Treffer, defekte Merge-Weiterleitungen oder widersprüchliche gespeicherte
Konten-/SQL-ID-Zuordnungen stoppen die Übernahme atomar. Es wird kein Gegenpartner
bei DyCoS abgefragt oder aus dessen Referenz angelegt. Fehlt eine passende
gespeicherte Quell-ID, kann eine Gegenreferenz nicht sicher zugeordnet werden;
darauf weist das Ergebnis ausdrücklich hin. Firmennamen sind kein Matchkriterium.

Bestehende manuelle Daten, Kreditlimit und Einstellungen bleiben erhalten.
Leere Felder werden mit dem bestehenden DyCoS-Adapter ergänzt, abweichende Werte
im vorhandenen Konflikthinweis angezeigt. Die angefragte Rolle und Nummer
werden ergänzt; weitere Kontonummern bleiben als Alias erhalten. Dauerhafte
Kontenreferenzen liegen unter `dycosReferences.accounts` als
`{entity, number, sourceId}`. Der TA-Abruf behält zuvor bekannte Quell-IDs bei;
Partnerzusammenführungen erhalten die Kontenreferenzen beider Seiten.

Speicherung und Historie erfolgen gemeinsam in einer Transaktion. Neuanlagen
erhalten nur einen kompakten Anlageeintrag, Ergänzungen tatsächliche
Vorher-/Nachher-Werte mit Zeitpunkt und Person. Unveränderte Abrufe und reine
Konflikthinweise erzeugen keinen zusätzlichen Änderungseintrag. Benutzerrechte
werden vor dem Speichern erneut geprüft. Gleichzeitige Abrufe derselben Nummer
sind gesperrt; eine wiederholte Anfrage-ID liefert das bereits gespeicherte
Ergebnis zurück. Das gemeinsame Abruflimit mit TA-Abrufen beträgt zehn pro
Benutzer und Minute. Fehlgeschlagene Abrufe legen keine leeren Partner an.
Technische Fehler und Zuordnungskonflikte erscheinen unter „DyCoS-Stammdatenabruf“
in der bestehenden Diagnose, ohne Rohantworten oder Zugangsdaten.

Prüfung: gezielte Client-, Mapping-, Rechte-, Transaktions-, Merge- und
Historienprüfungen im lokalen Firestore-Emulator bestanden. Dazu gehören
Gegenreferenz-Erweiterung, neue Aliasnummern, Merge-Weiterleitungen, Erhalt
manueller Angaben/Kreditlimits, kompakte Historie, Wiederholungen, Parallelabruf,
Rechteentzug während des Abrufs und tatsächliche Diagnoseeinträge. Alle 20
bereits authentifiziert abgerufenen Beispielpartner wurden lokal gespeichert
und erneut übernommen (40 erfolgreiche Übernahmen). Browserprüfung der echten
Komponente mit isolierten Testantworten: Kunde/Unternehmer, Erfolg mit
Konflikthinweis, nicht gefunden, Leserechte sowie DE/EN und Hell/Dunkel.
Lint, Build und Shared-Modulprüfung bestanden; bekannte Build-Chunkwarnung bleibt.

Für eine spätere ausdrücklich freigegebene Dev-Veröffentlichung:

- Neues URL-Secret ausschließlich im Projekt `db-bpl-drehpunkt-dev` hinterlegen.
- `fetchDycosMasterData` bereitstellen; außerdem `fetchDycosTransportOrder`
  für den Erhalt der Quellreferenzen und `listDiagnosticsPage` für den neuen
  Diagnosefilter aktualisieren. Die vorhandenen Merge-Endpunkte mit der
  erweiterten Kontenreferenz-Erhaltung gemeinsam berücksichtigen.
- Frontend gesammelt auf Dev veröffentlichen. Für den gemeinsamen XML-Export
  zusätzlich die Rules mit geschützten Konten-/Quell-ID-Feldern bereitstellen.
  Keine neuen zusammengesetzten Indizes erforderlich; neue Abrufbelege und
  Sperren sind ausschließlich serverseitig zugänglich.
- Im Live-Test eine bekannte Nummer übernehmen, dasselbe Blatt erneut abrufen
  und anschließend die kompakte Historie und gegebenenfalls Konflikte prüfen.


## 30. Zentraler Stammdatenabruf statt CSV-Oberfläche

Am 30.10.2026 lokal angepasst: Der vorhandene DyCoS-Stammdatenabruf ist nur
noch unter „Stammdaten importieren“ verfügbar. Die Kunden-/Unternehmerübersicht
behält den Link zur Importseite; das dortige Abrufformular entfällt.
CSV-Auswahl, Uploaddialog und Uploadverarbeitung wurden aus der Importseite
entfernt. Bisherige Kunden- und Unternehmerprüfungen, Importläufe,
Vergleiche und Zusammenführungen bleiben erreichbar. Fehlermeldungen älterer
Importzeilen verweisen auf den direkten Abruf statt auf einen erneuten CSV-Upload;
der Abruf erledigt diese alten Prüfzeilen nicht automatisch.
Die bestehende Übernahme-, Konflikt- und Historienlogik sowie die bestehenden
Berechtigungsprüfungen werden wiederverwendet. Keine Änderung am Flow oder
an Main; keine Veröffentlichung im Rahmen dieser Anpassung.


## 31. Transportauftragsimport ausschließlich über DyCoS in der Oberfläche

Am 30.10.2026 lokal angepasst: Auf der Transportauftrags-Importseite entfallen
CSV-Button, Dateiauswahl, Uploaddialog und die zugehörige CSV-Verarbeitung.
Der direkte Abruf per TA-Nummer verwendet unverändert den vorhandenen Flow
und aktualisiert nach der Übernahme den Importverlauf. Bestehende CSV- und
API-Importläufe samt Fehlern und Detailansicht bleiben erhalten; historische
CSV-Bezeichnungen beschreiben weiterhin die damalige Datenquelle.
„Auftrag aktualisieren“, bestehende Aufträge, Historie und Berechtigungen
bleiben erhalten. Die serverseitigen CSV-Funktionen werden durch diese reine
Oberflächenumstellung nicht entfernt. Kein Push oder Deployment, Main unberührt.


## 32. Such-Flow für den Sammelimport nach Ladedatum

Am 30.10.2026 in „BPL Drehpunkt“ erstellt und nach ausdrücklicher Freigabe der
technischen Anwendung veröffentlicht: **Drehpunkt – DyCoS Aufträge suchen**.
Flow-ID: `b02f2f53-60d4-f111-84ea-6045bd93bcb8`.
Die bestehende SQL-Verbindungsreferenz `new_SQLDatenbankDPL` wird wiederverwendet.
TA-Einzelabruf, Stammdaten-Flow, Strukturtest, Drehpunkt-Frontend und Main werden
hierdurch nicht verändert. Es erfolgen ausschließlich SQL-Lesezugriffe.

### Authentifizierung und Anfrage

HTTP POST mit bestehender Zertifikatsanmeldung für die Flow-Service-Audience.
Aufrufer sind ausschließlich der bestehende Besitzer und die ausdrücklich
bestätigte Service-Principal-Objekt-ID
`9e4a1b27-1461-46eb-b309-1dbbd5fadb79`.
Die Aufrufadresse liegt außerhalb des Repositorys in der geschützten Datei
`C:/Users/domin/.codex/secrets/drehpunkt-dycos-dev/order-search-flow-url.txt`.
Für die spätere Drehpunkt-Anbindung ist ein eigenes URL-Secret vorzusehen;
die vorhandenen TA-/Stammdaten-URLs bleiben unverändert.

Beispielanfrage:

```json
{
  "ladeDatumVon": "2026-11-02",
  "ladeDatumBis": "2026-11-02",
  "relationId": 8,
  "nachId": 0
}
```

Beide Datumswerte sind Pflicht und müssen gültige, unveränderte ISO-Kalendertage
`JJJJ-MM-TT` sein; Von darf nicht nach Bis liegen. Beide Tage sind eingeschlossen.
Der Bezug ist `Auftraege.Ladedatum`. Relation ist optional: weglassen oder null
bedeutet kein Relationsfilter. `relationId` ist die interne `Relationen.ID`,
**nicht** Relationsnummer oder der führende Code der Bezeichnung. `nachId` ist
ein optionaler numerischer Fortsetzungswert, Standard 0. JSON-Schema schränkt
Relation und Cursor auf Ganzzahlen von 0 bis 2147483647 ein.

### Begrenzte SQL-Abfragen und Fortsetzung

- Aufträge nach Ladedatum, optional RelationsID, und ID größer nachId; sortiert
  nach ID aufsteigend. Es werden 16 Kandidaten gelesen und maximal 15 geliefert.
- Kunden-, Touren-, Stations- und Relationsfilter werden nur aus diesen 15
  Aufträgen erzeugt. Wiederholte IDs werden für Lookupfilter dedupliziert.
- Kunden: ID, Firma, Debitorennummer; Touren: ID, UnternehmerID;
  Unternehmer: ID, Bezeichnung, Kreditorennummer; Relationen: ID, Nummer, Bezeichnung.
- Stationen nur für die gefundenen Aufträge: ID, AuftragsID, Lade_Entladestelle,
  Zeile_In_Auftrag, Firma, Strasse, PLZ, Ort, Land, Ankunft; stabile Sortierung
  nach AuftragsID, Zeile_In_Auftrag und ID.
- Keine Bank-/Kontakt-/Preis-/Rechnungsdaten. Keine zusätzlichen Gegenpartner.
  Leere Zuordnungslisten erzeugen einen Filter ohne Treffer statt einer
  unbeschränkten Tabellenabfrage.

Der echte Connector-Test hat zwei Einschränkungen gezeigt: Direkte Datums-
literale erzeugten Text-/DateTime-/DateTimeOffset-Typfehler. Der produktive
Filter vergleicht deshalb den Kalendertag über die unterstützten OData-
Funktionen year/month/day als YYYYMMDD-Zahl direkt in der SQL-Connector-Abfrage.
Das ist keine nachträgliche Filterung einer unbeschränkt abgerufenen Tabelle;
die Nutzung eines Datumsindexes durch diese Kalenderfunktionen ist jedoch nicht
belegt. Laufzeiten bei größeren Datenmengen weiter beobachten.

Zusätzlich gilt ein OData-Ausdruckslimit von 100 Knoten. Der erste 50er-
Seitenentwurf überschritt dieses bei mehreren Kunden-IDs; deshalb verwendet
der veröffentlichte Flow bewusst 15er-Seiten. Nicht ohne erneuten Test erhöhen.
Die erste erfolgreiche echte Seite benötigte etwa 12,6 Sekunden.

### Antwort und spätere Drehpunkt-Verarbeitung

HTTP 200 liefert schemaVersion 1, pageSize 15, die Arrays `auftraege`, `kunden`,
`touren`, `unternehmer`, `stationen`, `relationen` sowie `hasMore` und
`nextNachId`. Die Daten sind auf Vorschaufelder begrenzt; SQL-Connector-
Metafelder wie ItemInternalId/@odata.etag können zusätzlich vorkommen.
Aufträge enthalten nur ID, Nummer, Ladedatum, RelationsID, FrachtzahlerID, TourenID.

Drehpunkt setzt daraus die kompakten Zeilen zusammen: FrachtzahlerID → Kunde,
TourenID → Tour → Unternehmer, RelationsID → Relation sowie erste Lade-/letzte
Entladestation anhand Typ und stabiler Stationssortierung. Fehlende Zuordnungen
bleiben leer. Bei hasMore erneut mit identischem Zeitraum/Relation und
nachId = nextNachId suchen; Antworten nach Auftrags-ID deduplizieren. Die Suche
ist keine transaktionale Momentaufnahme paralleler DyCoS-Änderungen.

Ein Lookup mit Connector-nextLink oder mehr als 1.000 Stationszeilen erzeugt
HTTP 422 / SEARCH_PAGE_TOO_LARGE statt einer unbemerkt unvollständigen Vorschau.
Ungültige Datumsbereiche erhalten HTTP 400 / INVALID_REQUEST; Schemafehler können
bereits am Trigger als TriggerInputSchemaMismatch abgelehnt werden.
SQL-/Gateway-/Verarbeitungsfehler erhalten HTTP 500 / FLOW_FAILED.
Ohne Authentifizierung liefert die Plattform HTTP 401. Keine Rohfehlermeldungen
oder SQL-Zugangsdaten in der HTTP-Antwort.

Die spätere Sammelimport-Oberfläche muss alle gewünschten Suchseiten laden,
bevor „Alle markieren“ eine vollständige Auswahl verspricht. Nur ausgewählte
TA-Nummern werden über den vorhandenen vollständigen TA-Abruf übernommen;
Fortschritt, Wiederholungen und das bestehende Abruflimit dabei berücksichtigen.
Die Suche selbst legt noch keine Firestore-Aufträge an.

Echte Beispieldaten und Testskripte bleiben ausschließlich im geschützten
lokalen Secret-Verzeichnis. Der finale Fehlerpfad beendet technische Fehler
nach der HTTP-Antwort mit dem Laufstatus Failed; dadurch erscheinen behandelte
SQL-/Verarbeitungsfehler nicht irreführend als erfolgreiche Suchläufe.

Abschlussprüfung am 30.10.2026: 38 Prüfungen des vollständigen Ablaufs bestanden
(HTTP-Aufrufe und Beispielabdeckung), darunter alle 14 vorhandenen Beispiel-TAs,
ungefilterte Suche, Relation 7/8, unbekannter/umgekehrter Datumsbereich,
Schemafehler, leere Suche und mehrere Seiten ohne überlappende Auftrags-IDs.
Beispiele ohne Stationen bleiben auffindbar. Nach der finalen Veröffentlichung
fünf zusätzliche HTTP-Tests bestanden: gültige Beispielsuche, explizit null als
Relation, ungültiges Datum, Relations-ID außerhalb int32 und negativer Cursor.
Zusätzlich wurde bei 25 gespeicherten Vorschauantworten geprüft, dass sämtliche
Lookup-Zeilen nur zu den jeweiligen Kandidaten gehören. Ausschließlich die
vereinbarten Vorschaufelder und Connector-Metafelder wurden zurückgegeben.
Die letzten erfolgreichen Suchaufrufe benötigten rund 11–14 Sekunden pro Seite.
Designerprüfung nach finaler Veröffentlichung: 0 Fehler, 0 Warnungen.
Kein Git-Push, kein Drehpunkt-/Firebase-Deployment, Main unberührt.

## 33. Sammelimport in Drehpunkt (30.10.2026, lokal umgesetzt)

Die Auftragsimportseite bietet zusätzlich zum einzelnen TA-Abruf eine Suche
nach Ladedatum von/bis mit optionaler Relation. Kompakte Zeilen zeigen TA und
Ladedatum, Kunde, Unternehmer, erste Lade- und letzte Entladestelle. Bereits
vorhandene Aufträge sind gekennzeichnet. Nur ausgewählte Zeilen werden über
den bestehenden vollständigen TA-Abruf übernommen bzw. aktualisiert.

„Weitere Aufträge laden“ ergänzt jeweils eine Suchseite. „Alle markieren“ lädt
zuerst alle verbleibenden Seiten und markiert erst nach erfolgreichem Abschluss
die vollständige Liste. Bei mehr als 5.000 Treffern muss der Zeitraum eingegrenzt
werden; es gibt keine stille Begrenzung mit vermeintlich vollständiger Auswahl.
Fehlende optionale Vorschauangaben bleiben leer. Die Suche schreibt keine
Aufträge oder Partner.

### Jahresgrenze und verbindlicher Abruf

Mit dem Nutzer geklärt: Ladedatum ab **01.01.2026**, spätere Jahre eingeschlossen.
Ein vorhandenes tatsächliches Ladedatum ist maßgebend. Fehlt es, gilt beim
vollständigen Abruf eine TA-Nummer mit gültigem YYMM-Präfix ab 2601 als
Ersatznachweis, z. B. 2612 oder 2701. Ein vorhandenes älteres oder ungültiges
Datum wird dadurch nicht überstimmt. Technische 1899-Basisdaten gelten als
fehlendes Datum. Die Regel gilt serverseitig auch für Einzelabrufe und den
verbliebenen CSV-Import-Endpunkt, nicht nur für Datumsfelder in der Oberfläche.

Die Datumssuche findet ausschließlich Aufträge mit passendem Ladedatum.
Aufträge ohne Ladedatum können weiterhin einzeln über ihre TA-Nummer abgerufen
werden. Vor dem Speichern des Sammelimports wird außerdem die interne
DyCoS-Auftrags-ID aus der Vorschau mit dem aktuellen vollständigen Abruf
verglichen. Ein Identitätswechsel erzeugt einen Fehler statt eines falschen
Imports. Historie, Partnerzuordnung und Tracking verwenden die bestehende
Importverarbeitung und deren Voraussetzungen.

### Fortsetzen, Fehler und Berechtigungen

Aufträge werden nacheinander mit mindestens 6,5 Sekunden zwischen den Starts
abgerufen. Abruflimits werden mit begrenzten automatischen Wiederholungen
beachtet. Ein fachlicher Fehler bei einer TA wird sichtbar protokolliert, die
übrigen ausgewählten Aufträge können weiterlaufen. Bei unklarem Verbindungs-
oder Berechtigungsfehler pausiert die Verarbeitung. Pausieren beendet zunächst
den laufenden Auftrag. Ergebnisse unterscheiden neu, aktualisiert, unverändert
und fehlgeschlagen; Warnungen bleiben sichtbar.

Die Auswahl wird benutzergebunden in diesem Browser gespeichert: TA-Nummer,
interne Auftrags-ID, feste Anfrage-ID, Status und Zeitangaben, keine
Partner-/Stationsvorschauen. Nach Neuladen kann sie fortgesetzt werden. Auch
ein Abruf mit unklarem Ausgang behält seine Anfrage-ID; vorhandene serverseitige
Importbelege verhindern eine doppelte Übernahme. Es ist kein Hintergrunddienst:
Die Seite muss während des Imports geöffnet bleiben.

Aktives Konto und Bearbeitungsrecht für Datenimporte werden vor dem Quellabruf
und nach der Suche bzw. innerhalb der Speichertransaktion erneut geprüft.
Die Suche hat ein separates benutzerbezogenes Limit und eine Sperre gegen
gleichzeitige Suchläufe. Fehler landen bereinigt in der Diagnose, ohne rohe
SQL-Daten, Endpunktadressen oder Zugangsdaten.

### Such-Flow ergänzt und real geprüft

Der bestehende Such-Flow unterstützt zusätzlich `{ "modus": "relationen" }`.
Dieser frühe Zweig liest ausschließlich ID, Nummer und Bezeichnung aus
Relationen und beendet den Lauf ohne Auftragsabfragen. Mehr als 1.000 Relationen
oder ein Connector-Fortsetzungslink erzeugen einen expliziten Fehler. Drehpunkt
verwendet die IDs intern und zeigt die Bezeichnungen zur Auswahl an.
Die Suchvalidierung im Flow lehnt Datumsbereiche vor 2026 ebenfalls ab.
Die bereits freigegebenen technischen Aufrufer bleiben unverändert.

Nach Veröffentlichung dieser Ergänzung drei echte Lesetests bestanden:
Relationskatalog mit 18 Einträgen, abgelehnter Zeitraum vor 2026 und Suche am
02.11.2026 mit Relation 8 (sieben Aufträge). Zusätzlich 45 Modul-/Ablauftests
und 26 Firestore-Emulatortests bestanden. Oberflächenprüfung mit ausschließlich
synthetischen Daten: seitenübergreifendes Alle-Markieren, gezielte Auswahl,
Einzelfehler und Wiederholung mit gleicher Anfrage-ID, Pause/Neuladen/Fortsetzen,
Ansicht ohne Bearbeitungsrecht, Suchfehler sowie deutsche/englische und
helle/dunkle Darstellung. Ein vollständiger Liveimport aus der neuen Oberfläche
steht bis zur Dev-Veröffentlichung noch aus. Build, ESLint und Prüfung der
34 synchronisierten gemeinsamen Module erfolgreich; der Build meldet die
bereits bekannte Warnung zu großen JavaScript-Dateien. Finale Flowprüfung:
0 Fehler, 0 Warnungen.

### Für eine spätere Dev-Veröffentlichung

- Nur im Firebase-Projekt `db-bpl-drehpunkt-dev` das Secret
  `DYCOS_ORDER_SEARCH_FLOW_URL` aus der oben genannten geschützten lokalen
  URL-Datei hinterlegen. Vorhandene Zertifikats-/Anmeldesecrets werden verwendet.
- Functions `searchDycosTransportOrders`, `fetchDycosTransportOrder` und
  `importTransportOrders` mit den synchronisierten gemeinsamen Modulen
  veröffentlichen; der Einzelabruf liefert nun auch die interne Quell-ID.
- Anschließend das Frontend auf Dev veröffentlichen und einen kleinen echten
  Sammelimport prüfen. Keine zusätzlichen Firestore-Regeln oder Indizes nötig;
  die neue Quota-Sammlung ist für direkte Clientzugriffe standardmäßig gesperrt.

In diesem Arbeitsschritt kein Git-Push und kein Firebase-/Drehpunkt-Deployment.
Main bleibt unberührt. Die neue Oberfläche benötigt die genannten Dev-Schritte,
bevor sie dort live nutzbar ist.

## 34. Abweichende Stammdaten direkt entscheiden (30.10.2026)

Lokal ergänzt, noch nicht veröffentlicht: Der Hinweis ist zunächst zugeklappt.
Titel, kurzer Erklärungstext und „Abweichungen anzeigen“ bleiben sichtbar.
Nach Nutzerkorrektur wird **pro Zeile** entschieden: „Übernehmen“ ersetzt nur
den dort gezeigten Wert; „Verwerfen“ erhält nur diesen Drehpunkt-Wert und
erledigt nur diese Abweichung. Andere Zeilen bleiben unabhängig offen.
Leseberechtigte können den Vergleich aufklappen, aber keine Entscheidung treffen.

Die neue Callable `resolveDycosPartnerConflicts` verlangt App Check, ein aktives
Konto und Stammdaten-Bearbeitungsrechte, auch innerhalb der Speichertransaktion.
Sie akzeptiert genau eine Zeile und vergleicht deren angezeigten Stand erneut
mit dem gespeicherten Quellwert und aktuellen Partnerwert. Parallele Änderungen
an dieser Zeile oder archivierte Partner stoppen die Entscheidung; Änderungen
anderer Felder werden erhalten. Ausschließlich freigegebene Vergleichsfelder werden
übernommen, niemals Konten-/Quellidentitäten, Status oder Kreditlimit.
Änderungen und Entscheidung werden atomar mit Zeitpunkt und Person gespeichert;
tatsächliche Änderungen erscheinen in der bestehenden Vorher-/Nachher-Historie.

„Verwerfen“ speichert eine Ablehnung je Partner und Feld, einschließlich
Drehpunkt-Wert und DyCoS-Wert. Dieselben Daten
bleiben auch nach Stammdatenabruf oder „Auftrag aktualisieren“ erledigt; andere
Quellwerte oder zwischenzeitlich manuell geänderte Werte öffnen einen neuen
Vergleich. Vorübergehend fehlende Quelldaten löschen die Entscheidung nicht.
Je Feld bleibt höchstens eine Ablehnung gespeichert; explizites Übernehmen
entfernt eine frühere Ablehnung desselben Feldes. Ansprechpartner werden über stabile IDs statt allein
über ihre Listenposition zugeordnet. Alte Kontaktvergleiche ohne ID und
widersprüchliche Werte aus mehreren Quellen verlangen erneuten Abruf bzw.
manuelle Prüfung statt einer geratenen Übernahme.

Offene Formularänderungen sperren die Entscheidung. Nach Erfolg wird das
Stammdatenblatt neu geladen; die Mitteilung verschwindet bei erledigten
Abweichungen. Technische Speicherfehler werden bereinigt in der Diagnose
unter dem bestehenden Stammdatenmodul erfasst. Keine neuen Rules, Indizes,
Secrets oder Power-Automate-Änderungen notwendig.

Für eine spätere Dev-Veröffentlichung gemeinsam berücksichtigen:
`resolveDycosPartnerConflicts`, `fetchDycosMasterData`,
`fetchDycosTransportOrder`, synchronisierte Shared-Module und Frontend.
Main und veröffentlichter Dev-Stand bleiben in diesem Arbeitsschritt unverändert.

Prüfung des korrigierten Stands: 10 fokussierte Modultests und 38
Firestore-Emulatortests bestanden,
einschließlich realer Wiederholungsabläufe über beide Importpfade, Vergleichs-
änderungen, Kontaktreihenfolge, Rechte, Vorher-/Nachher-Historie und Erhalt von
Status/Kreditlimit. Build, ESLint und Shared-Abgleich erfolgreich (40 Module).
Browserprüfung mit synthetischen Daten: gemischte Entscheidungen pro Zeile, Auf-/Zuklappen,
Leserechte, offene Änderungen, veralteter Vergleich sowie DE/EN und Hell/Dunkel.

## 35. Freigegebene Dev-Veröffentlichung der Zeilenentscheidungen

Am 30.10.2026 hat der Nutzer die Veröffentlichung ausdrücklich freigegeben.
Vorheriger Dev-Stand: `72d533e815c0bc5b1525ff36cbf39d5f6d5c410d`.
Die zwischenzeitlichen Handbuch- und Auftragserfassungsänderungen wurden ohne
Konflikte integriert. Main bleibt auf
`230c2ad86af9700118e2f1456746292241461efc`.

Veröffentlichungsumfang ausschließlich Dev: neue Callable
`resolveDycosPartnerConflicts`, Updates von `fetchDycosMasterData` und
`fetchDycosTransportOrder` sowie das Frontend. Keine Rules-/Index-/Secret-
oder Power-Automate-Änderungen. Gemeinsame Helper sind synchronisiert
(40 Module). Die gespeicherten Ablehnungen werden bei beiden Importpfaden
berücksichtigt, auch bei vorübergehend fehlenden Quellfeldern.

Nach Integration erneut bestanden: zehn Modultests, 38 Firestore-Emulatortests,
vollständiger ESLint-Lauf und Build. Bekannte Build-Chunkgrößenwarnung bleibt.
Der angemeldete Livecheck kontrolliert die zeilenweisen Schaltflächen und
das Auf-/Zuklappen am Beispielpartner 13213. Dessen fachliche Entscheidungen
bleiben beim Nutzer; keine echten Werte allein für eine Veröffentlichungsprobe
übernehmen oder verwerfen.

Ein Frontend-Rollback ist zum oben genannten vorherigen Dev-Stand möglich.
Die neuen Metadaten und Callable bleiben dabei abwärtskompatibel; vorhandene
Ablehnungen und Historieneinträge werden durch ein Frontend-Rollback nicht
gelöscht. Der endgültige Bereitstellungsnachweis folgt im Abschlussfeedback,
damit kein zweiter Vercel-Build allein für ein Statusprotokoll ausgelöst wird.

## 36. Stammdatenblatt über das Aktionsmenü aktualisieren

Am 30.10.2026 ausdrücklich zur Umsetzung und Dev-Veröffentlichung freigegeben.
Das Drei-Punkte-Menü des aktiven Stammdatenblatts enthält für Nutzer mit
Stammdaten-Bearbeitungsrecht „Aktualisieren“. Bei genau einer gültigen
gespeicherten Kontonummer startet der Abruf sofort. Bei mehreren Debitoren-,
Kreditoren- oder Aliasnummern wird zuerst die konkrete Quelle ausgewählt.
Keine Gegenreferenz aus DyCoS wird zusätzlich abgefragt. Ohne gültige Nummer
bleibt die Aktion mit Erklärung deaktiviert; archivierte Blätter sind gesperrt.

Der bestehende Stammdatenabruf wird wiederverwendet. Leere Felder werden
ergänzt, manuelle Angaben und Kreditlimit erhalten, neue Abweichungen im
bekannten Vergleich angezeigt. Verworfene Vergleiche bleiben berücksichtigt.
Das Stammdatenblatt wird nach erfolgreichem Abruf einschließlich Historien-
und Konfliktstand neu geladen. Während des Abrufs sind Änderungen gesperrt;
offene Formularänderungen verhindern einen Refresh. Fehlgeschlagene Versuche
behalten ihre Anfrage-ID, damit eine bestätigte Übernahme nicht doppelt läuft.

Die Anfrage enthält zusätzlich `expectedPartnerId`. Der Server prüft vor dem
Quellabruf, dass das aktive Blatt die angefragte Kontonummer besitzt, und
innerhalb der Speichertransaktion nochmals die konkrete Partnerzuordnung.
Gelöschte, zusammengeführte, zwischenzeitlich anders zugeordnete oder nicht
mehr berechtigte Ziele führen zu einem Fehler statt zur Anlage eines
Ersatzpartners oder Aktualisierung eines anderen Blatts. Alte Aufrufer ohne
dieses optionale Feld bleiben kompatibel.

Gezielte Bereitstellung: `fetchDycosMasterData` im Projekt
`db-bpl-drehpunkt-dev`, danach Frontend gemeinsam auf `dev`. Keine neuen
Secrets, Rules, Indizes oder Power-Automate-Änderungen. Neuere parallele
Qualitätsänderungen aus Dev werden erhalten; Main bleibt unberührt.

Vor Veröffentlichung bestanden elf Modultests und 19 Firestore-Emulatortests,
darunter erfolgreiche Wiederholung, fremde/fehlende Zielpartner, Löschung
während des Abrufs, geänderte Kontonummer, manuelle Werte, verworfene Konflikte
und Historie. Vollständiger ESLint-Lauf, Build und Shared-Abgleich erfolgreich
(41 Module); bekannte Build-Chunkgrößenwarnung bleibt. Implementierungscommit:
`693ef9e`. Vorheriger Dev-Stand: `53e4c0456a0e20aebe758b379b671f78f78e741e`.

## 37. Kunde und Unternehmer gemeinsam aktualisieren

Nutzerkorrektur am 30.10.2026, einschließlich ausdrücklicher Dev-Freigabe:
„Aktualisieren“ liest ohne Auswahl beide vorhandenen Stammdatensätze. Der
Auswahldialog aus Abschnitt 36 entfällt. Maßgeblich sind die gespeicherte
Debitoren-Hauptnummer und Kreditoren-Hauptnummer, nicht zusätzlich vorhandene
Aliasnummern oder erst in DyCoS gefundene Gegenreferenzen. Bei einer Rolle
wird nur diese gelesen. Fehlt eine Hauptnummer, darf eine einzige eindeutig
gespeicherte Rollenreferenz verwendet werden; mehrere mögliche Referenzen
ohne Hauptnummer werden nicht geraten.

Die neue Callable `refreshDycosMasterData` verwendet denselben Stammdaten-Flow
und dieselben Secrets. Beide lesenden Aufrufe können parallel laufen. Erst
nach vollständigem Erfolg werden ihre Daten gemeinsam geprüft und atomar auf
das bestehende Blatt angewendet. Kein zweiter Abruf überschreibt den Vergleich
des ersten. Gleichlautende Angaben und eindeutig gelieferte Werte ergänzen
leere Felder; manuelle Werte, Kreditlimit und bestehende Entscheidungen bleiben
erhalten. Widersprüchliche Quellen erzeugen einen sichtbaren Konflikt und
keinen durch Abrufreihenfolge bestimmten Gewinner. Tatsächliche Änderungen
erhalten gemeinsam einen Vorher-/Nachher-Eintrag mit Person und Zeitpunkt.

Bei Fehler eines Stammdatenabrufs wird kein Teilergebnis gespeichert. Aktives
Konto und Stammdaten-Bearbeitungsrecht werden vor Abruf und beim Speichern
geprüft. Die Hauptkonten-/Partnerzuordnung wird vor dem Speichern erneut geprüft.
Kontensperren werden mit Einzelimporten geteilt, beide Abrufe zählen zum
bestehenden gemeinsamen Limit. Benutzergebundene Refresh-Belege erkennen
Wiederholungen derselben Anfrage-ID ohne weitere Quellabfragen. Neue Belege
bleiben durch die bestehenden Regeln für direkte Clientzugriffe gesperrt.

Veröffentlichung ausschließlich Dev: `refreshDycosMasterData` mit bestehenden
Secrets, synchronisierten Shared-Modulen und Frontend. Bestehender Einzelabruf
und ältere Clients bleiben kompatibel. Keine Änderungen an Power Automate,
Rules, Indizes oder neuen Zugangsdaten. Main bleibt unberührt.

Geprüft: zwölf Modultests und 25 Firestore-Emulatortests bestanden, einschließlich
beider Rollen, Ein-Rollen-Partnern, Ablehnungen, widersprüchlichen Quellen,
Teilfehlern, unveränderten Wiederholungen, Quoten, Parallelaufrufen und
Rechte-/Kontenänderungen während des Abrufs. Vollständiger ESLint-Lauf, Build
und Shared-Abgleich erfolgreich (42 Module). Bekannte Build-Chunkwarnung bleibt.

## 38. Verständlicher Hinweis bei widersprüchlichen Quellen

Am 30.10.2026 zur Dev-Veröffentlichung freigegeben: Bei widersprüchlichen
Kunden-/Unternehmerangaben lautet der Hinweis nun „Kunden- und Unternehmerdaten
widersprechen sich in einzelnen Feldern. Bitte diese Angaben prüfen.“
Ein erneuter Abruf wird hier nicht mehr als Lösung nahegelegt. Alte
Ansprechpartnervergleiche ohne sichere Kontakt-ID behalten einen eigenen,
darauf bezogenen Hinweis. Die Meldung bei einer nicht automatisch möglichen
Übernahme verweist auf die manuelle Prüfung. Übernahme-, Verwerfungs-, Rechte-
und Historienregeln bleiben unverändert. Reine Frontend-Veröffentlichung auf
Dev; keine Functions-, Flow-, Secret- oder Main-Änderung erforderlich.

## 39. CSV-Import technisch entfernt (31.10.2026, Dev-Freigabe)

Die CSV-Dateileser für Kunden, Unternehmer und Transportaufträge einschließlich
Zeichencodierung, unbenutzter Vorbereitungskomponente und Client-Aufrufen sind
entfernt. Die sechs bisherigen Eingangs-Callables werden nicht mehr exportiert:
`previewTransportOrderImport`, `importTransportOrders`, `previewCustomerImport`,
`importCustomers`, `processCustomerImport`, `processCarrierImport`.

Die gemeinsamen Grunddaten für neu angelegte Partner liegen nun in
`functions/dycosPartnerPayloads.js`. Beide aktuellen DyCoS-Abrufe verwenden diese
unveränderten Grunddaten, einschließlich Tracking-Vorgaben. Regeln zur Prüfung
und Zusammenführung alter Stammdatenzeilen bleiben erhalten.

Keine Datenmigration und keine Löschung von Firestore-Dokumenten. Alte
`customerImportRuns`/`customerImportRows`, `carrierImportRuns`/`carrierImportRows`,
`transportOrderImportRuns` einschließlich Unterzeilen und bestehende
Partner-/Auftragshistorien bleiben lesbar. Offene Stammdaten-Prüfzeilen bleiben
reservierbar und prüfbar; ihre damalige CSV-Herkunft wird weiterhin angezeigt.
Bestehende CSV-Aufträge können wie bisher über DyCoS aktualisiert werden;
fehlende, ausdrücklich erhaltene Altwerte werden nicht entfernt.

Tests der entfernten Dateileser und CSV-Erzeugung entfallen. Neue Emulatorfälle
verwenden bereits gespeicherte Altdaten und prüfen Importverläufe, Berechtigungen,
Reservierungen, konkurrierende Feldänderungen und geprüfte Übernahme mit Historie.
Die aktuellen DyCoS- und Partnerzusammenführungsprüfungen bleiben bestehen.

Dev-Veröffentlichung am 31.10.2026 ausdrücklich durch den Nutzer freigegeben.
Die sechs oben genannten Cloud Functions wurden ausschließlich in
`db-bpl-drehpunkt-dev` gelöscht. Der anschließende Functions-Bestandsvergleich
bestätigt genau diese sechs Löschungen; alle übrigen Funktionen sind erhalten. Andere Functions, Secrets, Power-Automate-Flows, Rules und
Indizes benötigen für diese Bereinigung keine Anpassung. Main und Produktion
bleiben unberührt. Die Relationsspalte wird gemeinsam mit der Bereinigung über Dev veröffentlicht.

Prüfung abgeschlossen: 64 gezielte Backend-Unit-Tests, 38 Client-Unit-Tests und
59 Emulatorprüfungen bestanden (insgesamt 161, ohne übersprungene Fälle).
Dazu gezieltes ESLint, Produktionsbuild und Abgleich der 42 gemeinsamen
Functions-Module bestanden. Der Build meldet weiterhin den bekannten Hinweis
auf große JavaScript-Dateien. Diese erste Prüfung erfolgte lokal gegen den Emulator, vor der späteren
ausdrücklichen Dev-Freigabe. Live-Daten wurden dabei nicht geändert.

Die Veröffentlichung integriert den zwischenzeitlichen Dev-Stand `9f0c0f0`
(Postfach-Erfassung und Antwortvorschläge). Der Import-Konflikt in `index.js`
wurde mit Erhalt der neuen Postfachfunktion und Entfernung der alten
CSV-Importe aufgelöst. Main-Baseline unverändert:
`230c2ad86af9700118e2f1456746292241461efc`.

Die bestehenden DyCoS-, Prüf- und Verlaufsfunktionen behalten ihr Verhalten und
werden für diese Codebereinigung nicht erneut bereitgestellt. Ihr bereinigtes
Quellpaket wird bei einer späteren gezielten Aktualisierung verwendet.
Einzelne alte CSV-Bezeichnungen bleiben als Herkunftsnachweis historischer
Daten erhalten. Vercel-Ergebnis und lesende Browserabnahme werden nach dem
Dev-Push separat verifiziert.

Nach Integration des aktuellen Dev-Stands: 128 gezielte Backend-Unit-Tests,
18 Routenprüfungen und 62 Emulatorfälle erfolgreich. Ein neu hinzugekommener
Postfachtest verwies noch auf den verschobenen Partner-ID-Baustein; dieser
Testverweis wurde korrigiert, anschließend bestanden alle drei Postfachfälle.
Gezieltes ESLint, Build und Shared-Abgleich ebenfalls erfolgreich. Keine
zusätzlichen Verhaltensänderungen an den Postfachfunktionen.

## 40. Neue Feldklärung vom 31.10.2026

Der Nutzer hat die Bedeutung auftragsbezogener Kontakte, Kundenreferenz und
interner/externer Belege erläutert. Ein erneuter lesender Abruf von TA
`260600100`, die vorhandenen Exporte und ein begrenzter Vergleich mit alten
Produktions-CSV-Daten bestätigen wesentliche Zuordnungen. Die Ergebnisse und
verbleibenden Entscheidungen stehen unter
[Feldklärung: Kontakte, Stationsreferenzen und Belege](../reference/dycos-feldklaerung-2026-10-31.md).
Diese Untersuchung verändert noch keine Importregeln oder Live-Daten.

## 41. Bestätigte Auftragsfelder und Trackingempfänger lokal umgesetzt

Am 31.10.2026 vom Nutzer beauftragt, mit Erhalt der bestehenden Ansicht.
Auftragskontakte, Dispositionsbemerkung, Stationsreferenzen und die drei
bestätigten Belegfälle sind lokal umgesetzt. Automatische Trackingempfänger
folgen dem aktuellen TA-Versandziel; manuelle Entscheidungen bleiben erhalten.
Neue Werte werden in den bestehenden Historien nachvollziehbar protokolliert.
Prüfungen, Sonderfälle und erforderlicher späterer Dev-Veröffentlichungsumfang
stehen im [Feldklärungsdokument](../reference/dycos-feldklaerung-2026-10-31.md#lokale-umsetzung-und-verbleibende-punkte).
Keine Veröffentlichung und keine Migration ausgeführt; Main bleibt unberührt.

## 42. Kunden-Stornorechnung und Prüfung möglicher Zahlungsdaten

Die vier am 31.10.2026 lesend abgerufenen Stornobeispiele bestätigen Belegart 5
und getrennte Kopf-IDs für Original und Storno trotz gleicher Belegnummer.
Die vom Nutzer beauftragte lokale Umsetzung erkennt diese Stornorechnungen,
verknüpft nur eindeutig passende Originale und ergänzt Datum/Verweis in der
bestehenden Hinweisspalte. Keine zusätzlichen Spalten oder CSS-Änderungen.
Die Historie berücksichtigt neue Bezugs- und Datumsangaben.

Zahlungsbedingungen sind bereits verfügbar, ein verlässlicher Zahlungsstatus
aus DyCoS dagegen noch nicht. Tabellen `OffenePosten` und `OffenePostenZahlungen`
sind lediglich als mögliche nächste Quellen bekannt. Die bestehende manuelle
Inkasso-Markierung wird nicht als allgemeiner Zahlungsnachweis übernommen.
Details und Prüfnachweis unter
[Feldklärung](../reference/dycos-feldklaerung-2026-10-31.md#zahlungsstatus-aktueller-erkenntnisstand).
Keine Veröffentlichung oder Live-Datenänderung; Main bleibt unberührt.
