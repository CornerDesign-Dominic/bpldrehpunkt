export const KNOWLEDGE_STATUSES = ['draft', 'valid', 'archived']
export const KNOWLEDGE_AUDIENCES = ['general', 'customer', 'carrier', 'tax', 'lawyer', 'collection', 'other']
export const KNOWLEDGE_ARTICLE_SECTIONS = ['situation', 'checks', 'action', 'cautions', 'responseTemplate', 'followUp']
export const KNOWLEDGE_RULE_SECTIONS = ['scope', 'provisions', 'avoid', 'exceptions', 'examples']
export const knowledgeLabels = {
  title: ['Titel', 'Title'], process: ['Prozess', 'Process'], topic: ['Thema (optional)', 'Topic (optional)'], tags: ['Suchbegriffe', 'Search terms'],
  situation: ['Situation erkennen', 'Recognize the situation'], checks: ['Zuerst prüfen', 'Check first'], action: ['Vorgehen', 'Steps'],
  cautions: ['Beachten & eskalieren', 'Cautions & escalation'], responseTemplate: ['Antwort / Vorlage', 'Response / template'], followUp: ['Abschluss & Nachverfolgung', 'Completion & follow-up'],
  scope: ['Geltungsbereich', 'Scope'], provisions: ['Vorgaben', 'Requirements'], avoid: ['Vermeiden', 'Avoid'], exceptions: ['Ausnahmen & Rücksprache', 'Exceptions & consultation'], examples: ['Beispiele', 'Examples'],
  audience: ['Adressat', 'Audience'], owner: ['Zuständig', 'Responsible'], status: ['Status', 'Status'], lastReviewedDate: ['Zuletzt geprüft', 'Last reviewed'], nextReviewDate: ['Nächste Prüfung', 'Next review'],
  draft: ['Entwurf', 'Draft'], valid: ['Gültig', 'Valid'], archived: ['Archiviert', 'Archived'],
  general: ['Allgemein', 'General'], customer: ['Kunden', 'Customers'], carrier: ['Unternehmer', 'Carriers'], tax: ['Finanzamt', 'Tax office'], lawyer: ['Anwälte', 'Lawyers'], collection: ['Inkasso', 'Debt collection'], other: ['Sonstige', 'Other'],
  open: ['Offen', 'Open'], in_progress: ['In Bearbeitung', 'In progress'], resolved: ['Erledigt', 'Done'], ignored: ['Zurückgestellt', 'Deferred'],
}
export const knowledgeBaseUrl = (kind) => kind === 'rule' ? '/qualitaet/grundregeln' : '/qualitaet/handbuch'
export const knowledgeUrl = (kind, id) => `${knowledgeBaseUrl(kind)}/${encodeURIComponent(id)}`
export const knowledgeSections = (kind) => kind === 'rule' ? KNOWLEDGE_RULE_SECTIONS : KNOWLEDGE_ARTICLE_SECTIONS
export function knowledgeValues(kind, record = {}) {
  const keys = kind === 'rule' ? ['title', 'scope', 'provisions', 'avoid', 'exceptions', 'examples', 'audience', 'owner', 'status', 'lastReviewedDate', 'nextReviewDate'] : ['title', 'process', 'topic', 'tags', ...KNOWLEDGE_ARTICLE_SECTIONS, 'owner', 'status', 'lastReviewedDate', 'nextReviewDate']
  const values = Object.fromEntries(keys.map((key) => [key, record[key] || '']))
  values.status = record.status || 'draft'
  if (kind === 'rule') values.audience = record.audience || 'general'
  else values.ruleIds = [...(record.ruleIds || [])]
  return values
}
export function filterKnowledge(records, { search = '', status = '', process = '', audience = '' } = {}) {
  const term = search.trim().toLocaleLowerCase()
  return records.filter((item) => (!status || item.status === status) && (!process || item.process === process) && (!audience || item.audience === audience) && (!term || Object.values(item).some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term)))).sort((left, right) => left.title.localeCompare(right.title))
}
export function knowledgeOverdue(record, today) { return Boolean(record.nextReviewDate && record.nextReviewDate < today) }
