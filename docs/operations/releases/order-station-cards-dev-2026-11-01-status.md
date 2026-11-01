# Stationskarten und zusätzliche Transportdaten: Dev-Release 01.11.2026

Ausdrückliche Nutzerfreigabe: Hervorhebungen auf Rand/linken Streifen begrenzen,
Palettentausch Ja ebenfalls markieren, FIX in der Uhrzeitschrift anfügen und
den gesammelten Stand auf Dev veröffentlichen. Main und Produktion bleiben
unberührt. Ziel: `https://dev.drehpunktlogistik.de`, Firebase
`db-bpl-drehpunkt-dev`, Region `europe-west3`.

## Umfang und Integration

- Lokale Folgecommits `d292736` und `92629fb`: Reiter „Auftrag“ / „Kunde & UTN“,
  deutliche allgemeine Auftragsdaten, getrennte Stationskarten sowie zusätzliche
  bestätigte DyCoS-Daten einschließlich Importhistorie.
- `d9430f1`: markierte Karten behalten dieselbe neutrale Fläche. Gelber Rand und
  linker Streifen gelten bei neutraler Abholung/Anlieferung für die Adresse,
  bei Fixtermin für den Termin und bei Palettentausch true für dessen Karte.
  Referenzen bleiben neutral. Die separate Fixtermin-Ja/Nein-Zeile entfällt;
  bestätigtes true ergibt „ - FIX“ nach der Uhrzeit. FIX hat dieselbe Schrift,
  Größe und Stärke wie die Uhrzeit, nur seine Farbe unterscheidet sich.
- Der veröffentlichte Reminderstand `445fa65` wurde in `bb67ca1` übernommen.
  Die während der Vorbereitung veröffentlichten Profilreiter `5b174b1` wurden
  zusätzlich in `f0039ed` erhalten; nur Frontend-/Dokumentationsdateien betroffen.
  Der ursprüngliche Desktop-Arbeitsstand wurde nicht verändert.

Warenbeschreibung je Auftrag/Station, Fahrzeughinweise, Gefahrgutkennzeichen,
separates Stations-Volumengewicht und getrennte DyCoS-Kilometer für Auftrag und
Tour werden übernommen. Unbekannt bleibt von 0/false getrennt. Kilometer sind
Quellenwerte und keine bestätigte tatsächliche Fahrstrecke; Volumengewicht ist
kein Ersatz für physisches Gewicht. Maße-/Temperatur-/Volumeneinheiten und
weitere unbestätigte Feldbedeutungen bleiben offen, siehe
[Feldklärung](../../reference/dycos-feldklaerung-2026-10-31.md).

## Releaseprüfungen

- 71 gezielte Backendprüfungen und 30 echte Firestore-Emulatorprüfungen
  erfolgreich, 0 Fehler/übersprungen. Demo-Projekt `demo-drehpunkt-order-fields`,
  Port 8193, anschließend beendet. Geprüfter Backendstand `bb67ca1`; die spätere
  Profilübernahme ändert keine Functions.
- 16 Client-/Darstellungsprüfungen erfolgreich. Vollständiges ESLint und Build
  nach Integration erfolgreich; alle 45 deploybaren Shared-Module abgeglichen.
  Bekannte Firebase-Bundlewarnung unverändert.
- Synthetischer Browserablauf mit echten Komponenten: Kartenflächen identisch,
  getrennte Randmarkierung für Adresse/Termin/Palettentausch, Referenz neutral,
  FIX direkt nach der Uhrzeit. Schriftfamilie, Größe 20 px und Stärke 700 von
  Uhrzeit und FIX stimmen überein; ausschließlich FIX-Textfarbe abweichend.
  Keine echten Testmails oder künstlichen Nutzerkonten.

## Bereitgestelltes Backend

```powershell
firebase deploy --only "functions:fetchDycosTransportOrder,functions:refreshTransportOrderWorkspace" --project db-bpl-drehpunkt-dev --non-interactive
```

Beide Functions erfolgreich aktualisiert und aktiv. Vorher-/Nachher-Abgleich:
187 Dev-Functions, genau die zwei genannten Codehashes geändert, übrige 185
unverändert. Keine Function hinzugefügt oder entfernt. Keine weiteren
Reminder-/Mail-Endpunkte, Rules, Indizes, Storage oder Secrets bereitgestellt.
Lesende Rechnungsprüfungs-Fallbacks werten diese Transportdetails nicht aus und
persistieren sie nicht; sie benötigen für diesen Umfang keinen neuen Rollout.

Die optionalen Zusatzfelder werden für bestehende Aufträge beim nächsten
Auftragsabruf nach Backendbereitstellung gespeichert. Kein Massenimport,
keine neue Routingberechnung, keine zusätzliche Flow-Anfrage eingeführt.

## Frontend und Rückweg

Frontend wird mit diesem Releasebeleg ausschließlich nach `dev` gepusht;
Vercel-Status am veröffentlichten Commit separat kontrollieren. Vorheriger
Remote-Dev-Stand: `5b174b10195dcb3a6e626852218be0396e49af90`, erfolgreicher
Vercel-Status vor dem Push bestätigt. Auf diesen Stand kann das Frontend
zurückgestellt werden; bei Bedarf dieselben zwei Importfunktionen daraus
gezielt erneut nach Dev bereitstellen. Bereits übernommene optionale Felder
und Historien nicht löschen. Frontend-Rückkehr setzt Backend nicht zurück.

Remote-`main` vor Beginn unverändert:
`230c2ad86af9700118e2f1456746292241461efc`. Keine Übernahme nach Main, kein
Produktionsdeploy und keine Änderung von Produktionsdaten/-konfiguration.
