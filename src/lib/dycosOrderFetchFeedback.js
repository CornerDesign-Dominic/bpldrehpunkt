export const resultMessages = {
  new: 'Transportauftrag wurde angelegt.',
  updated: 'Transportauftrag wurde aktualisiert.',
  unchanged: 'Transportauftrag ist bereits aktuell.',
}

const warningMessages = {
  PARTNER_MASTER_DATA_IDENTITY_MISSING: 'Zusätzliche Partnerdaten konnten ohne eindeutige Kontonummer und Partnerzuordnung nicht übernommen werden.',
  PARTNER_MULTIPLE_GENERAL_EMAILS: 'Mehrere allgemeine E-Mail-Adressen wurden als Kontakte übernommen. Es wurde keine einzelne Standardadresse ausgewählt.',
  PARTNER_MASTER_DATA_CONFLICTS: 'Abweichende Stammdaten wurden beibehalten. Die Unterschiede sind im jeweiligen Kunden- oder Unternehmerblatt sichtbar.',
  PARTNER_MASTER_DATA_PERMISSION_REQUIRED: 'Zusätzliche Stammdaten wurden wegen fehlender Stammdaten-Bearbeitungsrechte nicht übernommen.',
  PARTNER_CONTACT_DATA_INVALID: 'Einzelne Kontaktangaben aus DyCoS konnten nicht übernommen werden. Bitte die Quelldaten prüfen.',
  PARTNER_BANK_DATA_INVALID: 'Einzelne Bankangaben aus DyCoS konnten nicht übernommen werden. Bitte die Quelldaten prüfen.',
  SLOT_MIDNIGHT_UNCONFIRMED: 'Eine Bis-Uhrzeit von 00:00 wurde nicht als Zeitfenster übernommen. Bitte die Stationszeiten prüfen.',
  SLOT_OVERNIGHT_UNCONFIRMED: 'Eine Bis-Uhrzeit liegt vor der Von-Uhrzeit. Das Ende des Zeitfensters wurde nicht übernommen; bitte die Stationszeiten prüfen.',
  UNKNOWN_STOP_TYPE: 'Eine Station konnte nicht als Lade- oder Entladestelle eingeordnet werden. Bitte die Stationen prüfen.',
  TOUR_COSTS_NOT_ASSIGNED_TO_ORDER: 'Tourkosten ohne eindeutige Zuordnung zu diesem Auftrag wurden nicht in dessen Unternehmerpreis übernommen.',
}

export function errorMessage(error) {
  switch (error?.code) {
    case 'functions/not-found': return error.details?.sourceCode === 'TA_NOT_FOUND' || error.details?.code === 'TA_NOT_FOUND'
      ? 'Unter dieser TA-Nummer wurde in DyCoS kein Auftrag gefunden. Bitte prüfe die Nummer.'
      : 'Der DyCoS-Abruf ist derzeit nicht verfügbar. Bitte wende dich an die Administration.'
    case 'functions/invalid-argument': return 'Bitte gib eine gültige TA-Nummer ein.'
    case 'functions/permission-denied': return 'Du hast keine Berechtigung für diesen Abruf.'
    case 'functions/unauthenticated': return 'Bitte melde dich erneut an und versuche es noch einmal.'
    case 'functions/deadline-exceeded':
    case 'functions/unavailable': return 'Der Abruf konnte nicht bestätigt werden. Bitte versuche dieselbe TA-Nummer erneut; eine bereits erfolgte Übernahme wird erkannt.'
    case 'functions/already-exists': return 'Diese Anfrage wird bereits verarbeitet. Bitte warte kurz und versuche dieselbe TA-Nummer erneut.'
    case 'functions/aborted': return 'Der Auftrag wird gerade bearbeitet. Bitte warte kurz und rufe dieselbe TA-Nummer erneut ab.'
    case 'functions/resource-exhausted': return 'Es wurden zu viele Abrufe gestartet. Bitte warte eine Minute und versuche es erneut.'
    case 'functions/failed-precondition': return error.details?.sourceCode === 'SOURCE_ORDER_CHANGED'
      ? 'Die Auftragszuordnung in DyCoS hat sich geändert. Bitte erneut suchen.'
      : error.details?.sourceCode === 'ORDER_BEFORE_IMPORT_START'
      ? 'Es können nur Aufträge ab Januar 2026 übernommen werden. Ohne Ladedatum muss die TA-Nummer einen gültigen Jahres-/Monatspräfix ab 2601 haben.'
      : 'Die Partnerzuordnung muss geprüft werden. Bitte prüfe die Stammdaten oder wende dich an die Administration.'
    default: return 'Der Auftrag konnte nicht übernommen werden. Bitte versuche es erneut oder wende dich an die Administration.'
  }
}

export function dycosImportWarnings(result) {
  return [...new Set((Array.isArray(result?.warningCodes) ? result.warningCodes : []).slice(0, 10).map((code) => typeof code === 'string' && Object.hasOwn(warningMessages, code) ? warningMessages[code] : 'Die Daten wurden mit Hinweisen übernommen. Bitte prüfe den Transportauftrag.'))]
}
