# Haftbarhaltung – Dev-Stand vom 04.11.2026

## Umfang

TA-Suche für Vorlagennutzer, bewusster DyCoS-Abruf mit Speicherung, Auswahl mehrerer betroffener Lade-/Entladestellen, Übernahme in Vorschau/PDF und optionaler KI-Formulierungsvorschlag mit Prüfen, Übernehmen und Rückgängig. Die bestehenden festen KI-Regeln bleiben unverändert. Der Daten- und Rechtevertrag steht in [Haftbarhaltung](../liability-letters.md).

Die Implementierung liegt im separaten Arbeitsverzeichnis `C:/Users/domin/Desktop/Drehpunkt-liability-dev` auf `codex/liability-dev`, ausgehend vom aktuellen veröffentlichten Dev-Stand `520685b`. Der ursprüngliche Checkout enthielt ältere und umfangreiche uncommittete Arbeiten. Diese wurden weder überschrieben noch zusammen mit der Haftbarhaltung veröffentlicht.

## Prüfung

- Gesamtes `npm run lint`: bestanden; nach den letzten Anpassungen zusätzlich gezieltes ESLint.
- `npm run build` mit Dev-Clientkonfiguration: bestanden (bestehende Bundlegrößenwarnung).
- `npm run check:functions-shared`: 45 gemeinsame Module geprüft, bestanden.
- `node --test functions/diagnostics.test.js functions/liabilityWorkflow.test.js src/templates/liabilityLetterContent.test.js`: 30 Prüfungen bestanden, keine übersprungen.
- Firestore-Emulator, Projekt `demo-drehpunkt-liability`: `functions/liabilityWorkflow.integration.test.js` und `functions/dycosTransportOrders.integration.test.js`, 26 Prüfungen bestanden, keine übersprungen. Darunter TA-Speicherung und Wiederholung ohne doppelte Quellenabfrage, weiterhin gesperrter allgemeiner Import für reine Vorlagennutzer, verweigerte inaktive/fehlende Profile, KI-Quote und Rechteentzug während des Abrufs. Emulator danach beendet.
- Durchsicht: geänderte Stellenanschriften überstehen Ab-/Anwahl, unvollständige Anschriften erfordern Prüfung, veraltete KI-Vorschläge überschreiben keinen inzwischen geänderten Text.

## Veröffentlichung

Ausschließlich Firebase-Projekt `db-bpl-drehpunkt-dev`; drei neue Functions `findLiabilityTransportOrders`, `fetchLiabilityTransportOrder`, `suggestLiabilityWording` und ergänzte `reportClientDiagnostic`. Keine Rules-/Index-/Storage-Änderung erforderlich. Bestehende Dev-Konfigurationswerte lokal übernommen; vorhandenes Secret `OPENAI_API_KEY_HAFTBARHALTUNG` Version 1 aktiv, kein Secretwert ausgegeben oder versioniert.

Firebase-Deploy der vier genannten Functions erfolgreich abgeschlossen. Frontend wird mit diesem Commit über den Git-Dev-Branch und dessen Vercel-Preview veröffentlicht; der Buildstatus wird danach geprüft. Main/Produktion sind nicht freigegeben und bleiben unverändert.

## Offene echte Abnahme

Die Browsersteuerung hat den Zugriff beendet, weil die aktuelle URL unter Windows nicht zuverlässig bestimmt werden konnte. Es wurde kein alternativer Zugriff zur Umgehung verwendet. Damit sind der angemeldete Benutzerablauf, der echte DyCoS-Abruf über diesen Einstieg, der bezahlte KI-Vorschlag und die visuelle Prüfung in Light/Dark sowie DE/EN noch offen. Die Emulatorprüfungen ersetzen diese Abnahme nicht.

Gemeinsam in Dev prüfen: vorhandene TA auswählen; fehlende TA abrufen und danach wiederfinden; Stellen auswählen und korrigieren; Sachverhalt vorschlagen/übernehmen/rückgängig; PDF und Druck; Testnutzer mit ausschließlich Vorlagenrecht. Erst danach Production-Übernahme gesondert freigeben.
