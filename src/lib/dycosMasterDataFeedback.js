export function dycosMasterDataError(error) {
  switch (error?.code) {
    case 'functions/not-found': return error.details?.sourceCode === 'PARTNER_NOT_FOUND' ? 'Unter dieser Nummer wurde in DyCoS kein Partner gefunden. Bitte prüfe die Nummer.' : 'Der Stammdatenabruf ist noch nicht eingerichtet. Bitte wende dich an die Administration.'
    case 'functions/invalid-argument': return 'Bitte gib eine gültige Debitoren- oder Kreditornummer ein.'
    case 'functions/permission-denied': return 'Du hast keine Berechtigung zur Bearbeitung von Stammdaten.'
    case 'functions/unauthenticated': return 'Bitte melde dich erneut an.'
    case 'functions/failed-precondition': return 'Die Partnerzuordnung ist widersprüchlich oder mehrdeutig. Es wurde nichts übernommen. Bitte die Stammdatenzuordnung prüfen.'
    case 'functions/resource-exhausted': return 'Zu viele Abrufe. Bitte warte eine Minute.'
    case 'functions/aborted': return 'Diese Partnernummer wird gerade verarbeitet. Bitte warte kurz und versuche denselben Abruf erneut.'
    default: return 'Die Übernahme konnte nicht bestätigt werden. Bitte versuche denselben Abruf erneut; eine bereits erfolgte Übernahme wird erkannt.'
  }
}
