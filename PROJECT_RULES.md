# Projektgrundsätze

## Allgemein
- Projektname: Drehpunkt
- Interne Unternehmensanwendung
- Fokus auf Desktop-Nutzung
- Modular und langfristig erweiterbar aufbauen
- Bestehende Strukturen nicht unnötig komplizieren
- Keine Funktionen auf Vorrat entwickeln
- Neue Features immer so bauen, dass sie später erweitert werden können
- Saubere Trennung von Layout, Navigation, Seiten und wiederverwendbaren Komponenten

## UX & Design
- Ruhige, professionelle Business-Oberfläche
- Modern, aber nicht verspielt
- Keine typische überladene SaaS-Optik
- Keine Gradients
- Keine unnötigen Animationen
- Klare visuelle Hierarchie
- Großzügige Abstände bei normalen Inhaltsbereichen
- Listen und Tabellen dagegen kompakt darstellen
- Inhalte möglichst so strukturieren, dass Seiten im normalen Desktopbetrieb wenig oder gar nicht scrollen müssen
- Scrollen nur dort einsetzen, wo es inhaltlich sinnvoll oder notwendig ist
- Gute Informationsdichte ohne gequetschte Darstellung
- Einheitliche Abstände, Typografie und Komponenten im gesamten Projekt
- Funktionen sollen möglichst selbsterklärend sein
- Keine unnötig langen Texte in der UI

## Navigation
- Hauptnavigation befindet sich links
- Sidebar ist ein- und ausklappbar
- Ausgeklappt: Icon + Menüname
- Eingeklappt: nur Icons
- Aktive Navigation klar, aber dezent hervorheben
- Hauptnavigation muss später leicht um weitere Module ergänzt werden können
- Navigation ohne vollständigen Seitenreload

## Architektur
- Wiederverwendbare Komponenten erstellen
- Gemeinsames App-Layout verwenden
- Sidebar und Header nicht pro Seite duplizieren
- Seiten sauber über Routing trennen
- Keine Business-Logik direkt in Layout-Komponenten
- Komponenten und Dateien nachvollziehbar benennen
- Keine unnötigen Abhängigkeiten installieren
- Bestehenden Tech-Stack des Projekts respektieren
- Firebase zentral in einer Infrastrukturdatei kapseln; Produktlogik bleibt davon getrennt
- Firestore und künftige Authentifizierung nur bedarfsorientiert über diese zentrale Integration anbinden
- Geschäftspartner zentral führen; Kunde und Unternehmer sind Rollen desselben Geschäftspartners
- Die interne operative Plattform heißt „DyCoS“
- Externe Systeme über Referenznummern mit Drehpunkt verknüpfen
- DyCoS-Debitoren- und Kreditorennummern ausschließlich als Strings und externe Referenzen behandeln
- Niederlassungen als separate Geschäftspartner führen
- Geschäftspartner besitzen genau einen Stammdatensatz
- Tabellen kompakt halten
- Formulare desktoporientiert und möglichst kompakt aufbauen
- Erfolgreiche Aktionen über dezente Toast-Nachrichten bestätigen
- Stammdaten bevorzugt in direkt bearbeitbaren Masken darstellen
- Separate Anzeige- und Bearbeitungsseiten vermeiden, wenn dieselben Daten betroffen sind
- Interne Stammdatenmasken kompakt und auf schnelle Datenerfassung auslegen
- Stammdaten und CRM als getrennte fachliche Bereiche behandeln
- Stammdaten als zentrale Quelle für Geschäftspartner-Grunddaten verwenden
- CRM-Funktionen über die interne Firestore-ID mit Geschäftspartnern verknüpfen
- Stammdaten im CRM nicht unnötig duplizieren
- Fachbereiche direkt verlinken, wenn dadurch unnötige Suche vermieden wird
- Palettenmanagement als eigenen Fachbereich behandeln
- Palettenkonten über die interne Firestore-ID mit Geschäftspartnern verknüpfen
- Geschäftspartner-Stammdaten im Palettenmanagement nicht duplizieren
- Aus Stammdaten direkte Sprünge in partnerbezogene Fachbereiche ermöglichen
- Fachbereiche besitzen eigene Übersichten und Detailseiten
- CRM verwendet Geschäftspartner-Stammdaten ausschließlich als Basisreferenz
- CRM-Übersichten dürfen andere Spalten zeigen als Stammdatenübersichten
- CRM-Detailseiten kompakt und informationsorientiert aufbauen
- Palettenmanagement besitzt eine zentrale Kontoübersicht und partnerbezogene Detailkonten
- Ein Palettenkonto besteht aus Transportbewegungen sowie separaten Abschluss- und Korrekturbuchungen
- Kontoabschlüsse verändern den Saldo, nicht jedoch historische Bewegungen
- Kontostände müssen aus der Buchungshistorie nachvollziehbar berechnet werden
- Geschäftspartner-Stammdaten im Palettenmanagement nur referenzieren, nicht duplizieren
- Fachseiten verwenden eine einheitliche maximale Inhaltsbreite
- Tabellen- und Listenansichten folgen einer gemeinsamen Breite und Gestaltung
- Doppelte Seitentitel innerhalb derselben Ansicht vermeiden
- Abkürzungen in der Navigation kurz halten und Seitentitel bei besserer Verständlichkeit ausschreiben
- Palettenbewegungen bilden reale Transportvorgänge ab, keine manuell erzeugten Soll- oder Haben-Buchungen
- Erhaltene und abgegebene Paletten ausschließlich als positive Stückzahlen oder 0 eingeben
- Vorzeichen ausschließlich durch die Berechnungslogik erzeugen
- Palettenbewegungen fachlich aus Sicht des Unternehmers berechnen und Kundenwirkungen automatisch spiegeln
- Kunde und Unternehmer können optional sein; mindestens ein beteiligter Geschäftspartner ist erforderlich
- Eine reale Palettenbewegung genau einmal speichern
- Palettenkonten primär tourbezogen darstellen
- Tour oder interne Referenz als zentralen Bezugspunkt einer Transportbewegung verwenden
- Stationswerte direkt sichtbar halten und nicht hinter Detail-Aufklappungen verbergen
- Reale Bewegungsdaten unabhängig von der Kontoperspektive identisch halten; nur Saldoauswirkung und Kontostand partnerbezogen darstellen
- Geschäftspartner besitzen einen allgemeinen Firmenkontakt und können zusätzlich mehrere Ansprechpartner haben
- Ansprechpartner kompakt tabellarisch darstellen
- Abteilungen bevorzugt über standardisierte Auswahlwerte pflegen
- Ansprechpartner gehören fachlich zum jeweiligen Geschäftspartner
- Palettenbewegungen dürfen nachträglich korrigiert werden
- Änderungen an historischen Bewegungen müssen nachfolgende Kontostände vollständig neu berechnen
- Eine Bewegung wird weiterhin nur einmal gespeichert
- Bearbeitungen müssen zumindest technisch nachvollziehbar bleiben
- createdAt bleibt unverändert, updatedAt wird bei Korrekturen aktualisiert
- Fallmanagement wird fachlich in Rechtsfälle, Inkassofälle und Versicherungs-/Schadensfälle getrennt.
- Jeder Fall besitzt eine Übersicht und eine direkt bearbeitbare Fallakte.
- Status und Fristen werden strukturiert gespeichert und nicht ausschließlich als Freitext.
- Geschäftspartner werden über ihre interne Firestore-ID referenziert.
- Fallübersichten verwenden den gemeinsamen kompakten Tabellenstandard.
- Datenmodelle sollen spätere modulübergreifende Fristenauswertungen ermöglichen.
- Operative Eingabemasken orientieren sich am realen Arbeitsablauf und nicht an der technischen Buchungslogik
- Berechnete Zwischenwerte werden nicht zwischen Eingabefeldern dargestellt, wenn sie für die Datenerfassung nicht erforderlich sind
- Bei komplexen Buchungen werden Eingabe und Ergebnis visuell klar getrennt
- Informationen dürfen innerhalb einer Maske nicht unnötig doppelt dargestellt werden
- Der aktuelle Fachbereich wird immer im zentralen App-Header angezeigt
- Seitentitel werden nicht zusätzlich im Inhaltsbereich wiederholt
- Detailseiten zeigen im Header den Fachbereich und im Inhalt den konkreten Datensatz

## CRM-Aktivitäten
- CRM-Aktivitäten werden chronologisch und dauerhaft dokumentiert.
- Aktivitätsart und Hinweisstufe sind getrennte Eigenschaften.
- Wachsende Historien werden als eigene Firestore-Subcollections gespeichert.
- Historien werden kompakt und scrollbar dargestellt, damit Detailseiten nicht unbegrenzt wachsen.
- Neue Historieneinträge werden standardmäßig zuerst angezeigt.

## CRM-Bewertungen
- Geschäftspartnerbewertungen gehören fachlich ins CRM und nicht in die Stammdaten.
- Kunden- und Unternehmerbewertungen werden getrennt geführt.
- Höhere Bewertungswerte bedeuten bei allen Kriterien eine bessere Bewertung.
- Neue Bewertungen überschreiben keine historischen Bewertungen.
- Die jeweils neueste Bewertung gilt als aktueller Bewertungsstand.
- Bewertungen sollen mit Datum und optionaler Begründung nachvollziehbar bleiben.

## Qualitätsmanagement
- Qualitätsmanagement ist ein eigener Fachbereich.
- Qualitätsziele besitzen eigene Detailseiten und nachvollziehbare Fortschrittswerte.
- Maßnahmen, Abweichungen, Audits und Verbesserungen werden strukturiert geführt.
- Status und Fristen werden nicht ausschließlich als Freitext gespeichert.
- QM-Fristen sollen später zentral auswertbar sein.

## Wissen
- Wissen wird als eigener Fachbereich mit Kategorien und suchbaren Artikeln geführt.
- Wissensartikel werden zentral in Firestore gespeichert und direkt bearbeitet.
- Kategorien strukturieren den Inhalt, ohne Artikel in technische Einzelseiten aufzuteilen.
- Titel, Kurzbeschreibung und Inhalt eines Artikels bleiben klar voneinander getrennt.

## To-dos
- To-dos können persönlich oder an Abteilungen adressiert werden.
- Abteilungs-To-dos besitzen einen gemeinsamen Status für alle Mitglieder.
- Abteilungs-To-dos können freiwillig von einem Benutzer übernommen werden.
- Benutzer dürfen sich nur selbst als Bearbeiter eintragen.
- Ersteller, Empfänger und Bearbeiter sind fachlich getrennte Rollen.
- To-do-Datenstrukturen müssen spätere benutzer- und abteilungsbezogene Zugriffsrechte ermöglichen.

## Dispo-Cockpit
- Das Dispo-Cockpit ist eine Ressourcen-Zeit-Matrix für eingesetzte Fahrzeuge, kein herkömmlicher Kalender.
- Fahrzeuge stehen vertikal, die Zeitachse horizontal; Touren werden über ihre exakten Start- und Endzeiten positioniert.
- Jedes Fahrzeug hat zwei visuelle Spuren. Nicht überlappende Touren belegen die erste freie Spur; mehr als zwei gleichzeitige Touren sind ein sichtbarer Planungskonflikt.
- Operative Planungsansichten sind informationsdicht und für schnelle visuelle Erfassung ausgelegt.
- Für den Bereich werden die Firestore-Collections `fleetVehicles` und `dispatchTrips` verwendet.

## Entwicklung
- Vor größeren Änderungen zuerst bestehende Struktur prüfen
- Bestehende Funktionen nicht unbeabsichtigt verändern
- Keine Dummy-Funktionen implementieren, wenn sie aktuell nicht benötigt werden
- Platzhalter nur dort verwenden, wo sie für die spätere Struktur sinnvoll sind
- Code sauber und wartbar halten
- Nach Änderungen Anwendung lokal prüfen
- Build / Lint / vorhandene Tests ausführen, soweit vorhanden
- Fehler vor Abschluss beheben
