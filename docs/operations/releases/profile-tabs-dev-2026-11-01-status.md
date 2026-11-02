# Profilreiter und kompakte Postfachverwaltung – Dev

Freigabe durch den Nutzer am 01.11.2026: umsetzen, testen und ausschließlich
auf Dev veröffentlichen. Main und Produktion bleiben unverändert.

## Umfang

- Drei Reiter im Stil der Auftragsansicht: Meine Daten, Einstellungen, Postfächer.
- Persönliche Angaben und Arbeitsprofil nebeneinander, auf kleinen Bildschirmen
  untereinander. Unterschrift bei Meine Daten, Verwaltungs-Hinweis bei den Daten.
- Kompakte Postfachzeilen mit Öffnen und aufklappbarem Aktionsmenü.
  Namensbearbeitung und Hinzufügen-Formulare erst auf Anforderung sichtbar.
- Eingaben bleiben beim Reiterwechsel erhalten; Tastatursteuerung mit Pfeilen,
  Home und End. Bestehende Postfach-Direktlinks und OAuth-Rückkehr öffnen den
  Postfachreiter. Die bestehende Berechtigungsprüfung bleibt erhalten.
- Keine Änderungen an Backend, Authentifizierungsumfang, Rules oder Datenmodell.

## Prüfung vor Veröffentlichung

- Lint, Frontendbuild und Abgleich der 45 deploybaren Shared-Module erfolgreich.
- Acht vorhandene Tests für Postfachhelfer und Navigationspräferenzen bestanden.
- Browserprüfung mit isolierten synthetischen Daten und den echten Komponenten:
  Standardreiter, Wechsel zwischen Reitern, erhaltene Namenseingabe, Umbenennen,
  Hinzufügen-Auswahl mit freigegebenem Formular, OAuth-Rückkehr und Tastatur-End.
  Keine externen Konten oder Daten durch diese Tests verändert.
- Angemeldete Dev-Profilsitzung vor Veröffentlichung vorhanden. Nach Push
  Vercel-Erfolg und die neue Ansicht in dieser Sitzung separat kontrollieren.

## Veröffentlichung und Grenze

Vorheriger Dev-Stand: `445fa65f6194d38a6e75a15cdd6eed99cb06af91`.
Main-Baseline: `230c2ad86af9700118e2f1456746292241461efc`.
Nur Frontend-Veröffentlichung über Git-Branch `dev`; kein Firebase-Deploy.
Ein Frontend-Rollback kann auf den vorherigen Dev-Stand erfolgen.
