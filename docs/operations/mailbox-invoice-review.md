# Rechnungsprüfung aus persönlichen Postfächern

Stand: 03.11.2026. Führender Daten- und Prüfvertrag für die Mailaktion und
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

Neue unveränderliche Berichte haben version:3. Alte Berichte bleiben lesbar und
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

Backendänderungen dieses Updates betreffen ausschließlich reviewMailboxInvoices;
Frontend und Backend müssen gemeinsam veröffentlicht werden. Firebase-Ziele:
db-bpl-drehpunkt-dev und nach ausdrücklicher Freigabe db-bpl-drehpunkt.
