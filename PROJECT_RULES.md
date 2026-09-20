# Projektgrundsätze und Live-Release-Umfang

## Zweck und Systemgrenze

Drehpunkt ist eine geschlossene, desktoporientierte interne Anwendung für
fachliche Arbeitsabläufe, gemeinsame Stammdaten, Vorgänge, Dokumente und
Aufgaben. Die Anwendung ergänzt führende operative Systeme; sie ersetzt diese
nicht. Externe Systeme werden über fachliche Referenzen angebunden, ohne deren
Stammdaten oder operative Führungsrolle zu übernehmen.

Geschäftspartner bilden den zentralen Stammdatenbezug für Kunden und
Unternehmer. Fachmodule referenzieren diese Daten, statt sie mehrfach zu
kopieren. Dokumentdateien liegen in Firebase Storage; zugehörige Metadaten und
fachliche Vorgänge liegen in Firestore.

Der Produktumfang dieses Dokuments ist der aktuelle, auf `main` vorhandene und
für den ersten Livegang fachlich freigegebene Stand. Es werden damit keine
zusätzlichen Features angekündigt oder eingeplant.

## Verbindlicher Umfang des ersten Live-Releases

### Übersicht und Zusammenarbeit

- Dashboard
- Kalender und Feiertagskalender
- News
- Urlaub, Urlaubsmanagement, Personal und Team
- To-dos
- Persönliches Profil

### Kunden, Vorgänge und Disposition

- Kunden & Unternehmer als Geschäftspartner-Stammdaten
- CRM einschließlich Aktivitäten und Bewertungen
- Palettenmanagement mit Kontoübersichten und Detailansichten
- Schäden
- Insolvenzen
- Gericht / Streit
- Inkasso

### Dokumente und fachliche Hilfen

- Dokumente
- Vorlagen einschließlich Haftbarhaltung und Geschäftsdokumenten
- AGB-Prüfer

### Administration und Zugriffssteuerung

- Benutzerverwaltung
- Rollen, Modulrechte und aktive Benutzerprofile
- Systemmail-Verwaltung
- KI-Prompt-Verwaltung
- Abteilungs-, Personal-, Urlaubs- und Feiertagsverwaltungsabläufe im jeweils
  geschützten Umfang

Alle Fachmodule sind über die zentrale Berechtigungsregistrierung und
geschützte Routen eingebunden. Der Modulzugriff wird mit den Stufen `none`,
`view` und `edit` gesteuert. Die globalen Rollen sind `user`, `admin` und
`superadmin`; nur `superadmin` besitzt den allgemeinen Rechte-Override.
Administration ist keine Umgehung der Fachrechte: Der Zugriff auf Fachbereiche
folgt weiterhin dem jeweils zugewiesenen Modulrecht.

## Zugriffs- und Datenprinzipien

- Ein nutzbares Konto benötigt Firebase Authentication und ein aktives
  Benutzerprofil. Fehlende oder deaktivierte Profile erhalten keinen
  Anwendungszugriff.
- Browserzugriffe werden durch Firestore- und Storage-Rules erzwungen. Eine
  UI-Ausblendung ersetzt keine serverseitige Zugriffskontrolle.
- Geschützte Konto-, Rollen-, Rechte-, HR-, System- und Historienabläufe werden
  ausschließlich über dafür vorgesehene Callables oder serverseitige Trigger
  abgewickelt. Direkte Browser-Schreibzugriffe auf diese Daten sind nicht
  zulässig.
- Neue Datenstrukturen bleiben fachlich klar getrennt: Stammdaten, CRM,
  Paletten, Vorgänge, Dokumente und persönliche Daten werden nicht unnötig
  dupliziert.
- Historien und fachliche Statuswechsel bleiben nachvollziehbar. Wo Rules oder
  Functions append-only bzw. serverseitige Abläufe vorgeben, dürfen Clients
  bestehende Historieneinträge nicht nachträglich verändern.
- Secrets, Tokens, API-Keys, Service-Account-Dateien und externe
  Zugangsdaten gehören nicht in das Repository, in Client-Variablen oder in
  Anwendungsdaten.

Die verbindliche technische Zugriffsbeschreibung steht in
`FIRESTORE_ACCESS.md`. App-Check-Rollout und spätere
Enforcement-Entscheidungen stehen in `APP_CHECK_ROLLOUT.md`.

## Produkt- und Architekturgrundsätze

- Die Oberfläche bleibt ruhig, professionell und desktoporientiert. Navigation
  erfolgt ohne vollständigen Seitenreload über das gemeinsame App-Layout.
- Layout, Navigation, Seiten und wiederverwendbare Komponenten bleiben
  getrennt. Business-Logik gehört nicht in Layout-Komponenten.
- Themen, Farben und Light-/Dark-Mode werden zentral verwaltet. Neue
  Komponenten funktionieren in beiden Themes.
- Fachbereiche besitzen übersichtliche Listen- und Detailansichten. Formulare
  und Tabellen sind auf schnelle, nachvollziehbare operative Arbeit ausgelegt.
- Neue Abhängigkeiten, technische Sonderwege und Platzhalter werden nur bei
  belegtem fachlichem Bedarf ergänzt.

## Bewusste Produktgrenzen

- Drehpunkt ist kein Ersatz für führende operative Systeme und übernimmt keine
  unkontrollierte Synchronisation oder Kopie ihrer Stammdaten.
- Produktive Secrets und externe Zugangsdaten bleiben ausschließlich in den
  vorgesehenen serverseitigen oder Hosting-seitigen Verwaltungen.
- Direkte Client-Schreibzugriffe auf geschützte Konten, Rechte, HR-Daten,
  Systemkonfigurationen und Systemhistorien sind keine zulässige
  Erweiterungsoption.
- Der erste Live-Release umfasst nur die oben aufgeführten, bereits in Routen,
  Navigation und Berechtigungsmodell vorhandenen Bereiche. Nicht belegbare
  zukünftige Module gehören nicht zum Release-Umfang.

## Entwicklung nach dem Livegang

Die laufende Weiterentwicklung erfolgt künftig in einer separaten
Entwicklungsumgebung. Änderungen werden dort implementiert und geprüft; erst
freigegebene, gezielte Änderungen werden nach `main` übernommen. Production
bleibt stabil und ist kein Arbeitsbereich für laufende Entwicklung oder
unverifizierte Experimente.

Für jede Änderung gelten mindestens:

1. Betroffene Routen, Modulrechte, Firestore-/Storage-Regeln und Functions
   vorab prüfen.
2. Build, Lint und vorhandene Tests für den geänderten Stand ausführen.
3. Auswirkungen auf Rollen, aktive Profile, Storage, Callables und kritische
   Benutzerabläufe nachvollziehbar testen.
4. Nur den freigegebenen Umfang gezielt nach `main` übernehmen.

## Abnahme- und Änderungsregel

Neue Module sowie wesentliche Änderungen an Rollen, Modulrechten,
Datenmodellen, Rules, Storage-Pfaden oder privilegierten Functions benötigen
vor einem Production-Release eine dokumentierte Prüfung. Diese umfasst
mindestens Berechtigungen, Datenzugriff, betroffene Benutzerabläufe,
Build/Lint/Tests und die Release-Zuordnung.

Ohne diese dokumentierte Abnahme wird keine wesentliche Erweiterung nach
`main` für Production freigegeben.
