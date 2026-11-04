# Mail-Anhangshinweise, Zahlungsziel und Factoring – Dev 04.11.2026

Der Nutzer hat die besprochenen Erweiterungen ausdrücklich für Dev freigegeben.
Ziel ist ausschließlich `db-bpl-drehpunkt-dev` und `dev.drehpunktlogistik.de`.
Main, Produktion, Microsoft-Grants und Produktionsdaten bleiben unverändert.
Die bereits auf Dev vorhandene Änderung `5359e3b` bleibt beim Zusammenführen erhalten.

## Umfang

- Handlungsempfehlungen prüfen bei ausdrücklich festgestelltem Kontextmangel
  höchstens zwei passende Anhänge, je 5 MiB. PDFs liefern höchstens zwei Seiten;
  unlesbare Texte erhalten eine begrenzte OCR dieser Seiten. Kein Nachholen,
  Polling, automatisches Modal oder Ausführen der empfohlenen Fachaktion.
- Zahlungsziel bleibt ein Hauptprüfpunkt. Explizite Tage und die Differenz von
  Fälligkeits- und Rechnungsdatum stehen gemeinsam dort. Zahlungsart entfällt.
  Abweichende Fristbeginne und Tagesarten bleiben unterscheidbar.
- Factoring/Forderungsabtretung erhält einen Hauptprüfpunkt: konkreter Fund gelb
  mit gelbem Hinweis, kein Fund auf Nutzerwunsch grün. Quellen stammen aus den
  Rechnungsseiten; Verneinungen, Werbung oder ein Firmenname allein reichen nicht.
- Neue Berichte haben Version 6. Historische Berichte werden nicht neu erkannt
  oder mit einem erfundenen Factoring-Erfolg ergänzt. Zum erneuten Auslesen ist
  „Mit aktuellen Auftragsdaten erneut prüfen“ erforderlich.

Führende Verträge: [Rechnungsprüfung](../mailbox-invoice-review.md) und
[Handlungsempfehlungen](../mailbox-recommendations.md).

## Bereitstellung und Prüfung

Gezielter Dev-Deploy für `reviewMailboxInvoices`, `processMailboxActionRun` und
`processMailboxRecommendationRun` (dieser mit 512 MiB). Die Invoice-Callable und
der Hintergrundworker benötigen beide die aktuelle Codeversion. Keine Änderung
an Rules, Indizes oder Secrets. Frontend über den Dev-Branch bereitstellen.

266 gezielte Unit-/Vertragsprüfungen erfolgreich, einschließlich einer zusätzlichen
Regression für `unassigned`/`unsold`/`unfactored`. 18 Empfehlungstests im Firestore-
Emulator sowie der Invoice-Speicher-/Transportverknüpfungstest erfolgreich; kein
übersprungener Test. Lint, Build und Shared-Abgleich erfolgreich. Bekannte
Buildwarnung zu großen bestehenden Bundles bleibt bestehen.

Kontrollierte Modellprüfungen: Die echte Rechnung 1068/05/2026/WAW/D4 liefert
45 gedruckte Tage sowie 45 Tage aus 14.05.2026 bis 28.06.2026, in einer grünen
Prüfzeile gegen 45 Tage netto. Konkrete englische Forderungsabtretung wird gelb,
ausdrückliche Verneinung grün. Keine Testmail versendet und keine Zahlung,
Buchung oder DyCoS-Änderung ausgelöst. Die Anhangs-Kurzprüfung erkennt eine echte
Rechnung auch unter neutralem Betreff; die ersten beiden Seiten der bekannten
DOKUMENTY-Datei liefern CMR/Wareneingangsbeleg ohne erfundene Rechnung.

Bei Problemen können KI-Empfehlungen deaktiviert und die manuellen Aktionen
weiterverwendet werden. Keine Wiederherstellung des alten Kontrollpollings.
Für einen Rückgang der Rechnungslogik sind Frontend und beide Rechnungs-Backends
gemeinsam zu betrachten; gespeicherte Berichte bleiben unverändert erhalten.
