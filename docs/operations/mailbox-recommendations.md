# Automatische KI-Handlungsempfehlungen für Postfächer

Stand: 04.11.2026. Die ursprüngliche Webhookfunktion ist seit der
[Produktionsübernahme vom 02.11.2026](releases/production-2026-11-02-status.md)
auch in Produktion veröffentlicht. Die zusätzliche Unterstützung der fünf
Funktionspostfächer wird mit diesem Release ausschließlich in Dev bereitgestellt.
Ihr begrenzter Exchange-Anwendungszugriff ist am 04.11.2026 für Dev eingerichtet.
Vier neu freigegebene UserMailbox-Adressen liefern bei der tatsächlichen
Graph-Prüfung noch HTTP 403; die Exchange-Prüfung bestätigt bereits den Scope.
Produktionsanwendung und deren bestehende Rechte bleiben unverändert.

Die unten beschriebene zusätzliche Anhangskurzprüfung ist am 04.11.2026
ausdrücklich für Dev freigegeben, gemeinsam mit Zahlungsziel und Factoring.
Produktion bleibt beim bisherigen Stand; Releaseumfang siehe
[Dev-Releasenotiz](releases/mail-invoice-terms-dev-2026-11-04.md).

**Verbindliche Produktentscheidung:**
[Webhooks ohne Kontrollabfragen](../decisions/mailbox-recommendations-no-polling.md).
Keine periodischen Inbox-/Deltaabfragen, kein Nachholen verlorener Meldungen.
Gelegentlich fehlende Empfehlungen werden ausdrücklich akzeptiert. Die früher
bereitgestellte Fünf-Minuten-Abfrage ist entfernt, einschließlich Cloud Scheduler.

## Bedienung

- Persönliches Postfach: Mein Profil → Postfächer → KI-Handlungsempfehlungen.
  Der Eigentümer mit Postfach-Bearbeitungsrecht schaltet seine Verbindung ein.
- Gemeinsames Postfach: Adminbereich → Postfächer · KI-Handlungsempfehlungen.
  Nur aktive Admins/Superadmins aktivieren zentral. Alle Nutzer erhalten dieselbe
  gespeicherte Empfehlung. Der Zustand wird im Profil nur angezeigt.
- Als gemeinsame Funktionspostfächer gelten außerdem ausdrücklich
  `buchhaltung@brennpunkt-logistik.de`, `express@brennpunkt-logistik.de`,
  `transport@brennpunkt-logistik.de`, `info@brennpunkt-logistik.de` und
  `rechnung@brennpunkt-logistik.de`. Sie werden unabhängig davon zentral verwaltet,
  ob sie mit eigener Microsoft-Anmeldung oder über einen delegierten Zugang
  eingebunden sind. Ihr technischer Exchange-Typ darf `UserMailbox` bleiben.
  Ein normaler Nutzer kann die zentrale Einstellung auch bei eigener Anmeldung
  an einem solchen Funktionskonto nicht im Profil überschreiben.
- Die Adminübersicht zeigt alle fünf benannten Adressen auch vor ihrer Einbindung.
  Für noch nicht verbundene Adressen ist die Aktivierung gesperrt; zuerst ist eine
  gültige Postfachverbindung erforderlich. Andere bestehende gemeinsame Postfächer
  bleiben ebenfalls in der Übersicht. Das Hinzufügen einer Verbindung aktiviert
  die KI-Empfehlungen nicht automatisch.
- Nach dem Trennen der letzten Verbindung bleibt die gespeicherte zentrale
  Aktivierung sichtbar und durch Admins ausschaltbar. Ohne gültige Verbindung
  kann sie nicht eingeschaltet werden. Eine erneute Verbindung hebt eine
  ausdrücklich vorgenommene Deaktivierung nicht auf. Alias-Verbindungen werden
  über die gemeinsame Microsoft-Inbox-Identität zusammengeführt.
- Ein neuer Eingang löst über Microsoft Graph eine einzelne grobe Einordnung
  von Betreff und neuestem Klartext aus. Erkannte ältere Antwortzitate werden
  abgetrennt. Bei ausdrücklich weitergeleiteten Mails (WG/FW/FWD im Betreff)
  gehört der erste weitergeleitete Nachrichtenblock zur aktuellen Einreichung;
  er wird separat und nachrangig zum aktuellen Absendertext berücksichtigt.
  Beide Textblöcke teilen dieselbe Grenze von 12.000 Zeichen. Eine konkret
  eingereichte Rechnung im Betreff/Text genügt für die Empfehlung; tatsächliche
  Anhangsinhalte werden dabei weder behauptet noch überprüft.
  Keine Anhänge/OCR, Auftragszuordnung, Feldextraktion oder automatische Aktion.
- Maximal drei sichere Aktionsicons in der KI-Akzentfarbe; kein automatisches
  Modal. Vorhandene Aktionszustände haben Vorrang. Bereits gestartete, fertige
  oder verworfene passende Aktionen werden bei der Veröffentlichung berücksichtigt.
  Dieselbe Empfehlung kennzeichnet auch den passenden rechten Aktionsbutton.
  Gespeicherte manuelle Aktionszustände einschließlich „verworfen“ haben dort
  ebenfalls Vorrang; allein eine Empfehlung öffnet oder startet nichts.
- Fünf Minuten sind nur die Frischegrenze, kein Intervall: ältere Mails und zu
  spät fertiggestellte Auswertungen erhalten keine neue Empfehlung.
- Ein inhaltsfreies Firestore-Pushsignal aktualisiert die geöffnete Oberfläche.
  Kein Empfehlungs-Nachladetimer. Die bereits vorher vorhandene Aktualisierung
  von gesendeten Antworten ist davon unabhängig.

## Microsoft-Zugriff

Persönliche Mitarbeiter-Webhooks nutzen den vorhandenen delegierten `Mail.Read`-Zugriff.
Gemeinsame und zentral verwaltete Funktionspostfach-Webhooks benötigen
Anwendungszugriff: `Mail.Read.Shared` unterstützt dafür keine Subscriptions.

Der Nutzer hat den rein lesenden Zugriff auf **alle echten gemeinsamen Exchange-
Postfächer**, einschließlich später eingebundener, ausdrücklich freigegeben.
Die Dev-Anwendung erhält über Exchange Application RBAC:

- App: `Drehpunkt Mail – Dev`, Client-ID `a23dc8d8-e22a-40ef-997c-d28aa753ee29`.
- Service Principal: `d4272f7b-1e8b-422d-bdea-05d5fb2f1655`.
- Scope/Assignment: `Drehpunkt-Mail-Dev-Shared-Read`.
- RecipientRestrictionFilter: `RecipientTypeDetails -eq 'SharedMailbox'`.
- Rolle: `Application Mail.Read`. Kein Mail.Send, kein Mail.ReadWrite.
- Kein unbeschränkter Application-Mail.Read-Grant in Entra. Delegierte Rechte
  bleiben erhalten. Persönliche Mitarbeiterpostfächer gehören nicht zum Application-Scope.

Einrichtungshelfer: `integrations/microsoft/Enable-DevSharedMailboxWebhooks.ps1`
mit `-AllSharedMailboxes -Apply`; ohne `-Apply` nur Vorschau. Exchange-Adminrechte
sind für die Einrichtung erforderlich. Die Browser-Cloud-Shell konnte mangels
Azure-Abonnement nicht verwendet werden; normale interaktive Exchange-Anmeldung
war erfolgreich. Keine Sicherheitsrichtlinien verändert.

Echter Zugriffstest: no-reply@ und angebot@ per Application-Token HTTP 200;
persönliches bb@ HTTP 403. Microsoft-Abonnement mit created-only Inbox-Resource
gegen den echten Dev-Webhook erfolgreich erstellt (HTTP 201, einschließlich
Endpoint-/Lifecycle-Validierung) und unmittelbar wieder gelöscht (HTTP 204).

Quellen:
- https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
- https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac

### Zusätzliche Freigabe für die fünf Funktionspostfächer

Die neue zentrale Produktzuordnung erweitert für sich allein keine Microsoft-Rechte.
Für technisch normale Benutzerpostfächer ist ein zusätzlicher, eng begrenzter
Exchange-Scope eingerichtet. `integrations/microsoft/Enable-FunctionalMailboxWebhooks.ps1`
ändert den vorhandenen Scope `Drehpunkt-Mail-Dev-Shared-Read` ausdrücklich nicht;
dieser wird inzwischen auch von der Produktionsanwendung verwendet.

- Neuer Scope: `Drehpunkt-Mail-Functional-Read`.
- Filter: `RecipientTypeDetails -eq 'UserMailbox'` UND exakt eine der fünf oben
  genannten primären Mailadressen. Kein Zugriff auf andere Benutzerpostfächer.
- Separate Rollenzuweisung pro Anwendung: `Drehpunkt-Mail-Dev-Functional-Read`
  bzw. `Drehpunkt-Mail-Production-Functional-Read`, jeweils `Application Mail.Read`.
- Technisch bereits gemeinsame Adressen aus den fünf bleiben über die vorhandene
  SharedMailbox-Freigabe erreichbar. Der neue Filter erfasst nur die tatsächliche
  UserMailbox-Teilmenge; die fünf Adressen müssen nicht alle denselben Typ haben.
- Kein Senden, Schreiben oder unbeschränkter Entra-Anwendungsgrant. Delegierte
  persönliche Zugriffe und die bisherigen Rollenzuweisungen bleiben erhalten.

Der Helfer hat standardmäßig `-Environment Dev` und führt ohne `-Apply` weder
Anmeldung noch Netzwerkzugriffe aus. Beispiel für eine spätere freigegebene
Einrichtung in einer bereits angemeldeten Exchange-Online-Administratorsitzung:

```powershell
# Vorschau ohne Cloudänderung
& .\integrations\microsoft\Enable-FunctionalMailboxWebhooks.ps1 -Environment Dev
# Erst bei freigegebener Einrichtung:
& .\integrations\microsoft\Enable-FunctionalMailboxWebhooks.ps1 -Environment Dev -Apply
```

Produktion muss ausdrücklich mit `-Environment Production` gewählt werden und
benötigt eine eigene Veröffentlichungsfreigabe. Vor der ersten Mutation prüft
der Helfer alle fünf primären Adressen und deren Typ, die bestehende korrekte
Exchange-Dienstidentität, vorhandene Rollen-/Scope-Bindungen und die Filtervorschau.
Bei abweichenden vorhandenen Bindungen bricht er ab, statt sie umzuschreiben.
Nach der Einrichtung werden alle fünf positiven Zugriffe und das persönliche bb@
als negativer Fall geprüft. Diese RBAC-Prüfung bezieht sich ausschließlich auf
Exchange-Zuweisungen; zusätzliche Entra-Grants sind unabhängig und additiv.
Danach sind echter Graph-Zugriff und Webhookregistrierung separat zu prüfen.
Eine lokale Syntaxprüfung oder Vorschau ist kein Nachweis einer Cloudfreigabe.

Live-Einrichtung vom 04.11.2026 ausschließlich für Dev: buchhaltung@, express@,
transport@ und info@ sind technisch UserMailbox; rechnung@ ist SharedMailbox.
`Test-ServicePrincipalAuthorization` bestätigt alle fünf und verweigert bb@.
Der Helfer verwendet bei `Get-ManagementRoleAssignment` den Parameter
`-RoleAssignee`; beim Anlegen der Zuweisung bleibt `-App` korrekt.

Tatsächliche Graph-Prüfung um 13:07 UTC: rechnung@ und das bestehende no-reply@
HTTP 200, persönliches bb@ HTTP 403. Die vier neuen UserMailbox-Freigaben noch
HTTP 403 (`ErrorAccessDenied`). Microsoft dokumentiert 30 Minuten bis zwei Stunden
RBAC-Cacheverzögerung; die Exchange-Testfunktion umgeht diesen Cache. Damit ist
die Konfiguration bestätigt, die tatsächliche Graph-Wirksamkeit der vier neuen
Freigaben jedoch noch offen. Keine Rechteerweiterung als Umgehung vornehmen.
Quelle: https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac#limitations

Am 06.11.2026 wurde im ausdrücklich freigegebenen Gesamt-Produktionsrelease
auch `Drehpunkt-Mail-Production-Functional-Read` an den zuvor exakt geprüften
Funktionspostfach-Scope gebunden. Fünf positive Exchange-Prüfungen und das
persönliche bb@ als negativer Fall bestätigt; kein unbeschränkter Entra-Grant.
Die anschließenden Graph-Abfragen der vier UserMailbox-Adressen lieferten
zunächst weiterhin HTTP 403. Microsoft nennt Cacheverzögerungen; diese Ursache
ist für die konkreten Antworten nicht abschließend nachgewiesen. Die tatsächliche
Graph-/Webhook-Wirksamkeit darf daher noch nicht als vollständig bestätigt
ausgegeben werden. Aktueller Nachweis und offene Grenzen im
[Releasebeleg](releases/production-2026-11-06-status.md).

Ein kurzlebiges created-only Abonnement für rechnung@ gegen den aktualisierten
Dev-Webhook wurde erfolgreich erstellt (HTTP 201, einschließlich Validierung)
und unmittelbar gelöscht (HTTP 204). Keine Postfachinhalte ausgelesen, keine
Testmail gesendet und keine KI-Einstellung für diesen Test aktiviert.

## Verarbeitung und Sicherheit

Aktivieren registriert ein created-only Microsoft-Abonnement für die Inbox,
ohne eingebettete Mailinhalte. Persönlich wird delegiert zugegriffen, gemeinsam
mit der jeweiligen Umgebungs-App-Identität und dem begrenzten Application-Zugriff.
Für die fünf Funktionspostfächer wird derselbe zentrale Application-Pfad verwendet,
auch wenn die gespeicherte Verbindung aus einer eigenen Kontoanmeldung stammt.
Microsoft-Inbox-Identität vereinheitlicht Aliase und verschiedene Benutzerzugänge.
Microsoft-Nachrichten verwenden Immutable IDs.

Der öffentliche HTTPS-Webhook beantwortet Validierungen als Klartext. Er prüft
Mandant, bekannte Subscription-ID, Aktivierung, Generation, Ablauf und einen
zufälligen clientState (nur Hash gespeichert). Erst danach entsteht ein
serverseitiger Auftrag für genau die gemeldete Nachricht. Keine vom Client
vorgegebenen Graph-URLs. Doppelte Meldungen erzeugen denselben Auftrag; das
Ergebnis wird mit Lease und Generation geschützt. Kein alter Polling-Auftrag
kann eine Postfachliste auslesen. Abschalten macht ausstehende Meldungen sofort
wirkungslos; das Abonnement wird nach Möglichkeit gelöscht.

Der Worker liest nur die betreffende Mail, prüft Frische vor und nach der KI
und veröffentlicht Kennungen, keinen Mailtext. Fehlende Meldungen führen zu
keiner Recovery-Suche. Microsoft-Zustellwiederholungen bei technischen Problemen
sind möglich; sie lösen dank Deduplizierung keine reguläre doppelte KI-Arbeit aus.
Ein Prozessabbruch nach externem KI-Erfolg, aber vor Speicherung, bleibt wie bei
anderen externen Diensten ein möglicher Ausnahmefall.

Eine stündliche Funktion pflegt **nur Abonnements und Arbeitsmetadaten**. Sie
verlängert vor Ablauf, erstellt entfernte Abos wieder und bereinigt alte
Arbeitsaufträge. Sie liest nie Inbox-/Delta-/Mailbestände. Lifecycle `missed`
markiert einen Warnzustand, ohne Nachholen. `reauthorizationRequired` und
`subscriptionRemoved` lösen ausschließlich Abonnementpflege aus.

Private Collections: `mailboxRecommendationScopes` (Konfiguration/Ergebnisse),
`mailboxRecommendationSubscriptions` (Registrierung/clientState-Hash),
`mailboxRecommendationRuns` (Aufträge). Keine direkten Browserzugriffe.
`mailboxRecommendationSignals/{connectionId}` enthält nur eine Revision und
Eigentümer-/Zeitmetadaten; ausschließlich der berechtigte Verbindungseigentümer
darf dieses einzelne Dokument abonnieren. Kein Listen- oder Schreibrecht.

KI unverändert: projektbezogenes Secret, `gpt-5.4`, `store: false`, maximal
12.000 Zeichen Mailtext und 1.000 Zeichen Betreff, keine Tools oder Geschäftsdaten-
abfragen; Usage-Feature `mailbox_action_recommendation`.

## Veröffentlichung

Die folgenden Dev-Angaben dokumentieren die ursprüngliche Veröffentlichung vom
01.11.2026. Der spätere Produktionsstand steht im oben verlinkten Abschlussbeleg.
Die Funktionspostfach-Erweiterung vom 04.11.2026 aktualisiert dieselben sieben
Dev-Functions erfolgreich; die Oberfläche wird gemeinsam über den Dev-Branch
veröffentlicht. Rules und Indizes benötigen hierfür keine Änderung. Die neuen
Exchange-Rechte und die verbleibende Graph-Wirksamkeitsprüfung stehen oben.

Dev-Functions gezielt: vier Einstellungs-/Ergebnis-Callables,
`mailboxRecommendationWebhook`, `maintainMailboxRecommendationSubscriptions`,
`processMailboxRecommendationRun`. Alte Funktion `enqueueMailboxRecommendations`
entfernt. Cloud-Scheduler-Prüfung: alter Job HTTP 404; nur Abonnementpflege
`every 60 minutes` bleibt bestehen. Die neuen Signal-Regeln werden nur in Dev
bereitgestellt. Keine Produktions-Functions, -Rules oder -Deployments verändert.

Tests umfassen den gültigen/gefälschten Webhook, Deduplizierung, zentrale Anzeige,
Besitzrechte, Echtzeit-Signalrechte, Fünf-Minuten-Grenze, verzögerte KI-Ergebnisse,
Abschalten, Lifecycle-Fälle und Abonnementpflege ohne Inhaltsabfrage. Zusätzlich
Lint, Build, Shared-Abgleich, echte Microsoft-Zugriffs-/Handshakeprüfungen und
Browserprüfung in Dev. Der alte Pollingweg darf nicht als Rollback reaktiviert
werden; bei Problemen Webhooks deaktivieren und manuelle Aktionen nutzen.

## Spätere getrennte Einstellung für vollständige Ausarbeitung

Die vom Nutzer gewünschte automatische vollständige Ausarbeitung ist ausdrücklich
eine nächste Ausbaustufe und kein weiterer Effekt des jetzigen Schalters.
Eine spätere Einstellung, beispielsweise `autoPrepare`, muss getrennt von
`enabled` gespeichert und serverseitig autorisiert werden: für persönliche
Mitarbeiterpostfächer durch ihren Eigentümer, für die fünf Funktionspostfächer und
weitere gemeinsame Postfächer zentral ausschließlich durch Admins/Superadmins.
Auch dieser zweite Modus muss bei gemeinsam verwendeten Postfächern einmalig
verarbeitet und einheitlich angezeigt werden, statt pro Nutzer doppelte Arbeit
auszulösen. Er benötigt eine eigene ausdrückliche Aktivierung; vorhandene aktive
Handlungsempfehlungen dürfen beim späteren Release keine automatische Ausarbeitung
einschalten.

Gemeint sind vorbereitete Ergebnisse zur Nutzerprüfung, etwa Antwortentwurf,
vorgeschlagene Sendungsstatuswerte oder fertiges Rechnungsergebnis. Das bedeutet
keinen automatischen Mailversand und keine automatische Übernahme von Fachwerten.
Ausarbeitungskosten, Grenzen, Umgang mit Anhängen und die konkreten unterstützten
Aktionen werden vor diesem Ausbau festgelegt. Der aktuelle Stand enthält dafür
keinen funktionslosen zweiten Haken und keinen automatischen Ausarbeitungsworker.

## Kurzprüfung bei unklarem Mailinhalt

Nach der Nutzeranforderung vom 04.11.2026 sollen z. B. Mails mit dem Betreff
„DOKUMENTY“ bei unzureichendem Betreff/Mailtext anhand ihrer Anhänge eingeordnet
werden können. Das ist eine Dokumentart-Erkennung für die Handlungsempfehlung,
keine vollständige Ausarbeitung und keine automatische Fachaktion.

- Die erste KI-Einordnung entscheidet ausdrücklich, ob fehlender Kontext eine
  Anhangskurzprüfung erfordert. Bei einer sicheren Aktion, eindeutig irrelevanten
  Mails, reinen Statusfragen oder erledigten/ausdrücklich nicht zu bearbeitenden
  Inhalten erfolgt keine Zusatzprüfung.
- Nur Anhänge der über die Benachrichtigung gemeldeten Nachricht; keine Suche
  im Postfach, keine Folgeseiten der Anhangsliste und kein Nachholen alter Mails.
  Maximal 20 Metadateneinträge und davon höchstens zwei unterstützte Dateien,
  jeweils höchstens 5 MiB. Inline-Bilder und angehängte Outlook-Nachrichten
  werden ausgeschlossen.
- Unterstützt: PDF, PNG/JPEG/WebP und UTF-8-Klartext. Aus PDFs werden höchstens
  die ersten zwei Seiten gelesen, höchstens 6.000 Zeichen je Dokument. Fehlt eine
  brauchbare Textebene, werden nur die betroffenen Seiten innerhalb dieser ersten
  zwei Seiten gemeinsam für eine kurze OCR herangezogen.
  Die OCR ist auf 20 Sekunden und 1.200 Ausgabetokens begrenzt; keine Wiederholung.
  Unsichere OCR-Texte begründen keine Empfehlung.
- Eine zweite Einordnung erhält nur die begrenzten Textausschnitte und den
  bisherigen Mailkontext. Der aktuelle Absendertext hat weiterhin Vorrang.
  Dokumentanweisungen bleiben unzuverlässige Quelldaten. Keine Tools, keine
  Auftragszuordnung, keine Rechnungs-/Betragsprüfung und kein automatisches Öffnen.
- Das zentrale Scope-/Lease-Verfahren verarbeitet gemeinsame Postfächer weiter
  einmalig. Fünf-Minuten-Frischegrenze, Abschalten und Generationsschutz gelten
  vor Zusatzarbeit und erneut vor Veröffentlichung. Ein Arbeitsbudget verhindert
  neue Zusatzschritte bei zu wenig Restzeit. Keine neuen Timer oder Kontrollabfragen.
- Dokumentbytes und Ausschnitte werden nur während der Verarbeitung verwendet,
  nicht in Firestore/Storage als neue Datei oder Empfehlungstext abgelegt.
  Fehlerdiagnosen enthalten keine Dokumentinhalte. Kosten werden über die
  vorhandene KI-Nutzungsprotokollierung getrennt erfasst: Zusatzklassifikation
  `mailbox_action_recommendation_attachment`, OCR
  `mailbox_recommendation_attachment_ocr`.

Für den Dev-Release ist `processMailboxRecommendationRun` mit 512 MiB
Speicher gezielt zu aktualisieren; die ergänzte Graph-Anhangsfunktion wird intern
von diesem Worker verwendet. Die angepassten Erläuterungen im Profil/Adminbereich
gehören zum selben Release. Bestehende Mail.Read-/Exchange-Leserechte umfassen
die Anhangslesezugriffe. Rules/Indizes und Microsoft-Grants werden hierfür nicht
erweitert. Die Produktionsbereitstellung ist nicht Teil dieses Releases.

Lokale Abnahme: 104 Unit-/Vertragsprüfungen und 18 Firestore-Emulatorprüfungen
erfolgreich, keine übersprungenen Tests; außerdem Lint, Build und Shared-Abgleich.
Die unabhängige Nachprüfung bestätigt den bis zum PDF-Renderer wirksamen Abbruch
und die Freigabe von PDF-/Canvas-Ressourcen. Bestehende OCR-Aufrufer ohne Signal
bleiben kompatibel.

Kontrollierte Modellprüfung ohne Speicherung neuer Empfehlungen: Die bekannte
„DOKUMENTY“-Mail fordert fehlenden Anhangskontext an. Ihr erster PDF-Ausschnitt
enthält CMR und Wareneingangsbeleg, keine erfundene Rechnungsempfehlung. Eine
echte Rechnungs-PDF aus dem Testpostfach wird unter einem neutralen Testbetreff
als Rechnung erkannt. Sichere Rechnungseinreichungen, Archivvermerke und reine
Statusfragen benötigen bereits im ersten Schritt keine Anhangsprüfung. Diese
Proben verändern keine vorhandenen Mailergebnisse oder KI-Schalter.

## Lokale Prüfung der Erweiterung vom 04.11.2026

73 Unit-/Vertragsprüfungen und 14 isolierte Firestore-Emulatorprüfungen erfolgreich,
keine übersprungenen Tests. Geprüft sind zentrale Rechte auch bei direkter
Funktionskonto-Anmeldung, einmalige Verarbeitung über verschiedene Zugänge,
Aliasgruppierung, Deaktivierung nach Verbindungsverlust/Identitätsfehler,
Schutz persönlicher Einstellungen und Stilllegung früherer individueller Scopes.
Die bestehende Testabsicherung gegen Kontrollpolling bleibt erhalten.

Lint, Build und Shared-Abgleich erfolgreich. Lokale Browserfixture für verbundene
und unverbundene Zeilen sowie zentrale/persönliche Profilsteuerung in DE/Dark und
EN/Light geprüft. Der ergänzte Abschaltweg ohne Verbindung ist im Emulator geprüft;
ein abschließender Browsernachlauf war mangels verfügbarer Browseroberfläche nicht
möglich. PowerShell-Syntax, beide Vorschauen und simulierte Vorprüfungen für
Rechteabweichungen, gemischte Postfachtypen und wiederholte Einrichtung erfolgreich.
Die nachfolgende echte Dev-Einrichtung und Bereitstellung ist in den Abschnitten
Microsoft-Zugriff und Veröffentlichung dokumentiert. Bestehende Aktivierungen
bleiben erhalten; insbesondere wurde buchhaltung@ nicht automatisch eingeschaltet.

### Rechnungsempfehlungen bei Weiterleitungen, Dev-Korrektur vom 04.11.2026

Die Live-Diagnose von rechnung@ bestätigte ein vorhandenes Microsoft-Abonnement,
erfolgreiche Webhookzustellung und abgeschlossene Workerläufe mit leerer
Aktionsliste. Bei den vier gemeldeten Weiterleitungen enthielt der verwendete
erste Textblock nur die Signatur; die aktuelle weitergeleitete Einreichung wurde
als Antwortgeschichte abgeschnitten. Zusätzlich erreichten Empfehlungen bislang
nur die Listenicons, nicht die rechten Aktionsbuttons.

Die oben beschriebene Weiterleitungsbehandlung und eine eindeutige Abgrenzung
konkreter Rechnungseinreichungen korrigieren die Einordnung. Die ausgewählte
Mail lädt ihre Empfehlungen auch unabhängig von der sichtbaren Listenfilterung.
Das vorhandene Firestore-Revisionssignal lädt die Empfehlungen unmittelbar neu;
kein zusätzlicher Timer. Eine gemeinsame Darstellungsregel lässt manuelle
Aktionszustände vorgehen und hält verworfene Ergebnisse neutral.

Gezielt geprüft: 19 Unit-/Vertragstests und 14 Firestore-Emulatortests erfolgreich,
keine übersprungenen Tests; Lint, Build und Shared-Abgleich. Reale Modellprüfung
mit vier bereits bekannten Testweiterleitungen und sechs positiven/negativen
Gegenfällen: alle zehn erwartungsgemäß. Die lokale Modellprüfung speichert keine
Empfehlungen an diesen alten Nachrichten; deren lokale Nutzungsprotokollierung
war nicht verfügbar. Keine alten Nachrichten nachträglich automatisch
klassifizieren oder Frischegrenzen ändern. Der korrigierte Worker ist gezielt im
Dev-Projekt bereitgestellt; Oberfläche folgt im selben Dev-Release. Kein neuer
Microsoft-Grant und keine Änderung an Produktion, Rules oder Indizes erforderlich.
