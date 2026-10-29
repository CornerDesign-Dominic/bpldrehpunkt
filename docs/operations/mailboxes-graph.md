# Persönliche Postfächer über Microsoft Graph

Stand: 29.10.2026. Implementierung und Dev-Release; Veröffentlichungsnachweise
und die noch offene echte Exchange-Abnahme werden unten getrennt beschrieben.

## Umfang und führendes System

`/postfaecher` ist ein eigener Arbeitsbereich mit paginiertem Posteingang,
Nachrichtenansicht und Antwortbereich. Der eigene Navigationsbereich
„Postfächer“ enthält die persönlichen verbundenen Postfächer einzeln und markiert
genau das geöffnete Postfach. Verbinden, Trennen und die Vergabe eines eigenen
Namens erfolgen in den Benutzereinstellungen unter `/profil#postfaecher`.
Ohne eigenen Namen erscheint die Mailadresse, nicht der Microsoft-Anzeigename.
Der Name bleibt beim erneuten Verbinden erhalten. Die gewählte Verbindung und
Nachricht stehen in URL-Parametern. Die letzte Auswahl wird je Drehpunkt-Nutzer
als lokale Navigationseinstellung gemerkt, ohne Mailtexte oder Zugangsdaten.

Die große zusätzliche Postfachüberschrift entfällt; die Navigation zeigt das
aktive Postfach. Abgegrenzte Nachrichtenkarten und Empfängerbeschriftungen links
neben den Antwortfeldern nutzen den Platz kompakter. Trennlinien gliedern
erkannte deutsche/englische Outlook-Antwortköpfe und übliche „schrieb/wrote“-Zeilen.
Unbekannte Formate bleiben unverändert; alle Textzeichen bleiben erhalten.

Die Suche fragt direkt die Graph-Nachrichtensammlung des Posteingangs ab,
statt nur geladene Karten zu filtern. Sie erfasst standardmäßig Absender,
Betreff und Mailtext. Graph begrenzt diese Suche auf bis zu 1.000 Ergebnisse;
die Oberfläche weist darauf hin. Suche und Zurücksetzen ändern weder die
geöffnete Nachricht noch deren Antwortentwurf. Folgeseiten sind zusätzlich an
den Suchbegriff gebunden. Suchbegriffe werden nicht als Navigationseinstellung
oder Diagnose gespeichert. Für die Suche sind keine zusätzlichen Rechte nötig.

Microsoft Exchange Online führt Nachrichten und Originalanhänge. Drehpunkt
fragt sie bei Bedarf serverseitig über Microsoft Graph ab. Nachrichtentexte
werden als Klartext angezeigt; externe Bilder und aktives Mail-HTML werden
nicht eingebettet. PDF-Anhänge werden vorübergehend im Browser angezeigt,
andere unterstützte Dateianhänge heruntergeladen. Die erste Version begrenzt
Dateianhänge auf 5 MiB. Verknüpfte Cloud-Dateien und angehängte Outlook-Elemente
sind kein unterstützter Dateiabruf. Die Nachrichtenansicht meldet eine gekürzte
Anhangsliste, wenn Microsoft weitere Seiten liefert.

Antworten enthalten bearbeitbare An-/CC-/BCC-Empfänger und Klartext. Der
Entwurf liegt privat serverseitig in Drehpunkt, nicht als Outlook-Entwurf.
`Mail.ReadWrite` wird nicht angefordert: Nachrichten werden nicht als gelesen
markiert, verschoben oder gelöscht. Gemeinsame Postfächer, PDF-Auswertung,
Auftragserstellung, Übernahme von Trackingdaten und Antwortvorschläge gehören
nicht zum ersten Umfang. Dafür gibt es keine funktionslosen Aktionsangebote.
Die vorhandene Power-Automate-Anbindung von `status@` bleibt unabhängig.

## Berechtigungen und persönliche Daten

Das Modul heißt `mailboxes`. `view` erlaubt nur lesende Abfragen der eigenen
Verbindungen, Nachrichten, Anhänge und Entwürfe. `edit` erlaubt zusätzlich
Verbinden, Trennen, den persönlichen Postfachnamen ändern, Entwurf speichern
und ausdrücklich ausgelösten Versand.
Die Kontenverwaltung muss das neue Modulrecht bewusst vergeben; bestehende
Nutzer erhalten nicht automatisch Zugriff.

Jede Callable prüft Firebase-Anmeldung, aktives Profil, App Check, Modulrecht
und Eigentümer der konkreten Verbindung. Auch der Superadmin-Override für das
Modul gewährt keinen Zugriff auf fremde persönliche Postfächer. Alle
`mailbox*`-Collections sind für direkte Browserzugriffe gesperrt (Default-deny
der vorhandenen Rules); Zugriffe erfolgen ausschließlich über Functions.
Diagnose darf keine Mailtexte, Betreffe, Empfängerlisten oder Tokens enthalten.

## Microsoft Entra: Dev vorbereiten

Registrierung **Drehpunkt Mail – Dev**, nur eigener Mandant:

- Mandant: `b829bbdc-c0b7-4128-a341-6715a67b451b`
- Client-ID: `a23dc8d8-e22a-40ef-997c-d28aa753ee29`
- Delegiert: `User.Read`, `Mail.Read`, `Mail.Send`, `offline_access`
- Unternehmensanwendung: Zuweisung erforderlich; ausschließlich Testnutzer
  zugewiesen. Die vollständige Testadresse wird als Serverparameter gesetzt.
- Wegen erforderlicher Zuweisung Administratorzustimmung für die obigen
  Berechtigungen erteilen. Dies gewährt keine organisationsweiten
  Anwendungsberechtigungen auf sämtliche Postfächer.
- Unter Authentifizierung Plattform **Web**, nicht SPA, konfigurieren.
  Die Rücksprungadresse muss exakt `MAILBOX_REDIRECT_URI` entsprechen.
  Bei Verwendung der regionalen Firebase-Adresse lautet sie
  `https://europe-west3-db-bpl-drehpunkt-dev.cloudfunctions.net/mailboxOAuthCallback`.
- Kein impliziter Flow, kein öffentlicher Client. Der Server tauscht den
  Autorisierungscode mit PKCE und Client-Geheimnis aus.

Ein Entra-Client-Geheimnis nur serverseitig als `MAILBOX_CLIENT_SECRET` im
Secret Manager des Firebase-Projekts `db-bpl-drehpunkt-dev` hinterlegen.
Den Wert niemals in Chat, Git, Clientvariablen oder Diagnoseausgaben kopieren.
Die Entra-Ablaufzeit und Rotation müssen betrieblich verfolgt werden.

## Serverkonfiguration und Secret Manager

Parameter für **db-bpl-drehpunkt-dev**:

| Name | Inhalt |
| --- | --- |
| `MAILBOX_REDIRECT_URI` | `https://europe-west3-db-bpl-drehpunkt-dev.cloudfunctions.net/mailboxOAuthCallback` |
| `MAILBOX_FRONTEND_ORIGIN` | `https://dev.drehpunktlogistik.de` (vom Nutzer bestätigte Dev-Adresse) |
| `MAILBOX_TEST_ACCOUNT` | `bb@brennpunkt-logistik.de` (vom Nutzer bestätigtes Testpostfach) |

Die drei nicht geheimen Werte sind lokal in der ignorierten Datei
`functions/.env.db-bpl-drehpunkt-dev` für das explizite Firebase-Dev-Ziel
vorbereitet. Dies ist noch keine veröffentlichte Serverkonfiguration.

Leere Einrichtung wird verständlich abgewiesen. Die Freigabe hängt zusätzlich
vom tatsächlich erkannten Firebase-Projekt ab: Produktion und unbekannte
Laufzeitumgebungen werden abgewiesen. Dev-Antworten dürfen ausschließlich an
Adressen mit der exakten Domain `brennpunkt-logistik.de` gehen, auch in CC
und BCC. Der Name vor dem `@` ist frei wählbar; Groß-/Kleinschreibung wird
normalisiert. Eine separate Liste einzelner Empfänger ist nicht erforderlich.
Subdomains und ähnlich geschriebene Domains sind ausgeschlossen. Eine
empfangene externe Mail ist keine Freigabe für eine externe Testantwort.

Zugangs- und Erneuerungstokens werden als Versionen eigener
`drehpunkt-mailbox-*`-Secrets gespeichert. Firestore enthält nur die
Eigentümer-/Verbindungsmetadaten und Referenzen zu diesen Secrets. Der
OAuth-Zustand ist kurzlebig, einmalig und an den Drehpunkt-Nutzer gebunden;
der PKCE-Prüfwert liegt dort nur authentifiziert verschlüsselt vor.
Zusätzlich erzeugt der startende Browser einen zufälligen Nachweis in seiner
Sitzung. Nach dem Microsoft-Callback werden die Tokens zunächst nur als
kurzlebige ausstehende Verbindung gespeichert. Erst die authentifizierte
`finishMailboxConnection`-Callable mit diesem Browsernachweis aktiviert die
Verbindung. Ein weitergegebener Anmeldelink oder ein fremder Browser kann
dadurch kein Postfach für den ursprünglichen Nutzer aktivieren.

Die Secret Manager API muss im Dev-Projekt aktiviert sein. Der ausführende
Functions-Serviceaccount benötigt für diese dynamischen Verbindungssecrets
die Berechtigungen `secretmanager.secrets.create`,
`secretmanager.versions.add`, `secretmanager.versions.access` und
`secretmanager.versions.get`, `secretmanager.versions.destroy`,
`secretmanager.secrets.delete`. Nur die tatsächlich nötigen IAM-Rechte
einrichten; kein pauschales Projekt-Owner-Recht. Bei den ressourcenbezogenen
Rechten den vorgesehenen Secret-Namensbereich beschränken, soweit IAM dies
für die jeweilige Operation unterstützt. Secret-Erstellung verlangt eine
Projektberechtigung. Statische Function-Secret-Bindings allein geben keine
Rechte zum Verwalten dynamischer Postfachsecrets.

Beim Trennen wird die Verbindung gesperrt und das zugehörige Token-Secret
gelöscht. Das ersetzt keine Rücknahme der App-Zustimmung in Entra. Vorhandene
private Antwortentwürfe werden nicht mit dem Originalpostfach synchronisiert.
Ersetzte Tokenversionen werden zerstört. `cleanupMailboxConnections` entfernt
stündlich abgelaufene OAuth-Zustände und nicht aktivierte Verbindungssecrets
in begrenzten Batches; diese Function samt Scheduler gehört zum Dev-Deploy.

## Versand und Fehler

Eine stabile Versandreferenz reserviert die Antwort vor dem externen Aufruf.
Wiederholungen derselben Operation senden nicht erneut. `accepted` bedeutet,
dass Microsoft den Versandauftrag angenommen hat, nicht bestätigte Zustellung.
Bei Timeout oder unklarem Ausgang bleibt der Vorgang unklar; vor einem neuen
Versuch muss der Nutzer in Outlook den Ordner „Gesendete Elemente“ prüfen.
Es gibt keinen automatischen erneuten Versand.
Die erste Version erlaubt genau eine Antwort je ursprünglicher Nachricht.
Nach angenommenem oder unklarem Versand bleibt dieser Entwurf gesperrt,
auch in anderen Tabs. Weitere Antworten auf dieselbe Ursprungsnachricht
verlangen später einen gesonderten nachvollziehbaren Ablauf. Eine neu
eingegangene Nachricht im Gespräch besitzt einen eigenen Antwortentwurf.
Gleichzeitige Entwurfsänderungen werden über Revisionen erkannt und nicht
stillschweigend überschrieben.

Die zentrale Diagnose erfasst technische Postfachfehler mit festen technischen
Angaben. Persönliche Mailinhalte werden nicht in die Diagnose kopiert.
Eine direkte Fehlermeldung des OAuth-Callbacks enthält keine Providerdetails
oder Zugangsdaten.

## Veröffentlichung und Abnahme

### Freigegebener Dev-Release am 29.10.2026

Der Nutzer hat ausschließlich den Postfachbereich für Dev freigegeben.
Der Release wurde in einem getrennten Checkout ab `ddfa0c2` zusammengestellt;
unveröffentlichte Fall-/Kalender-/Partneränderungen im ursprünglichen Checkout
gehören nicht dazu. Produktion (`main`, Firebase `db-bpl-drehpunkt`) ist nicht
Teil dieser Veröffentlichung.

Der isolierte Stand besteht den vollständigen Lint, Build, Shared-Abgleich,
Functions-Syntax und 61 gezielte Tests. Ein zusätzlicher echter
Firestore-Emulatortest gegen `demo-drehpunkt-mailboxes` bestätigt: Get, List
und Write auf allen sieben internen Mail-Collections sind auch für aktive
Eigentümer, Leser und Superadmins sowie deaktivierte und unberechtigte Nutzer
gesperrt. Die bestehenden Rules bleiben unverändert; keine neuen Indizes
oder Storage-Pfade sind nötig.

Am 29.10.2026 um 13:46 Uhr (Europe/Berlin) waren die zwölf Mail-Functions
einschließlich stündlicher Bereinigung sowie `reportClientDiagnostic`,
`listDiagnosticsPage`, `listManagedUsers`, `createManagedUser` und
`updateManagedUser` erfolgreich nach **db-bpl-drehpunkt-dev** bereitgestellt.
Die Secret-Bindung zu `MAILBOX_CLIENT_SECRET` wurde durch Firebase eingerichtet.
Live-Kontrollen bestätigen 401 für anonyme Postfach-/Anhangs-/Antwortzugriffe,
passende CORS-Antworten für die Dev-Origin und 400/no-store für einen Callback
ohne gültigen OAuth-Zustand. Dabei wurden keine echten Mails gelesen/gesendet.

Vercel ist live geprüft: `dev.drehpunktlogistik.de` ist dem Git-Branch `dev`
zugewiesen und Preview verwendet `db-bpl-drehpunkt-dev`. Die Oberfläche wird
über den zugehörigen Commit ausschließlich nach `dev` veröffentlicht.
Produktionsbaseline für die anschließende Kontrolle:
Vercel `dpl_H6NVNYTMRuunkCJwUQAvBCm1QzXW`, Git `230c2ad`.
Ein erfolgreicher Dev-Build ersetzt die folgende Microsoft-Abnahme nicht.

Abschließender Veröffentlichungsnachweis: Commit
`449e736221792e4bb079628b1fd8893d875fd15d` wurde ausschließlich nach `dev`
gepusht. Vercel meldet den zu `dev.drehpunktlogistik.de` gehörenden Preview-Deploy
`dpl_5HMzEpJWvGYJxT8CBiopEuGyAd7o` mit genau diesem Commit als **READY**.
Die Produktionsbaseline blieb anschließend unverändert. Der ursprüngliche
Checkout wurde unter Erhalt aller 97 vorhandenen geänderten/unversionierten
Dateiinhalte auf den veröffentlichten Dev-Commit nachgeführt.

Die Dev-Domain besitzt weiterhin Vercel-Anmeldeschutz. Ein anonymer Abruf wird
zur Vercel-Anmeldung umgeleitet. Der zusätzliche automatisierte Abruf der
geschützten Seite wurde durch die automatische Sicherheitsprüfung blockiert;
die alternative lesende Deployment-Dateibaum-API lieferte 404. Veröffentlichtes
HTML/JavaScript wurde deshalb nicht unabhängig inhaltlich abgerufen; Status,
Commit und Domainzuordnung wurden über die Vercel-Verwaltung geprüft.
Es wurden keine Schutzmaßnahmen verändert oder Bypass-Tokens erstellt.
Die echte Microsoft-Anmeldung und der angemeldete Mailablauf sind weiterhin
manuell zu prüfen.

### Korrektur des Nachrichtenabrufs am 29.10.2026

Der Nutzer hat die Microsoft-Anmeldung und die sichtbare Postfachverbindung
bestätigt. Die Nachrichtenliste scheiterte; Cloud-Run-Logs bestätigen gültige
Firebase-Authentifizierung und App Check. Die zentralen Diagnoseeinträge
enthielten bislang nur `unavailable`; daraus lässt sich die konkrete Ursache
des echten Abrufs nicht sicher ableiten.

Ein geprüfter Codefehler wurde korrigiert: Graph-Folgeseiten dürfen den
Benutzer-/Ordnerpfad in kanonischer OData-Schreibweise zurückliefern. Die alte
Prüfung verlangte exakt die anfängliche URL-Schreibweise und verwarf dadurch
auch die bereits geladene erste Seite. Die neue Prüfung erhält den vollständigen
Pfad und die opake Query, beschränkt Ziel und Ressourcentyp weiterhin auf
Graph-v1.0-Nachrichten der eigenen Verbindung und bindet Cursor weiter per HMAC
an Eigentümer und Postfach.

Technische Diagnosen unterscheiden nun ungültige Graph-Folgeseiten,
Graph-HTTP-Status und Secret-Manager-HTTP-Status ohne Tokens, Mailinhalte oder
ungefilterte Providerantworten. 19 Postfachtests einschließlich kanonischer
Folgeseiten, fremder Ziele, manipuliertem Cursor und sicherer Fehlercodes sowie
gezielter Lint sind erfolgreich. Die echte Nachrichtenliste muss nach dem
gezielten Dev-Update von `listMailboxMessages` erneut geprüft werden; der
Codebefund ist bis dahin keine bestätigte Erklärung des konkreten Livefehlers.

Lokale Prüfung am 29.10.2026: Build, Lint des Projektcodes mit Ausschluss der
alten `tmp/`-Artefakte, Functions-Syntax, Shared-Abgleich und 67 gezielte
Tests erfolgreich. Der Build meldet weiterhin große JavaScript-Chunks.
Der unveränderte pauschale Lint-Aufruf erfasst alte generierte Dateien unter
`tmp/link-navigation-smoke/` und scheitert dort; diese Dateien gehören nicht
zum Prüfziel der Postfachänderung.

Im Browser mit ausschließlich synthetischen Daten geprüft: Nachrichtenansicht,
Antworttext speichern und über Zurück wieder öffnen, Anhang öffnen/schließen,
zweiseitige PDF mit echtem Seitenwechsel, Breitenfokus, schmale Inhaltsbreite,
Deutsch/Englisch und Light/Dark sowie simulierter angenommener Versand mit
anschließend gesperrtem Antwortformular. Die isolierte Testansicht ersetzt
keinen echten Microsoft-Aufruf. Native Bestätigungsdialoge beim Verlassen
ungespeicherter Entwürfe konnten im automatisierten Browser nicht vollständig
durchgespielt werden und gehören zur manuellen Abnahme.

Keine Veröffentlichung allein aufgrund dieses Dokuments. Frontend und neue
Functions müssen gemeinsam nach dem [Releaseweg](releases.md) bereitgestellt
werden; Firebase-Ziel immer ausdrücklich angeben. Vor der ersten Verbindung
die Web-Rücksprungadresse, Administratorzustimmung, Serverparameter, Secrets,
IAM-Rechte und das Drehpunkt-Modulrecht des Testnutzers prüfen.

Echte Abnahme mit `bb@`: Verbinden und erneut verbinden, Posteingang und
Folgeseite, Zurück/Neuladen, Mail mit/ohne Anhänge, PDF-Vorschau und Rückkehr,
Entwurf speichern und wieder öffnen, Empfänger ändern, interne Antwort und
CC/BCC, verweigerter externer Versand, unklarer Versand, fremder/deaktivierter
Nutzer und Trennen. Deutsch/Englisch, Light/Dark und schmale Fenster prüfen.

Vor einem produktiven Ausbau gesondert festlegen: Aufbewahrung und Löschung
privater Entwürfe/Versandmetadaten, betriebliche Kontrolle der Bereinigung
verwaister Secrets, Zuständigkeit und Kostenüberwachung.
Eine größere Nutzerzahl oder automatische Hintergrundverarbeitung ist nicht
durch diesen begrenzten Dev-Test freigegeben.

### Navigation und persönliche Namen am 29.10.2026

Die neue Oberfläche verwendet einen gemeinsamen, nutzergebundenen
Verbindungsstand für Navigation, Arbeitsbereich und Benutzereinstellungen.
`updateMailboxName` prüft Eigentümer und Bearbeitungsrecht, begrenzt den Namen
auf 80 Zeichen und verändert weder das Microsoft-Profil noch das Postfach.
Die vorhandenen Konten- und Versandbeschränkungen des Dev-Tests bleiben bestehen.

38 gezielte Tests, Projekt-Lint ohne ignorierte `tmp/`-Testartefakte, Build und
Shared-Abgleich sind erfolgreich. Im Browser mit synthetischen Daten geprüft:
Namensänderung erscheint sofort in der Navigation, Leeren verwendet die
Mailadresse, Wechsel zwischen zwei Postfächern markiert genau eine Verbindung,
Benutzereinstellungen sowie deutsche/englische und helle/dunkle Darstellung.
Die bisherige echte Microsoft-Abnahme für Lesen, PDF, gespeicherten Entwurf und
internen Versand wurde vom Nutzer bestätigt. Der neue Namensablauf wurde noch
nicht am echten Testpostfach geprüft.

Prüfung der anschließenden Komfortanpassung: 31 gezielte Postfach-/Texttests,
Projekt-Lint ohne `tmp/`, Build und Shared-Abgleich erfolgreich. Synthetischer
Browsercheck bestätigt die kompakte Ansicht, zwei erkannte Antwortgrenzen,
Suche mit/ohne Treffer, Zurücksetzen, unveränderten geöffneten Antwortentwurf,
Speichern sowie Deutsch/Englisch und Light/Dark. Die neue Suche wurde noch
nicht mit dem echten Exchange-Testpostfach abgenommen.

## Führende externe Quellen

- [Microsoft: App registrieren](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft: Graph-Berechtigungen](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Microsoft: Suche in Nachrichtensammlungen](https://learn.microsoft.com/en-us/graph/search-query-parameter#use-search-on-message-collections)
- [Microsoft: Zuweisung und Zustimmung](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/what-is-access-management)
- [Microsoft: Auf eine Mail antworten](https://learn.microsoft.com/en-us/graph/api/message-reply?view=graph-rest-1.0)
- [Google: Secret Manager](https://docs.cloud.google.com/secret-manager/docs/creating-and-accessing-secrets)
