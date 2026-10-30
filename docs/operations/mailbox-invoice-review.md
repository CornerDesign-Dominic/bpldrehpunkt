# Rechnungsprüfung aus persönlichen Postfächern

Stand: 30.10.2026. Der Nutzer hat Umsetzung, Test mit drei bereitgestellten
Rechnungen und Veröffentlichung ausschließlich in Dev ausdrücklich beauftragt.
Produktion und status@ bleiben unverändert.

## Ablauf und Aussagekraft

Die Mailaktion startet sofort im vorhandenen großen Arbeitsdialog: Mail/PDF
links, rechts sichtbare Ladeüberlagerung, danach ein Ergebnis je erkannter
Rechnung mit aufklappbarer Zeile je TA. Mehrere Rechnungspositionen derselben TA
werden für den Transportvergleich addiert; unterschiedliche TAs bleiben getrennt.
Kopf-/Summenprüfung und Gesamtstatus der Rechnung sind von den Transportzeilen
getrennt. Grün bedeutet Übereinstimmung der aufgeführten Prüfpunkte; Rot eine
festgestellte Abweichung. Fehlende oder unbelegte Daten sind ausdrücklich
unvollständig/ungeklärt, niemals automatisch grün.

Alle PDF-Dateianhänge werden serverseitig über Graph gelesen. Der Mailtext,
Dateinamen oder ein anderer Anhang berechtigen nicht zur TA-Zuordnung: Die
neunstellige TA muss im erkannten Rechnungsdokument selbst belegt sein. Ohne
TA erfolgt kein Auftragsabruf und keine Verknüpfung. Nicht-Rechnungen werden
nicht als Rechnung verarbeitet. Geschützte oder auch nach OCR nicht lesbare PDFs brechen mit Hinweis ab.
Fehlende Textebenen einzelner Seiten lösen automatisch einen OCR-Durchlauf aus. Obergrenzen sind 20 PDFs,
je 5 MiB, zusammen 20 MiB, 100 Seiten, 160.000 Textzeichen und 50 Transportzeilen.
Die Vollständigkeitsgrenzen führen zum Abbruch statt stiller Teilprüfung.

Die strukturierte Erkennung verwendet extrahierten PDF-Text und native PDFs,
gpt-5.4, store:false und das bestehende Dev-Secret STATUS_MAIL_OPENAI_API_KEY.
Belegwerte werden gegen den Text desselben Dokuments geprüft. Bei abweichender
visueller/Text-Reihenfolge darf nur auf einen tatsächlich vorhandenen wörtlichen
Wert neu verankert werden; keine unbelegten Werte werden ergänzt.

Verglichen werden Nettobetrag in ganzzahligen Cent, Währung, Aussteller und
Empfänger; soweit belegt auch USt-ID des Empfängers, Lade-/Entladedatum, Orte und
Kennzeichen. Die Aussteller-USt-ID wird zusätzlich verglichen, wenn in den
verknüpften Unternehmerstammdaten vorhanden. Als Referenz für den Nettobetrag
dienen ausschließlich TA-bezogene imported.financial.costPositions.amountNet;
costNet kann die gesamte Tour enthalten und ist kein zulässiger Ersatz. Fremde
Währungspositionen werden nicht stillschweigend addiert. Summen der Positionen,
Netto + Steuer und Brutto werden separat geprüft. PLN-Umrechnungen neben einer
EUR-Rechnung werden nicht als weitere Rechnungswährung addiert. Es erfolgt keine
Zahlung, Buchung oder steuerrechtliche Freigabe; IBAN und Ablieferbelege sind
nicht Bestandteil dieser ersten Datenprüfung.

## Datenquellen und Speicherung

Vorrang haben vorhandene Drehpunkt-Daten. Fehlende Abschnitte werden über den
bestehenden, authentifizierten DyCoS-TA-Abruf lesend ergänzt; vorhandene Werte
werden nicht überschrieben. Mehrdeutige lokale TAs werden nicht automatisch
gewählt. Abrufe sind auf vier parallele Aufträge und ein Zeitbudget begrenzt;
fehlgeschlagene Abrufe bleiben im Ergebnis ungeklärt. Ein nicht lokal vorhandener
Auftrag wird nicht nebenbei importiert. Die Prüfung wird seiner kanonischen
DyCoS-Auftragsreferenz zugeordnet und ist nach regulärem TA-Import dort abrufbar.

Ein unveränderlicher Bericht liegt serverprivat unter invoiceCheckReports.
Jeder betroffene Transport erhält unter invoiceChecks lediglich die Referenz
auf diesen Bericht. Damit ist ein gemeinsamer Sammelbericht ohne große
Mehrfachkopien mit allen betroffenen Aufträgen verknüpft. Die Speichervorgänge
sind atomar und wiederholte Aufrufe derselben Nutzer-/Anfrage-ID idempotent.
Erneut prüfen erstellt mit neuer Anfrage-ID einen neuen datierten Prüfstand.
Auftragsdaten selbst werden durch die Prüfung nicht verändert. Gespeichert
werden Vergleichswerte, Abweichungen und kurze Rechnungsbelege, keine PDF-Bytes,
Mailtexte, Microsoft-Tokens oder persönlichen Absenderdaten.

Im Auftrag öffnet die linke Aktionskarte „Rechnungsprüfung“ die letzten 20
Prüfstände. Originale verbleiben im persönlichen Postfach; andere Nutzer mit
Transport-Leserecht sehen nur die angehängten Prüfergebnisse, keine fremden
Postfachzugangsdaten. Der Einstieg benötigt keinen eigenen Postfachzugriff.

## Rechte und Release

reviewMailboxInvoices verlangt App Check, aktives Profil, eigene aktive
Postfachverbindung, Postfach-Bearbeitung, Transport-Bearbeitung und ausschließlich
Projekt db-bpl-drehpunkt-dev. Vor Speicherung werden Rechte und Verbindung erneut
geprüft. Eine serverprivate Quota begrenzt auf 20 Starts pro Nutzer/Stunde.
listTransportInvoiceChecks benötigt aktives Profil und Transport-Leserecht;
direkter Clientzugriff auf Berichte und Verknüpfungen bleibt per Default-deny
gesperrt. Keine neuen Rules oder Indizes sind erforderlich.

Gezielt bereitzustellen: reviewMailboxInvoices (MAILBOX_CLIENT_SECRET,
STATUS_MAIL_OPENAI_API_KEY und vorhandene DYCOS_TENANT_ID, DYCOS_CLIENT_ID,
DYCOS_SERVICE_PRINCIPAL_ID, DYCOS_CERTIFICATE_PEM, DYCOS_PRIVATE_KEY_PEM,
DYCOS_FLOW_URL), listTransportInvoiceChecks und reportClientDiagnostic.
Mit diesem Stand werden die zuvor lokal vorbereitete AGB-Mailaktion
(analyzeMailboxAgb, assignMailboxAgbCustomer) und die Ladeanzeige der
Auftragserfassung gemeinsam in Dev bereitgestellt. Es werden ausschließlich
bestehende Dev-Secrets gebunden und keine Produktionswerte kopiert.

## Prüfung

Die drei vom Nutzer bereitgestellten PDFs wurden vollständig gelesen und
visuell geprüft. Echte strukturierte KI-Erkennung und lesender DyCoS-Abruf
fanden für alle drei Beispiele statt; Nettobeträge und Währungszuordnung wurden
mit den Quellen abgeglichen. Die Prüfung erkennt reale Namens-/Kennzeichen-
Abweichungen und fehlende Referenzwerte, statt sie als Erfolg zu kennzeichnen.
Rechnungsdateien, personenbezogene Finanzdaten, native PDFs, Extraktionsausgaben
und API-Zugangsdaten werden nicht ins Repository aufgenommen.

Synthetische Tests decken Sammelrechnungen, Mehrfachpositionen, fehlende TA,
fremde/fehlende Rechte, unbelegte Werte, fehlende Vergleichsdaten, fehlgeschlagene
Zuordnung und Summenfehler ab. Echte Demo-Firestore-Integration prüft atomare
Speicherung und Idempotenz; separate Regeltests verweigern Get/List/Write der
neuen Collections für Eigentümer, andere Nutzer, Superadmin und deaktivierte
Konten. Browserprüfung mit synthetischen Daten: Ladeanzeige, Aufklappen, getrennte
Ergebnisse, Bericht im Auftrag erneut öffnen, Light/Dark, Deutsch/Englisch und
Fehlerfall bei erneuter Prüfung. Es wurden keine echten Mails versendet.

Releaseprüfung: 84 gezielte Tests, Demo-Firestore-Regeltest und separate
Demo-Firestore-Speicherintegration bestanden; Lint, Build und Abgleich von
38 deploybaren Shared-Modulen erfolgreich. Der bestehende Hinweis auf große
JavaScript-Chunks bleibt bestehen.


## Korrektur der Dokumentreferenzen am 30.10.2026

Der echte Mailablauf scheiterte nach erfolgreicher KI-Erkennung: Beim Kopieren
einer langen opaken Microsoft-Anhangs-ID änderte die KI ein Zeichen. Die
strenge Belegprüfung verwarf den unbekannten Verweis korrekt. Die Analyse
übergibt deshalb nur kurze serverseitige Aliase (pdf-1, pdf-2 usw.). Das
Antwortschema beschränkt sourceId auf genau diese Aliase; der Server ordnet sie
anschließend exakt den ursprünglichen Anhangs-IDs zu. Opaque Graph-IDs werden
nicht mehr an die KI übermittelt. Die Belegprüfung bleibt unverändert streng;
es gibt keine unscharfe Reparatur einer beschädigten ID. Unbekannte Referenzen
und unbelegte Inhalte haben getrennte inhaltsfreie Diagnosecodes.

Die Ursache wurde mit dem betroffenen echten Mailanhang reproduziert. Nach der
Korrektur war derselbe KI-/Validierungsablauf erfolgreich. Regressionstests
prüfen zwei fast gleiche lange Anhangs-IDs, exakte Rückzuordnung, Alias-Enum und
das Abweisen unbekannter Aliase. Private Mail-/PDF-Inhalte und Providerantworten
werden nicht eingecheckt.


Der Rechnungsbezug „ext. Auftrags-Nr.“ ist eine mögliche Bezeichnung unserer
TA auf einer Fremdrechnung. Der Prompt unterscheidet ihn ausdrücklich von
internen Nummern des Ausstellers sowie Rechnungs-/Kundenkontonummern. Wörtlich
belegte neunstellige Auftragsreferenzen werden als unverbindliche Texthinweise
mitgegeben; sie ersetzen weder die Zuordnung zur konkreten Position noch den
anschließenden echten Auftragsabgleich. Es gibt keine automatische Übernahme
einer beliebigen neunstelligen Zahl oder einer Nummer aus dem Dateinamen.
