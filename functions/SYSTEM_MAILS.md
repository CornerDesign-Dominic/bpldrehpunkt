# Systemmails – Betriebs-Runbook

## Zweck und technische Grenze

Systemmails werden ausschließlich serverseitig durch Firebase Functions in `europe-west3` ausgelöst. Die Functions übergeben Empfänger, Betreff, Text und – bei Systemmail-Vorlagen – HTML an den serverseitig verwalteten Power-Automate-Webhooks. Es gibt keinen direkten Mailversand aus dem Browser.

Webhook-Adresse und weitere Integrationswerte sind ausschließlich als Functions-Secrets verwaltet. Sie gehören weder in Client-Konfigurationen noch in dieses Repository oder in Betriebsdokumente.

## Umgebungs-Schutz

Externe Wirkungen der Functions sind zentral auf das Firebase-Projekt
`db-bpl-drehpunkt` begrenzt. Nur dort dürfen die Functions den serverseitig
verwalteten Power-Automate-Webhook oder OpenAI verwenden. Im Entwicklungsprojekt
`db-bpl-drehpunkt-dev` sowie bei einer fehlenden oder unbekannten Runtime-
Projekt-ID werden externe Wirkungen fail-closed übersprungen.

Damit lösen Abwesenheits-Trigger in Dev keine Empfängerbenachrichtigungen und
keine wiederholbaren Zustellfehler aus. Bug-Reports schließen dort erfolgreich
mit dem Hinweis auf die übersprungene Benachrichtigung ab. Der Systemmail-Test
lehnt in Dev klar ab und bestätigt nie einen Versand. Die übersprungenen
Wirkungen werden ohne Secret- oder Empfängerdaten in den Function-Logs
protokolliert.

## Belegte Versandpfade

| Auslöser | Function / technische Bedingung | Empfängerkreis |
| --- | --- | --- |
| Neuer Urlaubs-, Änderungs- oder Stornoantrag | Firestore-Create-Trigger für `vacationRequests/{requestId}`; nur die Antragszustände `pending`, `change_requested` und `cancellation_requested` | Aktiver Antragsteller und aktive, für dessen Abteilung zuständige Urlaubsmanager |
| Genehmigung oder Ablehnung | Firestore-Update-Trigger für `vacationRequests/{requestId}`; Versand nur bei Änderung von `status` oder `requestStatus` und Status `approved` bzw. `rejected` | Aktiver Antragsteller |
| Rückzug eines Stornoantrags | Derselbe Update-Trigger; Antrag ist vom Typ Storno und `requestStatus` ist `withdrawn` | Aktiver Antragsteller und aktive, für dessen Abteilung zuständige Urlaubsmanager |
| Systemmail-Test | Callable `sendSystemTestMail` | Die E-Mail-Adresse des aufrufenden aktiven Profils, andernfalls dessen Firebase-Auth-Adresse |
| Fehlermeldung aus der Anwendung | Callable `submitBugReport` | Alle aktiven Superadmins mit gültiger Profil-E-Mail-Adresse |
| Fehler der täglichen News-Recherche | Geplante Function `scheduledNewsResearch`, nur wenn die Recherche fehlschlägt | Alle aktiven Superadmins mit gültiger Profil-E-Mail-Adresse |

Die Urlaubs-Trigger sind mit Wiederholung bei Fehlern konfiguriert. Für jede einzelne Urlaubsmail hält die Function einen Lieferdatensatz unter `vacationRequests/{requestId}/mailDeliveries/` vor. Erfolgreiche Zustellungen werden bei einem erneuten Trigger-Lauf nicht nochmals versendet; ein frischer Versand-Lock begrenzt parallele Wiederholungen.

## Berechtigungen und Administration

| Aktion | Serverseitliche Voraussetzung |
| --- | --- |
| Systemmail-Vorlagen lesen oder ändern | Aktives Profil mit Rolle `superadmin`; die Callables erzwingen App Check |
| Systemmail-Test auslösen | Aktives Profil mit Rolle `admin` oder `superadmin`; die Callable erzwingt App Check |
| Systemmail-Verwaltung im vorhandenen Browserbereich | Der aktuelle Routen-Schutz verlangt `superadmin` |
| Fehlermeldung absenden | Aktives Benutzerprofil; die Callable erzwingt App Check |
| News-Recherche manuell starten | Aktives Profil mit Rolle `superadmin`; eine Mail entsteht nur bei einem Recherchefehler |

Im Entwicklungsprojekt sind Systemmail-Test und externe Benachrichtigungen
bewusst deaktiviert. Ein Test der tatsächlichen Power-Automate-Auslieferung ist
deshalb ausschließlich im Produktionsprojekt mit kontrollierter Testadresse und
nach Betriebsfreigabe zulässig.

Vorlagen werden über die geschützten Callables gepflegt. Der Browser erhält weder Zugriff auf den Webhook noch eine Berechtigung, E-Mails direkt zu versenden.

## Sicherer Pre-Live-Test

1. Eine Testmail ausschließlich mit einem aktiven Administrator- oder Superadmin-Konto auslösen, dessen Profil- oder Auth-E-Mail eine kontrollierte Testempfängeradresse ist.
2. Erfolg der Callable, Eingang der einzelnen Testmail und die erfolgreiche Verarbeitung im Power-Automate-Ablauf prüfen. Keine Verteiler- oder Massenversendung verwenden.
3. Soll zusätzlich der Urlaubs-Trigger geprüft werden, nur einen separaten Testantrag verwenden. Vorher sicherstellen, dass sowohl dessen aktiver Antragsteller als auch alle aktiven Urlaubsmanager der zugeordneten Abteilung kontrollierte Testempfänger sind.
4. Für einen Test von Fehlermeldung oder News-Fehlerbenachrichtigung keine produktiven Fehler künstlich erzeugen. Diese Pfade werden nur nach einem abgestimmten, isolierten Betriebs-Test geprüft.

## Fehlerbehandlung und Betrieb

Bei einem fehlgeschlagenen Urlaubsversand zuerst den zugehörigen Lieferdatensatz unter `mailDeliveries` prüfen: Status, Versuchszähler und Fehlstatus zeigen den Funktionszustand. Danach die Ausführungs- und Fehlerprotokolle der betreffenden Firebase Function sowie den Power-Automate-Ablauf prüfen.

Für Fehlermeldungen und die News-Recherche liefern die aufrufende Callable beziehungsweise deren Function-Protokolle den Fehlerkontext. Die News-Funktion protokolliert sowohl den Recherchefehler als auch fehlende oder fehlgeschlagene Fehlerbenachrichtigungen.

Die Ursache zuerst beheben und die Wirkung mit einem einzelnen kontrollierten Test verifizieren. Bestehende Urlaubsanträge nicht durch wiederholtes Schreiben, Kopieren oder Statuswechsel künstlich erneut auslösen: die Trigger sind wiederholbar und die Lieferdatensätze steuern die Duplikatvermeidung.

## Sicherheitsgrenzen

- Webhook-URLs, Secrets, Empfängerlisten und Produktionsdaten werden nicht dokumentiert, exportiert oder in den Client übernommen.
- Versandberechtigung wird in den Functions über aktives Profil, Rolle und – bei Callables – App Check durchgesetzt; sie darf nicht allein über die Browseroberfläche angenommen werden.
- Urlaubsbenachrichtigungen gehen nur an aktive Profile und die für die Abteilung ermittelten Urlaubsmanager; administrative Fehlermeldungen und News-Fehler nur an aktive Superadmins mit gültiger E-Mail-Adresse.
- Der Betrieb legt fest, wer kontrollierte Testkonten, die Überwachung der Function- und Power-Automate-Fehler sowie eine autorisierte Wiederholung verantwortet. Diese Zuständigkeiten sind nicht im Code festgelegt.
- Der Umgebungs-Schutz bewertet ausschließlich die serverseitige Runtime-
  Projekt-ID; Client-`VITE_`-Variablen können ihn nicht beeinflussen.
