# Palettenkonten: gepflegte Summen und lokale Prüfung

Stand: 31.10.2026. Lokal implementiert, nicht veröffentlicht.

## Führende Daten und Berechnung

`palletMovements` und `palletClosings` bleiben die führenden Buchungen mit ihren
bestehenden IDs, Datumswerten und Historien. Die Detailansicht lädt weiterhin
die zum Partnercluster gehörenden Buchungen; sie verliert keine Historie.
Die Übersicht verwendet `listPalletAccountSummaries` statt alle Buchungen in
den Browser zu übertragen. Ohne fertigen Aufbau benutzt die Callable ausdrücklich
`mode: legacy` und berechnet vollständig aus den Quellen. Es gibt keine
stillen Nullsalden und keine teilweise aufgebauten Summen.

`palletSummaryState/current` zeigt auf eine vollständig veröffentlichte Generation.
`palletSummaryGenerations/{generation}/movements` enthält Summen je ursprünglicher
Teilnehmerkombination. Für jeden möglichen Clusterausschnitt sind positiver,
negativer und gesamter Buchungsbeitrag gespeichert. Dadurch bleiben auch interne
Umbuchungen, zusammengelegte Kunden/Unternehmer und die historische Vorrangregel
für `partnerId` exakt wie in `summarizePalletAccount` berücksichtigt.
`.../closings` enthält je ursprünglichem Partner die Summe der Korrekturen und
den neuesten Abschluss. Ein Merge oder eine Trennung ändert die aktuelle
Clusterzuordnung beim Lesen, ohne Originalbuchungen umzuschreiben.

Die Lesearbeit der Übersicht hängt von Partnern und unterschiedlichen
Teilnehmerkombinationen ab, nicht mehr von der gesamten Buchungshistorie.
Bei vielen ständig neuen Beziehungen wachsen auch die Summendokumente;
eine unveränderlich konstante Lesemenge wird nicht zugesichert.

## Schreibvertrag, Rechte und konkurrierende Nutzung

Alle Browseränderungen laufen über `savePalletRecord` (aktive Anmeldung,
App Check, `pallets: edit` beziehungsweise Superadmin). Direkte Browserwrites
auf die beiden Quellcollections werden durch Rules gesperrt. Die bisherigen
Leserechte bleiben bestehen. Die Summencollections und
`palletMutationReceipts` sind ausschließlich serverseitig erreichbar.

Buchung, Historie, Revision, Summen und idempotenter Vorgangsbeleg werden in
**derselben Firestore-Transaktion** geschrieben. Update/Delete verlangt die
beim Öffnen gelesene `expectedRevision` (Altdaten: 0); eine parallele Änderung
führt zu `aborted`, ohne die offenen Formulareingaben zu verwerfen. Änderungen
an Kunden-/Unternehmerzuordnung korrigieren die alte und neue Summengruppe.
Bei Abschlussänderung/-löschung werden höchstens die zwei neuesten Abschlüsse
je betroffenem Partner geprüft. Fehlende oder nicht als Firestore-Timestamp gespeicherte historische `createdAt` werden beim
Aufbau mit Timestamp 0 normalisiert, entsprechend der bisherigen Sortierung.

Eine stabile `operationId` verhindert doppelte Wirkung bei wiederholter Anfrage.
Der Client behält die Kennung für unveränderte Eingaben nach einem unklar
fehlgeschlagenen Aufruf im geöffneten Browser-Tab, einschließlich Neuladen.
Die Sessionablage enthält nur SHA-256-Schlüssel und zufällige Vorgangskennungen,
keine Buchungstexte; sie ist nach Benutzerkennung getrennt. Gleichzeitige identische
Anfragen teilen denselben laufenden Aufruf. Eine bestätigte Ablehnung verwirft
die Kennung. Falls die Sessionablage im Browser gesperrt ist, gilt die sichere
Wiederholung weiterhin im laufenden Seitenkontext; nach Neuladen ist dann vor
neuem Anlegen der tatsächliche Bestand zu kontrollieren. Bei unklarem Ausgang
mit **unveränderten Eingaben** erneut versuchen und den Bestand vor einer
absichtlich abweichenden neuen Buchung prüfen.

Ein bestätigter Speichererfolg wird getrennt vom folgenden Neuladen behandelt.
Schlägt nur das Neuladen fehl, schließt der Editor, der Nutzer erhält einen
Hinweis mit erneuter Lademöglichkeit und es wird kein zweites Anlegen angeboten.
Bei einem echten Speicherfehler oder Revisionskonflikt bleibt der Entwurf im
Editor erhalten. Die Revision wird nicht stillschweigend auf den neuen Stand
angehoben; konkurrierende Änderungen werden damit nicht automatisch überschrieben.
Während des ersten Ladens zeigt die Detailansicht keine Nullsalden und erlaubt
keinen Abschluss auf Basis noch nicht geladener Buchungen.


Die seltene Legacy-Trennung mit tatsächlichen Referenzumschreibungen markiert
die Summen im selben Batch als `dirty`; die Übersicht verwendet danach wieder
den vollständigen Legacy-Pfad. Normale identitätserhaltende Merge-/Trennabläufe
benötigen keinen Neuaufbau. Ein Neuaufbau und solche Legacy-Umschreibungen sind
gegenseitig gegen parallele Ausführung abgesichert. Neue Admin-SDK-Schreibwege
müssen den atomaren Summenvertrag ebenfalls einhalten oder im selben Commit
`palletSummaryState/current` invalidieren. Manuelle Admin-SDK-Datenänderungen
außerhalb dieses Vertrags sind kein unterstützter Betriebsweg.
Auch manuelle Änderungen oder Löschungen interner Summengruppen sind kein
unterstützter Betriebsweg. Der normale Schreibpfad prüft nicht jede Gruppe
erneut gegen das gesamte Quellenarchiv. Bei vermuteter Beschädigung muss vor
weiteren Buchungen eine vollständige neue Generation aufgebaut werden; besonders
eine fehlende Abschluss-Summengruppe wird derzeit nicht eigens auf Korruption
geprüft. Diese zusätzliche defensive Prüfung bleibt als Betriebsrest offen.

## Einmaliger Aufbau und spätere Wiederherstellung

Vor Umschalten auf günstige Abfragen den vorhandenen Bestand mit dem
Superadmin-Callable `rebuildPalletSummaries` vorbereiten. Jeder Aufruf verarbeitet
höchstens 100 Quellen; wiederholt aufrufen, bis `{ complete: true }` zurückkommt.
Der Zustand und Cursor werden mit den Summen atomar gespeichert. Nach Abbruch
wird mit dem nächsten Aufruf exakt fortgesetzt, ohne doppelte Summen.
`{ restart: true }` startet bei einem fertig aufgebauten/invalidierten Zustand
eine neue Generation; ein laufender Aufbau wird weitergeführt.

**Während `status: building` sind Palettenbuchungen vorübergehend gesperrt.**
Diese einmalige Wartungsphase betrieblich ankündigen und fertigstellen;
die Oberfläche bleibt lesbar und verwendet vollständige Quellen. Bei Ausfall
Aufbau wieder aufnehmen; kein Freischalten unvollständiger Summen.
Alte Generationen bleiben für Diagnose bestehen; spätere Bereinigung gezielt
und ausschließlich für nicht mehr referenzierte Generationen durchführen.

Der Aufbau ergänzt `tourNumberKey` (trim + deutsche Kleinschreibung) an allen
Bewegungen. Erst mit vollständigem Aufbau wird `tourCoverage: true` veröffentlicht.
`listTransportOrderPalletMovements` prüft beide Modulrechte (`transportOrders`
und `pallets`) und liest dann nur Bewegungen des Auftrags. Vor fertigem Aufbau
bleibt der vollständige normalisierte Legacy-Vergleich erhalten (`mode: legacy`).

## Bereitstellung und Prüfgrenzen

Ein späterer freigegebener Release muss die vier Callables, Client, Rules und
den Index `palletClosings: partnerId ASC, date DESC, createdAt DESC` gemeinsam
betrachten. Alte Clients mit direkten Writes erhalten nach neuer Rule eine
Zugriffsverweigerung; deshalb aktive Sitzungen beim Release aktualisieren.
Kein Push, kein Deploy und keine produktive Migration wurden ausgeführt.

Gezielte Unit-Tests vergleichen alle sieben Clusterausschnitte einschließlich
historischer Vorrangregel gegen die bestehende Berechnung. Ein echter lokaler
Firestore-Emulatortest prüft Aufbau mit Seitenwechsel/Wiederaufnahme,
Schreibsperre beim Aufbau, atomare Korrektur und Löschung, Wiederholungen,
Revisionskonflikte, Merge/Trennung, Abschlusswechsel und beide Tourabfragepfade.
Weitere Tests prüfen gleichzeitig eingehende Aktualisierungen und identische Wiederholungen, geänderte Teilnehmergruppen, veraltetes Löschen, ungewöhnliche Abschluss-ID-Reihenfolgen sowie sichere Wiederholung nach verlorenem Antwortpaket und Browser-Neuladen.
Die echte Browserabnahme (zwei gleichzeitige Benutzer, Konflikthinweis,
Erhalt von Eingaben, Deutsch/Englisch und Light/Dark) ist separat durchzuführen.

Die Dev-Abnahme vom 31.10.2026 prüft Anlegen, Ändern, Abschluss sowie den
Revisionskonflikt in zwei geöffneten Formularen derselben angemeldeten Identität;
der zweite Entwurf bleibt erhalten. Bestätigte fachliche Ablehnungen beim
Speichern werden anhand derselben Fehlercodes wie der Wiederholungsschutz
erkannt und nicht als technische Störung gemeldet. Unsichere/technische Fehler
sowie Lade- und Aufbaustörungen laufen weiter in die zentrale Diagnose.
Eine vollständige Live-Prüfung mit unterschiedlichen Rollen und in beiden
Sprachen/Farbmodi bleibt gesondert; Details im
[Dev-Releasebeleg](releases/cost-efficiency-dev-2026-10-31-status.md).
