# Auftragsakte und Mailreiter: Dev-Release vom 01.11.2026

Ausdrückliche Nutzerfreigabe: die bisher gesammelten Änderungen auf Dev
veröffentlichen; der Nutzer prüft sie dort. Main und Produktion bleiben
unberührt. Ziel: `https://dev.drehpunktlogistik.de`, Firebase
`db-bpl-drehpunkt-dev`, Region `europe-west3`.

## Stand und Umfang

Auftragsänderungen: `0c3aa27`, mit dem inzwischen veröffentlichten Dev-Stand
`0b27039` in `afd818b` zusammengeführt. Der ursprüngliche Desktop-Arbeitsstand
wurde nicht verändert. Konflikte in `MailWorkDialog` und dessen CSS wurden
unter Erhalt der neuen Postfach-Fußleisten und der neuen Auftrags-Mailspalte
aufgelöst. Die bereits veröffentlichten Erinnerungs- und Postfachfunktionen
bleiben erhalten.

- Breiter Stationsablauf mit Adressblöcken, Terminen, vollständigen Hinweisen
  und Stationsmengen; kompakte Transportdaten und Dispositionshinweis.
- Geschäftspartner in zwei Spalten, ohne zusätzliche Auftragsangabenkarte
  oder rechte Verknüpfungsspalte.
- Tracking ohne zusätzliches Auftrags-/Historienmenü, doppelte importierte
  Finanz-/Warentabellen und rechte Kontakt-/Import-/Mailspalte.
- „Zugeordnete Mails“ als Dialogreiter: Mailliste links, Text mittig,
  Trackingeditor rechts, anfänglich gleich breite Inhalts-/Trackingspalten,
  nachladbare ältere Mails und erhaltener lokaler Trackingentwurf.
- `LadeEntladestellen2.Fixtermin` wird als boolean übernommen, in den
  Stationen/Projektionen/Historien bewahrt und in den Terminanzeigen verwendet.
  Unbekannt bleibt von false getrennt. Bestehende Aufträge erhalten das Feld
  beim nächsten Auftragsabruf; kein automatischer Massenimport.

## Prüfungen des kombinierten Releasecodes

- Vollständiges ESLint und Produktionsbuild erfolgreich. Bestehende große
  Firebase-Bundlewarnung bleibt; kein neuer Buildfehler.
- Abgleich aller 45 deploybaren Shared-Module erfolgreich.
- 74 gezielte Frontend-/Darstellungs-/Navigationsprüfungen erfolgreich.
- 61 Backendprüfungen für Mapper, Importhistorie, Workspace und lesende
  Rechnungsprüfung erfolgreich.
- 29 echte Firestore-Emulatorprüfungen erfolgreich, keine übersprungen:
  `demo-drehpunkt-order-fields`, Port 8193; Emulator anschließend beendet.
  Unter anderem Fixtermin true/false/null, Speicherung/Historie,
  Wiederholungsschutz und Rechte geprüft.
- Frühere synthetische Browserprüfung und konkret offene Nachprüfungen sind
  im [Fachvertrag](../order-workspace.md#lokale-mailerweiterung-vom-01112026)
  getrennt beschrieben. Kein künstlich angemeldeter Nutzer, keine Testmail
  und keine echten Auftragsänderungen für diese Veröffentlichung.

## Bereitstellung

Backend gezielt nur für die geänderten importierenden Handler:

```powershell
firebase deploy --only "functions:fetchDycosTransportOrder,functions:refreshTransportOrderWorkspace" --project db-bpl-drehpunkt-dev --non-interactive
```

Der erste Aufruf mit nicht quotierter Filterliste wurde vor einer Bereitstellung
abgebrochen; anschließend wurde die oben gezeigte explizite Filterliste verwendet.
Beide Functions wurden erfolgreich aktualisiert und anschließend als `ACTIVE`
bestätigt. Der Vorher-/Nachher-Abgleich umfasst 187 Dev-Functions: genau die
beiden genannten Codehashes wurden geändert, die übrigen 185 blieben gleich;
keine Function hinzugefügt oder entfernt. Die lesenden Mappernutzer
`reviewMailboxInvoices` und `processMailboxActionRun` werten Fixtermin nicht aus
und speichern diesen Import nicht; sie werden hierfür nicht erneut ausgerollt.
Keine Rules-, Index-, Storage-, Secret- oder Reminderänderung in diesem Release.

Frontend wird mit diesem Releasebeleg ausschließlich nach `dev` gepusht.
Der zugehörige Vercel-Status ist am veröffentlichten Commit zu prüfen; ein
erfolgreicher Frontendbuild ersetzt nicht den gesonderten Backendnachweis.
Die fachliche Abnahme auf Dev übernimmt wie beauftragt der Nutzer.

## Rückweg und Produktionsgrenze

Vorheriger Remote-Dev-Stand: `0b27039120942de7f05c5e235ac5989490455594`,
Vercel meldete dafür Erfolg. Frontend kann auf diesen vorherigen Stand
zurückgestellt werden; bei Bedarf die beiden genannten Importfunktionen aus
diesem Stand erneut gezielt in Dev bereitstellen. Bereits gespeicherte
Fixterminwerte und Historien nicht löschen; sie sind abwärtskompatible Ergänzungen.

Remote-`main` vor der Bereitstellung:
`230c2ad86af9700118e2f1456746292241461efc`. Kein Push nach Main, kein
Produktionsdeploy und keine Änderung von Produktionsdaten oder -konfiguration.
