// Stable UI/API vocabulary for the initial mail triage, independent of case actions.
export const MAIL_TRIAGE_VERSION = 1
export const MAIL_TRIAGE_ACTIONS = Object.freeze(['tracking', 'order', 'invoice', 'terms', 'todo', 'damage', 'collection', 'court', 'calendar'])
export const MAIL_TRIAGE_QUESTIONS = Object.freeze([
  { key: 'topic', de: 'Worum geht es?', en: 'What is it about?' },
  { key: 'messageType', de: 'Was wird mitgeteilt?', en: 'What has changed?' },
  { key: 'requiredAction', de: 'Welche Handlung ist erforderlich?', en: 'What action is required?' },
  { key: 'deadline', de: 'Termin oder Frist?', en: 'Appointment or deadline?' },
  { key: 'references', de: 'Welche Referenzen wurden erkannt?', en: 'Which references were found?' },
])
export const MAIL_TRIAGE_REJECTION_REASONS = Object.freeze([
  { id: 'wrong_action', de: 'Falsche Aktion empfohlen', en: 'Wrong action recommended' },
  { id: 'no_action', de: 'Keine Handlung erforderlich', en: 'No action required' },
  { id: 'already_done', de: 'Bereits erledigt', en: 'Already handled' },
  { id: 'misunderstood', de: 'Inhalt falsch verstanden', en: 'Content misunderstood' },
  { id: 'other_action', de: 'Andere Aktion erforderlich', en: 'Another action required' },
  { id: 'other', de: 'Sonstiger Grund', en: 'Other reason' },
])
export const MAIL_TRIAGE_REVIEW_STATUSES = Object.freeze([
  { id: 'new', de: 'Neu', en: 'New' },
  { id: 'reviewing', de: 'In Prüfung', en: 'Under review' },
  { id: 'planned', de: 'Verbesserung vorgesehen', en: 'Improvement planned' },
  { id: 'verified', de: 'Verbesserung geprüft', en: 'Improvement verified' },
  { id: 'not_error', de: 'Kein Einordnungsfehler', en: 'Not a classification error' },
])
