# Rechnungsprüfung aus persönlichen Postfächern

Stand: 04.11.2026. Führender Daten- und Prüfvertrag für die Mailaktion und
für gespeicherte Ergebnisse im Transportauftrag. Veröffentlichungsstand siehe
[Releasebeleg](releases/invoice-review-2026-11-03.md).

## Prüfobjekt und Quellen

Prüfobjekt ist jede erkannte Eingangsrechnung. Mailbetreff, Mailtext und alle
unterstützten Dateianhänge bleiben gemeinsam als Kontext für die Auftragszuordnung
erhalten. Ablieferbelege, CMR, Transportaufträge und andere Begleitunterlagen
werden nicht selbst als Rechnungen bewertet. Eine weitere Datei ist weder
pauschal dieselbe Rechnung noch pauschal ein Begleitdokument. Mehrere Rechnungen
in einer Mail oder PDF werden getrennt ausgewertet.

Die KI benennt die Rechnungsseiten eines Dokuments; unklare Seitengrenzen sollen
einen größeren Seitenumfang einschließen statt mögliche Rechnungsteile zu
verwerfen. Rechnungswerte und Belege werden serverseitig gegen genau diesen
Seitenumfang validiert. Begleitunterlagen dürfen keine fehlenden Rechnungsbeträge,
Aussteller oder Zahlungsbedingungen ersetzen. OCR-Lesbarkeitsflags werden auf die
Rechnungsseiten begrenzt. Eine Dokumentübersicht und die Rechnungsseiten bleiben
im Ergebnis sichtbar. Originale verbleiben in Exchange.

Unterstützt sind PDF, PNG, JPEG und nicht animierte WebP/PNG. GIF/Animationen
werden ausdrücklich abgewiesen statt nur das erste Bild auszuwerten. Inlinebilder
wie Signaturen werden nicht als Dateianhänge untersucht. Dateiinhalt, Format,
Größe und Bildabmessungen werden serverseitig geprüft. Grenzen: 20 Dateien, je
5 MiB, zusammen 20 MiB, 100 Seiten, zusammen 160.000 Zeichen einschließlich
Mailkontext und beider Textkanäle, 50 Transportpositionen bzw. mögliche TAs.
Grenzüberschreitungen führen zum Abbruch ohne stille Teilprüfung.

PDF-Textebene und OCR bleiben getrennt; erkannte Geldbetragswidersprüche zwischen
beiden Quellen machen die betroffenen Vergleiche gelb. Bilder liefern OCR-Belege.
Tabellenüberschriften gehören zum Kontext: ein belegtes Eurozeichen ist ein
zulässiger Nachweis für EUR. Liefer-/Leistungsdatum bleibt getrennt von Lade- und
Entladedatum. Bei genau einem Transport wird es sekundär gegen das Entladedatum
verglichen, niemals automatisch auf beide Transportdaten übertragen.

Die strukturierte Erkennung nutzt gpt-5.4 und store:false. Nur kurze
serverseitige Dokumentaliase werden an die KI gegeben; die Rückzuordnung zu
Graph-IDs ist exakt. Dokumente und Mailtexte sind untrusted Daten, keine
Anweisungen. Die bestehenden projektspezifischen Secrets werden verwendet.

## Auftragszuordnung und Vergleich

Neunstellige Referenzen aus der Rechnung, anderen Anhängen, Betreff und Mailtext
werden lesend gegen Drehpunkt und bei Bedarf DyCoS geprüft. TA-Bezeichnungen
umfassen u.a. Transport Auftrag, Auftrag, Komm.-Nr. und ext. Auftrags-Nr.
Dateinamen allein erzeugen keine Referenz. USt-IDs und ausdrücklich als
Rechnungs-/Konto-/Telefonnummern beschriftete Werte werden nicht als unbenannte
TA-Kandidaten behandelt. Jeder Kontextbezug behält Dateiname bzw. Mailquelle und
einen kurzen wörtlichen Nummernbeleg.

Explizite belegte Rechnungsreferenzen werden direkt verglichen. Unklare oder nur
im Kontext gefundene Nummern werden bei ausreichender unabhängiger Bestätigung
automatisch zugeordnet: Unternehmername oder Unternehmer-USt-ID zusammen mit
passendem Nettobetrag oder mindestens zwei unabhängigen Transportmerkmalen.
Ein expliziter Rechnungsbezug plus Unternehmeridentität kann auch bei falschem
Rechnungsbetrag zugeordnet werden; die Betragsabweichung bleibt rot. Unser eigener
Name und unsere USt-ID sind keine unterscheidenden Zuordnungsmerkmale.

Internes Ranking: Unternehmername 30, Unternehmer-USt-ID 35, Nettobetrag 40 und je
unabhängigem Transportmerkmal 10 Punkte. Liefer-/Entladedatum wird nicht doppelt
gezählt. Ohne expliziten Rechnungsbezug muss der beste ausreichend belegte
Kandidat mindestens 15 Punkte vor dem nächsten liegen. Gleiche Alternativen oder
unvollständige/mehrdeutige Kandidatenabrufe bleiben gelb und werden nicht fest
verknüpft. Rankingpunkte sind keine Erfolgsprozente und werden nicht angezeigt.
Bestätigtes Nichtvorhandensein einer TA wird vom Schnittstellenfehler unterschieden.
Mehrere Positionen derselben zugeordneten TA werden vor dem Kostenvergleich
addiert; alternative Kandidaten vervielfachen niemals Rechnungsbeträge.

Bekannte Rechtsformvarianten und Inhaberzusätze werden gezielt normalisiert.
Unterschiedliche ausdrücklich genannte Inhaber bleiben unterscheidbar. Keine
beliebigen Namenspräfixe oder unscharfen Firmenzusammenführungen.

Vorrang haben lokale Daten; fehlende Abschnitte werden lesend ergänzt, vorhandene
Werte nicht überschrieben. Mehrdeutige lokale TAs werden nicht automatisch gewählt.
Nettoreferenz sind ausschließlich TA-bezogene imported.financial.costPositions,
niemals ein möglicher Tourgesamtbetrag costNet. Keine automatische Währungsumrechnung.
Fehlende Steuer-/Bruttoreferenzen bleiben offen, nicht null. Zahlungskonditionen
vergleichen Frist, Fristbeginn und Tagesart; ein gedrucktes Fälligkeitsdatum ersetzt
keine ausdrücklich vereinbarte Eingangsbasis. Belegverknüpfungen allein beweisen
weder Dubletten noch Zahlung oder Buchung.

### Zahlungsziel und Factoring

Das Zahlungsziel bleibt genau eine Prüfzeile. Ausdrücklich gedruckte Fristen
(z. B. „45 Tage“, „45 dni“) werden getrennt von der Fälligkeit erkannt.
Fälligkeitsdatum minus echtes Rechnungs-/Belegdatum liefert eine unabhängige
Kalendertagsdifferenz, die ebenfalls in dieser Zeile steht; vollständige Daten
und Quellen bleiben unter deren Details. Liefer-/Leistungsdatum, KSeF-Datum und
tatsächlicher Zahlungstag ersetzen das Rechnungsdatum nicht. Widersprechen sich
gedruckte Tage und die passende Datumsdifferenz, bleibt der Widerspruch sichtbar.
Eine sicher belegte Abweichung von der Vereinbarung ist rot. Aus Rechnungsdatum
und Fälligkeit wird keine Frist ab Rechnungs-/Belegeingang abgeleitet. Stimmen die
ausdrücklich genannten Tage und die Tagesart überein, wird die Tagesfrist grün,
auch bei fehlendem Fristbeginn auf einer Seite. Fehlende Wiederholungen auf
weiteren Rechnungsseiten erzeugen keine Warnung. Ausdrücklich widersprüchliche
Fristbeginne bleiben rot. Diese Anpassung ist im Dev-Paket vom 04.11.2026 enthalten.
Zahlungsart wie „Überweisung“ ist kein Zahlungsziel und erhält keine eigene
Anzeige oder Vergleichszeile, auch nicht in historischen Berichtsdarstellungen.

Factoring/Forderungsabtretung erhält genau einen zusätzlichen Hauptprüfpunkt.
Ein konkreter belegter Hinweis auf Verkauf/Abtretung dieser Rechnungsforderung
führt zu Gelb und einem kurzen gelben Hinweis oben im Bericht, gegebenenfalls
mit dem Factoringunternehmen. Firmenname, allgemeine Erwähnung, Ablehnung oder
ausdrücklich verneinte Abtretung reichen nicht. Der Beleg muss aus den geprüften
Rechnungsseiten stammen; eine Bankverbindung allein begründet keinen Fund.
Ohne Fund lautet der Punkt auf ausdrücklichen Nutzerwunsch grün „Kein Hinweis
gefunden“. Das bezeichnet das Suchergebnis, keine Garantie, dass keine Abtretung
existiert. Alte Berichte ohne diese Prüfung bekommen keinen nachträglich
erfundenen grünen Befund.

## Darstellung und Prozentbalken

Die Hauptansicht zeigt kompakte Zeilen mit Rechnungswert, Vergleichswert und
Ergebnis. Grün: vergleichbare Werte stimmen überein. Gelb: benötigte Angabe oder
Vergleich/Zuordnung fehlt. Rot: vorhandene vergleichbare Angaben widersprechen
sich. Grau: ergänzend oder nicht anwendbar. Interne Rechenprüfungen sind als solche
beschriftet; deren Grün bedeutet rechnerische Stimmigkeit, keinen Datenbanknachweis.
Eine nur erkannte Rechnungsnummer ist kein grüner Datenbankvergleich.

Der Balken zeigt die Verteilung gleich gewichteter Hauptprüfpunkte in
Grün/Gelb/Rot, insgesamt gerundet 100 Prozent, einschließlich Anzahl je Farbe.
Er ist keine Wahrscheinlichkeit und keine Freigabeentscheidung. Wiederholte
Kopf-/Transportvergleiche werden nicht mehrfach gezählt. Bei mehreren TAs bleiben
Positionsabweichungen sichtbar, auch wenn sie sich in der Gesamtsumme aufheben.

Lade-/Entladeorte und -daten, Kennzeichen und Erkennungsmetadaten sind sekundär
und verändern den Balken nicht. Fehlende sekundäre Angaben sind grau; echte
Widersprüche bleiben farbig und werden am eingeklappten Bereich gezählt.
Quellen, vollständiger Auftragsvergleich und Erkennungsdetails sind aufklappbar.
Die Berichtshistorie im Auftrag verwendet dieselbe Prozentberechnung. Deutsch,
Englisch sowie Light/Dark verwenden denselben Ablauf.

## Speicherung und Zugriff

Neue unveränderliche Berichte haben version:6. Alte Berichte bleiben lesbar und
werden durch die neue Oberfläche dargestellt, nicht rückwirkend neu erkannt oder
fachlich umgeschrieben. Für neue Erkennung ist „Mit aktuellen Auftragsdaten erneut
prüfen“ erforderlich. Berichte enthalten Vergleichswerte, kurze Belege,
Quellenherkunft und Dokument-/Seitenmetadaten, keine PDF-/Bildbytes, Mailtexte,
Microsoft-Tokens oder Secrets. invoiceCheckReports bleibt serverprivat;
transportOrders/{id}/invoiceChecks enthält nur die Berichtsreferenz. Speicherung
ist atomar und pro Nutzer/Anfrage-ID idempotent. Keine Änderung der Auftragsdaten,
keine Buchung, Zahlung oder steuerrechtliche Freigabe.

reviewMailboxInvoices benötigt App Check, aktives Profil, eigene aktive
Postfachverbindung sowie Postfach- und Transport-Bearbeitung. Rechte und Verbindung
werden vor Speicherung erneut geprüft. Quota: 20 Starts pro Nutzer/Stunde.
listTransportInvoiceChecks benötigt aktives Profil und Transport-Leserecht, aber
keinen Zugriff auf das persönliche Postfach des Erstellers. Direkte Browserzugriffe
auf Berichte/Verknüpfungen bleiben gesperrt. Keine neuen Rules oder Indizes.

Die Mailoberfläche startet die Auswertung über den Hintergrundprozess
processMailboxActionRun. Dieser importiert den Rechnungshandler in seiner eigenen
bereitgestellten Codeversion. Bei Änderungen an der Erkennung/Prüfung müssen
**reviewMailboxInvoices und processMailboxActionRun gemeinsam** bereitgestellt
werden. Nur die Callable zu aktualisieren ändert die Mail-Hintergrundauswertung
nicht. Frontend und beide Backendpfade müssen gemeinsam veröffentlicht werden. Firebase-Ziele:
db-bpl-drehpunkt-dev und nach ausdrücklicher Freigabe db-bpl-drehpunkt.

## Stammdaten- und Betragskorrektur vom 03.11.2026

Lokale Unternehmerstammdaten werden nach exakter Partner-/Kreditoridentität
aufgelöst; ohne Kreditor ist die exakte DyCoS-Quellidentität zulässig. Fehlt ein
lokales Blatt oder ein Feld und liegt die authentifizierte TA-Antwort vor, werden
USt-ID, Name, Land und vollständige Zahlungsbedingung aus deren eindeutig gebundenem
Unternehmerstamm lesend ergänzt. Lokale Werte haben Vorrang, mehrdeutige lokale
Zuordnungen blockieren den Ersatz. Herkunft pro Vergleichsfeld wird angezeigt.
Keine Stammdatenanlage oder Änderung. Zusätzliche Quellfelder, Bank-/Zugangsdaten
werden nicht in den Rechnungsreferenzpfad übernommen.

Übereinstimmende USt-IDs dürfen Namensvarianten derselben Unternehmeridentität
bestätigen. Ein fehlendes Länderpräfix einer rein numerischen Referenz darf nur
mit unabhängig belegtem Unternehmerland ergänzt werden. Unterschiedliche explizite
Präfixe/Ziffern bleiben widersprüchlich; ohne Länderbeleg bleibt die Präfixfrage
offen. Die angezeigten Originalwerte bleiben erhalten. Dieselbe USt-ID zählt bei
der Zuordnung nicht nochmals als unabhängige Namensübereinstimmung.

Die Hauptprüfung enthält genau drei finanzielle Ergebnisse: Netto, MwSt. und
Gesamtbetrag. Positionssummen, Steuerregel und Rechenkontrolle erscheinen in
Betragsdetails und liefern keine zusätzlichen Prozentstimmen. Tatsächliche
Unterprüfungswidersprüche werden in den jeweiligen Hauptbetrag übernommen.
Bei Sammelrechnungen bleiben die einzelnen TA-Positionsbeträge zusätzlich sichtbar.

Für MwSt. hat ein vorhandener Datenbankreferenzbetrag Vorrang; andernfalls kann die
bereits bestehende betriebliche Auslands-Nullsteuerregel verwendet werden. Keine
neue pauschale Inlandssteuerregel. Fehlt eine belastbare Grundlage, bleibt der
Vergleich gelb. Für den Gesamtbetrag werden vorhandene Referenzwerte oder das
Auftragsnetto plus bekannte Steuerregel verwendet. Ist nur die rechnerische
Stimmigkeit innerhalb der Rechnung prüfbar, ist dies ausdrücklich als
„Rechnung intern“ gekennzeichnet. Fehlende Datenbankwerte werden nie als vorhanden
ausgegeben. Das Fälligkeitsdatum ist kein Beweis für einen vereinbarten Fristbeginn.
Englische Datumsbelege mit ausgeschriebenen/abgekürzten Monatsnamen werden anhand
wörtlicher Rechnungsbelege unterstützt.

## Dubletten und hervorgehobene Hinweise (Dev, 04.11.2026)

Führende Bezeichnung ist „Rechnung bereits in DyCoS vorhanden“, ohne Aussage über
Bezahlung oder einen separat bestätigten Buchungsstatus. Für den Vergleich gelten
zusammen: unabhängig bestätigte Unternehmeridentität, derselbe kanonische UTN,
externe Belegnummer am Faktura-Kopf, Bruttogesamtbetrag und Originalwährung.
Stornierte Belege werden ausgeschlossen. Ein bloßer Kostenpositions-/Belegbezug
begründet keine Dublette.

Belegköpfe werden ausschließlich aus dem nachweislichen Auftragsbezug der
Faktura-Zeilen bzw. auftragsbezogenen Kosten-/Preispositionen gelesen. Ein grüner
Nichttreffer bezieht sich auf diese Aufträge, nicht auf eine globale Suche über
alle DyCoS-Belege. Für bestätigte TAs wird einmal je Prüflauf ein aktueller
Belegstand gelesen, auch wenn der lokale Auftrag bereits vollständig ist.
Fehlgeschlagene oder unvollständige Abrufe bleiben gelb; referenzierte, aber nicht
mitgelieferte Köpfe verhindern ein falsches grünes Ergebnis. Technische
Abruf-/Validierungsfehler werden inhaltsfrei über die bestehende begrenzte
Postfachdiagnose gemeldet. Ein Diagnosefehler verändert den Fachbericht nicht.

Private Projektion außerhalb des Transportdatenmodells:
KopfID als stabile Belegidentität, AdressID als UTN-Quellidentität,
ExterneBelegnummer als externe Rechnungsnummer, Gesamt als gesamter Bruttobetrag,
WaehrungBezFW als zugehörige Originalwährung, Storniert als Stornokennzeichen.
Belegklassifikation verwendet die vorhandenen bestätigten Regeln für externe
UTN-Rechnungen; Kundenbelege/Korrekturen sind keine Kandidaten, ungeklärte
Klassifikation bleibt offen. Nettowert + Mwst muss einem vorhandenen Gesamt
entsprechen. Fehlende Originalwährung wird nicht aus EUR-Umrechnungsfeldern
ersetzt. Keine Bankdaten, Rohzeilen oder internen Serverpfade in Berichten.

Nummern werden nach Unicode-Normalisierung, Großschreibung und Entfernung von
Leer-/Trennzeichen exakt verglichen. Eine ähnliche Nummer mit gleichem UTN,
Betrag und Währung begründet nur gelben Verdacht: maximal eine Änderung ab vier
Zeichen, maximal zwei ab zehn Zeichen, benachbarte Vertauschung eingeschlossen.
Explizit unterschiedliche Ziffern werden niemals zu einem roten Exakttreffer
normalisiert. Eine exakt passende Nummer mit bekanntem anderem Betrag kann
ebenfalls gelben Verdacht begründen. Fehlender Betrag/Währung oder umstrittene
OCR-Bruttowerte erzeugen keinen hervorgehobenen Dublettenverdacht. Überlange
Nummern werden nicht auf einen vermeintlich gleichen Präfix gekürzt.

Der gleiche Kopf wird bei Sammelrechnungen nicht mehrfach addiert. Verglichen wird
der gesamte Rechnungsbruttobetrag gegen den gesamten Kopf-Bruttobetrag. Identische
Kopfkopien werden dedupliziert; widersprüchliche gleich aktuelle Kopien bleiben
offen. Ein frischer Stornostand hat Vorrang vor alten Snapshotkopien.

Unter dem Prozentbalken jeder Rechnung erscheinen kompakte Hinweise: rot bei
bestätigtem Vorhandensein und bei gesicherten Betragsabweichungen, gelb bei hoher
Dublettenwahrscheinlichkeit. Betragsabweichungen zeigen Rechnungs-/Vergleichswert,
Währung und gegebenenfalls die TA. Ein Nettofehler derselben Einzel-TA wird nicht
nochmals als zusätzlicher Alarm dupliziert. Beide Farben können gemeinsam
erscheinen. Die Ansicht gilt auch für Berichte im Transportauftrag; Altberichte
können gesicherte Betragsabweichungen anzeigen, aber aus schwachen alten
Belegverknüpfungen keinen neuen Dublettentreffer ableiten. Neue Dublettenprüfung
erfordert eine erneute Auswertung.

Dieser Stand ist ausschließlich für Dev freigegeben. Veröffentlichungsnachweis:
[Dev-Release vom 04.11.2026](releases/invoice-duplicates-dev-2026-11-04.md).

## Unlesbare Zusatzanlagen (Dev 04.11.2026)

Berichtsversion 7: Lesbare Anlagen werden auch bei einem PDF-/Bild-Lesefehler
weiter geprüft. Nicht lesbare oder textlose Anlagen stehen unter
`unreadableDocuments` mit Dateiname und `extraction_failed`; `incomplete` ist
dann wahr. Ein gelber Hinweis oberhalb aller Rechnungsergebnisse nennt diese
Dateien und mögliche weitere Rechnungen. Die bekannten Einzelprüfungen bleiben
erhalten, der Gesamtstatus wird bei sonst vollständiger Übereinstimmung jedoch
`unknown`. Erkannte Abweichungen bleiben `mismatch`. Transportverknüpfungen und
Unvollständigkeit werden gemeinsam im unveränderlichen Bericht gespeichert.
Ohne eine lesbare Anlage wird vor der KI-Auswertung verständlich abgebrochen.
Ein inhaltsfreier Diagnoseeintrag pro Anfrage erfasst den Lesefehler. Die
Texterkennung plus zusätzliche OCR bleiben für lesbare Rechnungen unverändert.
Alte Berichte ändern sich nicht; für neue Auswertung erneut prüfen.

Zusätzlich akzeptiert die Belegvalidierung englische Tausender-/Dezimalformate
wie `1,300.00 EUR`, ohne benachbarte Tabellenbeträge zusammenzuziehen. Geprüft
mit FV028/05/2026: 1.300 EUR, 45 Tage ab Dokumenteneingang und TA-Kandidat
260500383. 90 gezielte Tests sowie der Firestore-Integrationstest mit
unlesbarem Zusatz-POD, unveränderlichem Bericht und Transportverknüpfung
erfolgreich. Vier UI-Renderprüfungen für DE/EN und vollständige/unvollständige
Berichte erfolgreich. Keine Änderung an Rules, Indizes oder Secrets.

## Kompakte Ansicht und Dokumentquellen (Dev, gesammelt 04.11.2026)

Der Ergebnisheader zeigt die eindeutigen Rechnungs-Dateinamen. Die zusätzliche
Rechnungsnummer-/Ausstellerzeile oberhalb des Balkens entfällt im Dev-Paket vom 04.11.2026; die Werte bleiben in den Prüfergebnissen erhalten. Seiten- und Erkennungsinfos sowie die
Dokumentübersicht stehen gemeinsam unter Weitere Details; ergänzende Angaben
und Transportvergleiche unter Weitere Abgleichungen. Der Gewichtungshinweis
entfällt. Unlesbare Anlagen erscheinen kurz mit Dateinamen im gelben Hinweis.
Die Empfängeranschrift akzeptiert direkt vorangestellte deutsche Länderpräfixe
wie DE42369; echte PLZ-/Hausnummerabweichungen bleiben unverändert bewertet.
PDF-/Bildvorschauen erkennen den Dateityp anhand der Signatur auch bei dem
Exchange-Typ application/octet-stream. Dies gilt für die gemeinsame Quellenansicht
und die Auftragserfassung. Die Quellenauswahl hat ausreichend Höhe für den Text.
Keine Änderung an Rules, Indizes, Secrets oder Microsoft-Berechtigungen.

## Gesammeltes Dev-Paket vom 04.11.2026

Bei technisch fehlgeschlagener Rechnungsprüfung (Aktionszustand failed) bleibt das
Rechnungsprüfungs-Icon in der Mailübersicht sichtbar und rot, einschließlich
übersetztem Hinweis/zugänglichem Namen „Fehlgeschlagen“. Der Aktionsbutton rechts
erscheint wieder neutral mit „Rechnung erneut prüfen“. Der gespeicherte Fehlerstatus
bleibt erhalten, damit Mailliste, Neuladen und erneuter Start konsistent bleiben.
Eine erfolgreich abgeschlossene Auswertung mit fachlichen Rechnungsabweichungen
bleibt eine abgeschlossene Auswertung; die Abweichungen stehen im Prüfbericht.

Für Dev freigegeben am 04.11.2026. Frontend und beide Rechnungs-Serverfunktionen
werden gemeinsam veröffentlicht; Main und Produktion sind nicht freigegeben.
Nachweis: [Gesammeltes Dev-Paket](releases/invoice-results-batch-dev-2026-11-04.md).


### Zahlungsziel – Dev-Paket 04.11.2026

Gleiche ausdrücklich erkannte Tagesfristen werden grün bewertet, auch wenn der
Fristbeginn auf der Rechnung oder in der Vergleichsvereinbarung fehlt. Ein Beleg
auf einer zugehörigen Rechnungsseite genügt; Wiederholung auf jeder Seite ist
nicht erforderlich. Ausdrücklich widersprüchliche Fristbeginne oder Tagesarten
bleiben rot; widersprüchliche Datumsangaben, fehlende Vergleichswerte und uneinheitliche
Vereinbarungen bleiben ungeklärt. Die Ableitung allein aus Rechnungs-/Fälligkeitsdatum
ersetzt weiterhin keinen bekannten Fristbeginn ab Rechnungs-/Belegeingang.
Keine zusätzliche Ergebniszeile; weiterhin genau ein Zahlungsziel-Prüfpunkt.


### Drei Betragszeilen – Dev-Paket 04.11.2026

Die Ergebnisansicht zeigt Netto, USt. und Brutto. Der eigene Bereich
Betragsdetails entfällt. Positionssumme, Steuerregel, Netto-plus-Steuer-Rechnung
und zusätzliche Datenbankvergleiche stehen jeweils unter Details der zugehörigen
Betragszeile. Berechnungen, Ergebnisfarben und Gewichtung bleiben erhalten.
Dies gilt für neue und gespeicherte Berichte in Mail und Transportauftrag.


### Externe Belegnummer – Dev-Paket 04.11.2026

Die Hauptzeile heißt Ext. Belegnummer und zeigt Rechnungsnummer gegen externe
DyCoS-Belegnummer, ohne Details-Schalter. Bestätigte Treffer erscheinen rot als
Bereits gebucht; vollständig geprüfte zugeordnete Aufträge ohne relevanten Beleg
grün als Noch nicht gebucht. Diese Aussage bleibt auf den Auftragsbezug begrenzt.
Andere aktive externe Nummern desselben bestätigten Unternehmers im Auftragsbezug
werden gelb Prüfen mit den gefundenen Nummern angezeigt, ohne allein dadurch eine
Dublettenwarnung zu erzeugen. Die bisherigen strengen Treffer-/Verdachtsregeln
für Unternehmer, Betrag und Währung sowie der Stornoausschluss bleiben bestehen.
Unvollständige Abfragen ergeben weiterhin keinen grünen Abwesenheitsnachweis.


### Kompaktes Zahlungsziel – Dev-Paket 04.11.2026

Die Zahlungsziel-Zeile zeigt nur Rechnungswert, Vergleichswert und Ergebnisfarbe.
Datumsdifferenz, Erklärtexte, Quellen und Details-Schalter entfallen in dieser Zeile,
auch bei gespeicherten Berichten. Eine ausschließlich aus Datumsangaben ermittelte
Frist erscheint als Tageswert. Die gespeicherten Belege und Berechnungen bleiben
für die Bewertung erhalten: grün übereinstimmend, gelb fehlend/ungeklärt, rot abweichend.


### Rechnungswährung – Dev-Paket 04.11.2026

Währung wird pro Rechnungsbeleg einmal gegen EUR geprüft, unabhängig von Anzahl
und Währungen zugeordneter Transportaufträge. EUR ist grün, fehlende Erkennung gelb,
eine andere erkannte Währung rot. Die Ergebniszeile trägt keinen TA-Hinweis.
Dies gilt auch für gespeicherte Berichte. Betragsvergleiche rechnen weiterhin
keine unterschiedlichen Währungen um und benötigen ihre passende Vergleichswährung.


## Fremdsprachige Rechnungen (Dev-Anpassung 04.11.2026)

Der manuelle Start ist der ausdrückliche Auftrag zur Rechnungsauswertung in jeder
Sprache. Die KI erhält Originalbegriffe (u.a. Faktura/Invoice/Facture/Factura/
Fattura/Fatura) als gleichwertige Rechnungsbezeichnungen. Allgemeiner Rechnungsbeleg
und Feldzitate bleiben in der Originalsprache, ohne Übersetzung oder Zusammenfügen.
Bei einem nicht wörtlich passenden allgemeinen Modellbeleg darf eine tatsächlich
vorhandene Rechnungsüberschrift auf den ausgewählten Rechnungsseiten die Erkennung
bestätigen. Quellen-/Seitenbindung und die Einzelvalidierung sämtlicher Werte bleiben
bestehen: unbelegte Werte werden leer und führen zu ungeklärten Einzelprüfungen.
Ein Rechnungswort aus einer anderen Anlage oder ausgeschlossenen Seite genügt nicht.
Ungültige Transportlisten haben einen eigenen technischen Fehlercode und eine
passende Meldung, getrennt von einer nicht belegbaren Rechnungserkennung.
Polnisch Numer zlecenia od klienta gilt als ausdrücklicher Kundenauftragsbezug;
Numer zlecenia allein wird nicht zur eigenen TA erklärt.
Die bestehende zusätzliche OCR bleibt aktiv; keine weiteren Modellaufrufe pro Lauf.
Veröffentlichung ausschließlich auf Dev; Main/Produktion bleiben unverändert.
