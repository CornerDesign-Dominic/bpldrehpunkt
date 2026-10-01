# Zweisprachige Bedienoberfläche

Stand: 2026-10-01. Die Implementierung liegt auf `dev`.

## Umfang

- Deutsch bleibt Standard und Fallback für bestehende Profile ohne `language`.
- Englisch wird im eigenen Profil gewählt. Die Einstellung liegt im Benutzerprofil und folgt dem Benutzer auf andere Geräte.
- Die Oberfläche umfasst Navigation, Seiten, Formulare, Tabellen, Dialoge, Ladezustände, Statusbezeichnungen und Meldungen. Feste Texte in den React-Seiten und -Komponenten sind an die Sprache gebunden.
- Benutzerfreitext, Namen, gespeicherte Historientexte, hochgeladene Dateien und fachliche Daten bleiben in ihrer Originalsprache.
- Automatische Systemmails, Authentifizierungs-E-Mails, PDF-Ausgaben und Dokument-/Vorlageninhalte werden durch die Spracheinstellung nicht verändert. Bedienelemente der zugehörigen Verwaltungsseiten gehören zur Oberfläche.

## Technik

- `src/i18n/translations.js` enthält Schlüssel für Navigation, Profil und UI-Texte mit Parametern. `src/i18n/autoTranslations.js` enthält feste deutsche UI-Ausgangstexte und ihre englischen Fassungen; `autoOverrides.js` korrigiert Fachbegriffe und häufige Bedienelemente.
- `LanguageProvider` liest `profile.language`, setzt `document.lang` und stellt die Übersetzung bereit. Die Firebase-Auth-Sprache wird nicht umgestellt, damit Authentifizierungs-E-Mails unverändert bleiben.
- `StaticText` und `TranslatedProps` binden feste JSX-Texte und Attribute an die gewählte Sprache. Meldungen und Status aus lokalen Hilfsfunktionen werden an den jeweiligen UI-Ausgaben übersetzt. Datenwerte werden nicht beim Speichern verändert.
- Die App-Check-geschützte Callable `updateOwnLanguage` erlaubt einem aktiven Benutzer ausschließlich `de` oder `en` im eigenen Profil. Die Firestore-Regel für direkte Profiländerungen bleibt gesperrt.

## Prüfung

- `npm run build` und `npm run lint` erfolgreich.
- 459 Tests aus `src/` und `functions/`: 437 bestanden, 22 übersprungen, 0 fehlgeschlagen.
- Vor einem Production-Release ist die dokumentierte Projektabnahme nötig. In einer laufenden Entwicklungsumgebung müssen beide Sprachen mit passenden Rollen durch die Routen, Dialoge und Formularfehler geprüft werden; die automatischen Tests ersetzen diese Sichtprüfung nicht.
