# Automatische KI-Handlungsempfehlungen für Postfächer

Stand: 04.11.2026. Die ursprüngliche Webhookfunktion ist seit der
[Produktionsübernahme vom 02.11.2026](releases/production-2026-11-02-status.md)
auch in Produktion veröffentlicht. Die zusätzliche Unterstützung der fünf
lizenzierten Funktionspostfächer wird lokal vorbereitet und ist noch nicht
bereitgestellt. Ihr zusätzlicher Exchange-Anwendungszugriff ist noch nicht eingerichtet.

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
  von Betreff und neuestem Klartext aus. Erkannte ältere Zitate werden abgetrennt.
  Keine Anhänge/OCR, Auftragszuordnung, Feldextraktion oder automatische Aktion.
- Maximal drei sichere Aktionsicons in der KI-Akzentfarbe; kein automatisches
  Modal. Vorhandene Aktionszustände haben Vorrang. Bereits gestartete, fertige
  oder verworfene passende Aktionen werden bei der Veröffentlichung berücksichtigt.
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
Exchange-Scope vorbereitet. `integrations/microsoft/Enable-FunctionalMailboxWebhooks.ps1`
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
Die neue Funktionspostfach-Erweiterung und ihr zusätzlicher Exchange-Scope sind
in diesem Arbeitsstand noch nicht veröffentlicht oder live geprüft.

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
Keine echte Exchange-Berechtigung geändert und keine Cloudveröffentlichung erfolgt.
