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

## Entwicklung
- Vor größeren Änderungen zuerst bestehende Struktur prüfen
- Bestehende Funktionen nicht unbeabsichtigt verändern
- Keine Dummy-Funktionen implementieren, wenn sie aktuell nicht benötigt werden
- Platzhalter nur dort verwenden, wo sie für die spätere Struktur sinnvoll sind
- Code sauber und wartbar halten
- Nach Änderungen Anwendung lokal prüfen
- Build / Lint / vorhandene Tests ausführen, soweit vorhanden
- Fehler vor Abschluss beheben
