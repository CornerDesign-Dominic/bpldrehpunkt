# Auftragserfassung aus persönlichen Postfächern

Stand: 29.10.2026. Vom Nutzer zur gemeinsamen Dev-Veröffentlichung freigegeben.
Der Stammdaten-Flow ist eingerichtet und getestet; automatische XML-Übertragung
und eine bestätigte DyCoS-Auftragsanlage sind kein Bestandteil dieses Schritts.
Der aktuelle Veröffentlichungsnachweis steht unter
[Dev-Testrelease](mailbox-order-dev-release.md).

## Ablauf

„Auftrag hinzufügen“ steht neben Antworten und Sendungsstatus aktualisieren.
Der große Dialog zeigt links Mail/Schriftverkehr oder ein ausgewähltes PDF und
rechts das bearbeitbare Prüfformular. Ausgewählte PDF-Anlagen werden gemeinsam
mit dem serverseitig frisch geladenen Mailtext ausgewertet. Die KI erhält keine
Anweisungsvollmacht aus Mail oder Anlagen. Es werden keine Aufträge automatisch
angelegt und keine Antworten versandt.

Maximal fünf PDFs, je 5 MiB, insgesamt 15 MiB und 40 Seiten sind pro Auswertung
unterstützt. PDF-Struktur und Seitenzahl werden serverseitig geprüft. Geschützte,
beschädigte oder übergroße PDFs führen zu einer sichtbaren Meldung; sie werden
nicht still übersprungen. Für die visuelle Auswertung werden die ausgewählten
Original-PDFs als begrenzte `input_file`-Eingaben an die bestehende OpenAI-Anbindung
übergeben; dadurch können auch Scans ausgewertet werden. Die Requests verwenden
`store: false`, das vorhandene Modell `gpt-5.4` und
`STATUS_MAIL_OPENAI_API_KEY`. Nutzung wird unter `mailbox_order_capture`
in der vorhandenen KI-Nutzungserfassung protokolliert, ohne Mail-/PDF-Inhalte.
PDF-Verarbeitung gemäß [OpenAI-Dateieingaben](https://developers.openai.com/api/docs/guides/file-inputs).

Korrektur vom 30.10.2026: Der serverseitig extrahierte Seitentext einschließlich
OCR wird zusätzlich als verbindliche Basis für Quellenbelege mitgegeben. Die
Original-PDFs ergänzen den visuellen Zusammenhang. Die KI verwendet ausschließlich
kurze, durch das Antwortschema begrenzte Referenzen (`mail`, `pdf-1` usw.);
erst der Server übersetzt diese zurück in die unveränderten Graph-Anhangskennungen.
Damit müssen weder lange Kennungen nachgeschrieben noch Belege aus einer anderen
visuellen Textreihenfolge abgeleitet werden. Ungültige Referenzen scheitern sichtbar;
die Prüfung wörtlicher Textbelege bleibt unverändert. Quellenpfade werden relativ
zum Auftragsobjekt geprüft; genau ein optionales `order.`-Wurzelpräfix wird
vereinheitlicht, unbekannte Pfade werden weiterhin verworfen. Ein tatsächlich leeres
Prüfformular erhält einen deutlichen Hinweis und kann manuell ergänzt werden.

Echtdokumentprüfung dieser Korrektur: Beim bereits getesteten Kundenauftrag
bleiben nach Quellenvalidierung 31 von 31 erkannten fachlichen Angaben erhalten
(33 exakt geprüfte Belege). Beim zweiten Dokument bleiben 20 von 21 Angaben
erhalten (22 geprüfte Belege), nachdem vorher alle entfernt wurden. Eine
unbelegte Notiz wird weiterhin verworfen. Der Mehrfachauftragshinweis des
Dokuments mit drei Teilpartien bleibt zur fachlichen Klärung bestehen. Die
Reproduktion hat keine Aufträge, Vorschauen oder Mails in der Cloud geschrieben.
59 fokussierte Backend-/Shared-/OCR-Tests, gezieltes ESLint, Shared-Abgleich
und Frontend-Build bestehen. Die Oberfläche wurde mit leerem Ergebnis,
befülltem Ergebnis und explizitem Quellenfehler im Browser geprüft.

## Prüfformular und Quellen

Das interne Auftragsmodell ist von den XML-Tagnamen getrennt und umfasst
Kundenreferenz, Frachtzahler, Fahrzeugart, Lade-/Entladedatum, mehrere geordnete
Stationen mit Warenpositionen, Preis/Währung und Hinweise. Ein Auftrag pro
Vorschau ist erlaubt; bei mehreren erkannten getrennten Aufträgen muss die
PDF-Auswahl eingeschränkt und erneut ausgewertet werden. Mehrere Aufträge in
einem gemeinsamen PDF werden noch nicht aufgeteilt.

KI-Werte sind farblich und textlich als Vorschläge gekennzeichnet, mit
Mailbeleg oder PDF-Datei/Seite. Wörtliche Belege aus Mail und textlesbaren PDFs
werden geprüft; unbelegte Werte werden entfernt. Scan-Belege bleiben ausdrücklich
ungeprüfte KI-Belege zum Abgleich mit dem Original. Manuelle Änderungen sowie
fehlende wichtige Felder sind unterscheidbar. Farbgebung funktioniert mit den
vorhandenen Theme-Variablen, Beschriftungen sind deutsch/englisch.

Der Nutzer bestätigt den bestehenden Frachtzahler und genau eine seiner
Debitorenreferenzen. Interne Adress-IDs werden niemals aus KI-Ausgaben oder aus
der Debitorennummer abgeleitet. Für den Export ist die serverseitig geschützte
Zuordnung `businessPartners.dycosIdentities[debtor-<Nummer>]` erforderlich,
wie unter [DyCoS-Stammdatenabruf](../planning/dycos-csv-import-uebergangsloesung.md#29-standalone-stammdatenabruf-in-drehpunkt) beschrieben. Fehlende IDs
blockieren die XML, bis der Kunde über die direkte Schnittstelle ergänzt ist.

Abgleich mit dem separat bearbeiteten Stammdaten-Flow vom 29.10.2026:
Die Auftragserfassung liest zusätzlich dessen kontobezogene Zuordnung
`dycosReferences.accounts[]` mit `entity=customer`, `number` und `sourceId`.
Die ID muss zu einer bestätigten `dycosImport.sourceReferences` passen und die
gewählte Debitorennummer muss dem Partner weiterhin gehören. Eine allgemeine
SQL-Quell-ID ohne Kontonummer genügt nicht. Die bisher vorbereitete
referenzbezogene `dycosIdentities`-Zuordnung bleibt lesbar; widersprechen sich
beide Darstellungen, wird der Export gesperrt. Die gemeinsame Prüfung liegt in
`shared/mailboxOrderCustomerIdentity.js` und gilt für Oberfläche und Server.
Der XML-Export ruft den Flow nicht selbst auf und verändert keine Stammdaten.

Die für den Export verwendeten Kontenzuordnungen und Quellreferenzen sind
serververwaltet: Rules sperren direkte Clientänderungen an
`dycosReferences.accounts` und `dycosImport`, einschließlich Superadmin.
Diese Rules gehören deshalb zwingend zur gemeinsamen Veröffentlichung mit
dem neuen Stammdatenabruf und der Auftragserfassung. Der Stammdatenabruf ist unter Abschnitt 29 der DyCoS-Dokumentation beschrieben;
die Auftragserfassung verwendet dessen bestätigtes Ergebnis.

Kundenreferenz, bestätigter Frachtzahler/Debitor, gültige Auftrags-/Stationsdaten,
mindestens eine vollständige Lade- und Entladestelle sowie beschriebene Waren
mit positiver Menge sind für diese erste Erfassung erforderlich. Fehlender Preis
benötigt eine zusätzliche ausdrückliche Bestätigung und wird niemals zu null
Euro umgewandelt. Fehlende Gewichte/Verpackungen bleiben sichtbare Prüfhinweise.
Fachlich weitergehende Pflichtregeln sind noch nicht vereinbart.

EUR ist vom Nutzer ausdrücklich als DyCoS-Firmenwährung bestätigt und der
Standard des Serverparameters `MAILBOX_ORDER_COMPANY_CURRENCY`. Ein vorhandener
Preis benötigt eine bestätigte passende Währung; es gibt keine Umrechnung.
Stoppreferenzen werden nur bei ausdrücklich benannter Lieferscheinnummer in
`LieferscheinNr` exportiert; andere Referenzen gehören in die Hinweise.

Schließen und Wiederöffnen erhält Formulareingaben in der Browsersitzung.
Ungespeicherte Eingaben werden vor Navigation/Neuladen geschützt. Die
PDF-Auswahl kann nach Änderung nicht ohne neue Auswertung exportiert werden.
Nach einer bestätigten XML-Erstellung ist dieselbe Vorschau gegen einen
abweichenden zweiten Export gesperrt; für Korrekturen ist erneut auszuwerten.

## XML und Original-PDF

„Speichern und XML herunterladen“ prüft serverseitig die Eingaben und aktuelle
Kundenzuordnung, bevor eine XML erzeugt wird. Das gewählte Original wird frisch
aus demselben eigenen Postfach geladen. Datei-ID, Name und SHA-256 müssen mit
der ausgewerteten Vorschau übereinstimmen. Der Originalinhalt wird unverändert
als Base64 in `DateiData` eingebettet, mit `Dateityp=pdf` und Originaldateiname.
Zusätzliche Anlagen sind noch nicht als mehrere eingebettete Belege vorgesehen.

Grundlage ist die vom Nutzer bereitgestellte 20-seitige GEHR-Beschreibung
„Auftragsimport Aufträge – Gehr XML-Struktur“, Änderungsstand bis 22.11.2024.
Es entsteht genau ein `Datenteil/Auftrag` mit `Quelle=KI`, separaten Datums- und
Zeitfeldern, geprüfter `FrachtzahlerID`, Stationen und Waren. Lademeter werden
als Stationssumme ausschließlich an der ersten Warenposition ausgegeben.
Notizen an Stationen verwenden Abhol-/Zustellinformation, um die dokumentierte
Überschreibung der ersten Warenbemerkung zu vermeiden.

Die XML wird tatsächlich in ISO-8859-1 kodiert, XML-Sonderzeichen werden
escaped. Hochkommas werden gemäß Herstellerbeschreibung durch `´` ersetzt;
Zeichen außerhalb des unterstützten Zeichensatzes werden sichtbar abgewiesen
statt verlustbehaftet abgeschnitten. Der Exportdateiname ist je bestätigter
Vorschau stabil und eindeutig. Wiederholung liefert dieselbe XML.

Ein erfolgreicher Download bedeutet „XML erstellt“, nicht „in DyCoS angelegt“.
Das laut Herstellerbeschreibung nötige KI-Importmodul, Feldkataloge etwa für
Fahrzeug-/Verpackungsarten und das tatsächliche Importverhalten müssen gegen
eure Installation bestätigt und mit Musterdateien getestet werden. Es wird
keine XML an einen Arbeitsplatz oder in einen überwachten Ordner geschrieben.

## Rechte, Datenhaltung und Betrieb

Jeder Aufruf verlangt Anmeldung, aktives Profil, App Check, persönliche
Postfach-Bearbeitung, Auftrags-Bearbeitung und lesenden Stammdatenzugriff.
Superadmin überschreibt Modulrechte, niemals die persönliche Postfacheigentümerschaft.
Die vorhandene Postfachanbindung erlaubt ausschließlich das Dev-Projekt.

`mailboxOrderPreviews` enthält private extrahierte Angaben und kurze Quellenbelege
für eine Stunde; `mailboxOrderQuotas` begrenzt auf 20 Auswertungen pro Stunde und
Benutzer. `mailboxOrderExports` enthält bestätigte Angaben, interne Kunden-ID,
Dateihash und stabile Exportreferenz für 24 Stunden. Ganze Mailtexte und
Original-PDF-Bytes werden dort nicht gespeichert. Die Collections sind durch
Default-deny für direkte Get/List/Write-Zugriffe gesperrt, auch für Superadmins.

Die bestehende stündliche Postfachbereinigung entfernt abgelaufene Vorschauen,
Quoten und Exportbelege in begrenzten Batches. Export prüft Eigentümer,
Postfachverbindung, Ablauf und Quellenbindung erneut in einer Transaktion.
Technische Fehler sind mit `order-preview`/`order-export` an die zentrale
Postfachdiagnose angeschlossen, ohne Rohantworten, Betreff, Kunden-/Mailtexte
oder Tokens.

Vor einem ausdrücklich freigegebenen Dev-Release gemeinsam bereitstellen:
Frontend, `previewMailboxOrder`, `exportMailboxOrder`, erweiterte
`cleanupMailboxConnections` und für die neuen Client-Diagnosestufen
`reportClientDiagnostic` sowie die Rules mit Schutz der kontobezogenen
Quell-IDs. Private Collections verwenden Default-deny; keine neuen Indizes,
Storage-Pfade oder Microsoft-Rechte sind notwendig. Eine Freigabe des
neuen Stammdaten-Flows ist davon getrennt zu behandeln.

## Prüfstand und offene Abnahme

Gezielte Tests prüfen Rechte und Eigentümergrenzen, serverseitigen Graph-Abruf,
PDF-Grenzen/echte PDF-Struktur, Quellenprüfung, Eingaben, Währung, XML und
Original-PDF-Gleichheit. Ein unabhängiger XML-Parser bestätigt ISO-8859-1,
Umlaute, genau einen Auftrag und byteidentisch eingebettete Originaldaten.
Echte Firestore-Emulatortests prüfen private Collections und parallele,
idempotente XML-Bestätigung. Modellantworten und Graph wurden dabei simuliert;
es wurde keine echte persönliche Mail an KI übertragen.

Vollständiger Lint, Build (bekannte Chunkgrößenwarnung), Functions-Syntax und
Shared-Abgleich sind erfolgreich. 54 gezielte Unit-Tests sowie zwei echte
Emulator-Testfälle bestehen. Ein isolierter Browserlauf mit synthetischen
Mail-/Kunden-/KI-Daten besteht Deutsch/Englisch und Light/Dark, Korrektur eines
fehlenden Pflichtfeldes, Kunden-/ID-Auswahl, tatsächlichen XML-Download samt
eingebettetem PDF, native PDF-Vorschau, Schließen/Wiederöffnen und Schließen
während einer laufenden Auswertung. Mehrere erkannte Aufträge blockieren den
Export. Diese Prüfung ersetzt keinen echten Graph-/KI-Durchlauf.

Offen bleiben echte Mail-/Scan-Auswertungen, fachliche Prüfung mehrerer
Musteraufträge und der Import in DyCoS mit lizenzierter KI-Quelle.

## Fehlende Kunden und bestätigter Platzhalter (30.10.2026)

Die Auswertung erfasst belegte USt-ID, PLZ und Ort des Auftraggebers zusätzlich.
Die Kundenvorschläge gleichen diese Angaben mit den geladenen Drehpunkt-Stammdaten
ab; USt-ID-Treffer werden durch PLZ/Ort eingegrenzt. Widersprüchliche USt-IDs
werden nicht über einen Namens-/Ortstreffer übergangen. Der Nutzer bestätigt
den Kunden. Kein lokaler Treffer beweist nicht, dass der Kunde in DyCoS fehlt:
Der Hinweis fordert zur Prüfung und zum Stammdatenabruf auf. Neue Kunden müssen
zuerst in DyCoS angelegt werden; der Auftragsimport legt keine Kunden an.

Als bewusst gewählter Platzhalter darf der eigene Debitor **10001** verwendet
werden. Dafür muss sein Stammdatensatz samt verifizierter interner Adress-ID
bereits aus DyCoS abgerufen sein. Die Debitorennummer wird niemals als Adress-ID
in die XML geschrieben. Vor dem Export ist eine zusätzliche ausdrückliche
Platzhalterbestätigung erforderlich; diese wird auch serverseitig geprüft.

Formular, Freigabeabschnitt, XML-Dispositionshinweis und Exportbeleg nennen die
notwendige Nacharbeit: echten Kunden in DyCoS anlegen und den Auftrag dort
anschließend manuell umstellen. Ursprünglicher Auftraggeber, belegte USt-ID und
PLZ/Ort bleiben erhalten. Die endgültige Zuordnung wird nicht automatisch
korrigiert. Bei einem bestätigten Kunden erfolgt der XML-Import weiterhin über
seine interne Adress-ID; konkurrierende KI-Such-Tags werden nicht mitgegeben.

Validiert mit 32 gezielten Tests für Extraktion, Kundenzuordnung, Platzhalter-
Bestätigung und XML-Export sowie einem Firestore-Emulatortest für atomare
Bestätigung und wiederholte Exporte. ESLint, Build und Shared-Abgleich bestehen.
Die Tests verwenden synthetische Kunden; es wurden dadurch keine echten
DyCoS-Kunden oder Aufträge angelegt.
