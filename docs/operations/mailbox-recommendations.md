# Automatische KI-Handlungsempfehlungen für Postfächer

Stand: 01.11.2026. Ausschließlich Dev freigegeben.

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

Persönliche Webhooks nutzen den vorhandenen delegierten `Mail.Read`-Zugriff.
Gemeinsame Postfach-Webhooks benötigen Anwendungszugriff: `Mail.Read.Shared`
unterstützt dafür keine Subscriptions.

Der Nutzer hat den rein lesenden Zugriff auf **alle echten gemeinsamen Exchange-
Postfächer**, einschließlich später eingebundener, ausdrücklich freigegeben.
Die Dev-Anwendung erhält über Exchange Application RBAC:

- App: `Drehpunkt Mail – Dev`, Client-ID `a23dc8d8-e22a-40ef-997c-d28aa753ee29`.
- Service Principal: `d4272f7b-1e8b-422d-bdea-05d5fb2f1655`.
- Scope/Assignment: `Drehpunkt-Mail-Dev-Shared-Read`.
- RecipientRestrictionFilter: `RecipientTypeDetails -eq 'SharedMailbox'`.
- Rolle: `Application Mail.Read`. Kein Mail.Send, kein Mail.ReadWrite.
- Kein unbeschränkter Application-Mail.Read-Grant in Entra. Delegierte Rechte
  bleiben erhalten. Persönliche Postfächer gehören nicht zum Application-Scope.

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

## Verarbeitung und Sicherheit

Aktivieren registriert ein created-only Microsoft-Abonnement für die Inbox,
ohne eingebettete Mailinhalte. Persönlich wird delegiert zugegriffen, gemeinsam
mit der bestehenden Dev-App-Identität und dem begrenzten Application-Zugriff.
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

KI unverändert: bestehendes Dev-Secret, `gpt-5.4`, `store: false`, maximal
12.000 Zeichen Mailtext und 1.000 Zeichen Betreff, keine Tools oder Geschäftsdaten-
abfragen; Usage-Feature `mailbox_action_recommendation`.

## Veröffentlichung

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
