import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { mailboxRecordKinds } from './shared/mailboxRecordFields.js'

export const recordFail = (code, message) => { throw new HttpsError(code, message) }
export const recordHash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
export const actorName = actor => [actor.profile.firstName, actor.profile.lastName].filter(Boolean).join(' ').trim() || actor.profile.email || actor.uid
export const canModule = (actor, module, edit = false) => actor.profile.role === 'superadmin' || (edit ? actor.profile.permissions?.[module] === 'edit' : ['view', 'edit'].includes(actor.profile.permissions?.[module]))
export function assertRecordAccess(actor, kind) {
  const config = mailboxRecordKinds[kind]
  if (!config || actor.profile.active !== true || !canModule(actor, config.module, kind !== 'calendar')) recordFail('permission-denied', 'Keine Berechtigung für diese Mailaktion.')
}
export const cleanSegment = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && !value.includes('|') && !value.includes('\0')
export function assertRecordPath(kind, path) {
  const parts = typeof path === 'string' ? path.split('/') : []
  if (kind === 'calendar' ? parts.length !== 4 || parts[0] !== 'calendars' || parts[2] !== 'events' || !cleanSegment(parts[1]) || !cleanSegment(parts[3]) : parts.length !== 2 || parts[0] !== mailboxRecordKinds[kind]?.collection || !cleanSegment(parts[1])) recordFail('invalid-argument', 'Ungültige Zuordnung.')
  return parts
}
export function canReadRecord(actor, kind, data) {
  if (kind !== 'todo') return true
  return actor.profile.role === 'superadmin' || data.creatorUserId === actor.uid || data.assignedUserId === actor.uid || data.status !== 'withdrawn' && (data.audienceType === 'all' || data.audienceType === 'person' && data.audienceId === actor.uid || data.audienceType === 'people' && Array.isArray(data.audienceIds) && data.audienceIds.includes(actor.uid) || data.audienceType === 'department' && Boolean(actor.profile.department) && data.audienceId === actor.profile.department)
}
export function assertTodoMutation(actor, data, mode) {
  if (!canReadRecord(actor, 'todo', data)) recordFail('permission-denied', 'Kein Zugriff auf diese Aufgabe.')
  if (mode === 'update' && (!(actor.profile.role === 'superadmin' || data.creatorUserId === actor.uid) || !['open', 'in_progress'].includes(data.status))) recordFail('permission-denied', 'Nur der Ersteller darf offene Aufgaben bearbeiten.')
  if (mode === 'close' && (data.assignedUserId !== actor.uid || !['open', 'in_progress'].includes(data.status))) recordFail('permission-denied', 'Nur die bearbeitende Person darf diese Aufgabe erledigen.')
}
export const recordVersion = (kind, data) => recordHash({ fields: Object.fromEntries(mailboxRecordKinds[kind].fields.map(field => [field.key, data[field.key] ?? null])), status: data.status || '', updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt ?? null })
const plain = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export function scoreRecord(kind, data, analysis) {
  const refs = [...analysis.references, ...['reference', 'transportReference', 'courtReference', 'lawyerReference', 'collectionReference', 'invoiceNumbers'].map(key => analysis.values[key])].filter(Boolean).flatMap(value => String(value).split(/[;,\n]/)).map(value => plain(value.replace(/^(?:TA|Transportauftrag)\s*(?=\d)/i, ''))).filter(value => value.length >= 4)
  const identifiers = ['caseNumber', 'reference', 'transportReference', 'courtReference', 'lawyerReference', 'collectionReference', 'invoiceNumbers']
  const reasons = identifiers.filter(key => data[key] && refs.some(ref => plain(data[key]).includes(ref)))
  const name = plain(analysis.values.debtorName || analysis.values.counterparty || analysis.values.claimant)
  if (name.length >= 6 && [data.debtorName, data.counterparty, data.claimant].some(value => value && plain(value) === name)) reasons.push('Unternehmen / Gegenpartei')
  const title = plain(analysis.values.title)
  if (title.length >= 8 && plain(data.title) === title) reasons.push('Titel')
  if (kind === 'calendar' && analysis.values.startDate === data.startDate && reasons.includes('Titel')) reasons.push('Termindatum')
  return { score: reasons.length, reasons }
}
const nullFields = keys => Object.fromEntries(keys.split(' ').filter(Boolean).map(key => [key, null]))
export function newRecordData(kind, values, { actor, stamp, caseNumber, sequence, year, partner }) {
  if (kind === 'calendar') return { title: values.title, description: values.description || '', startDate: values.startDate, endDate: values.endDate, allDay: values.allDay !== 'false', startTime: values.allDay === 'false' ? values.startTime : '', endTime: values.allDay === 'false' ? values.endTime : '', createdByUserId: actor.uid, createdAt: stamp, updatedAt: stamp }
  if (kind === 'todo') return {
    ...nullFields('dueDate reminderDate customerId customerName carrierId carrierName reference transportOrderId transportOrderNumber damageCaseId insolvencyId legalDisputeId inkassoCaseId'), title: values.title, description: values.description || '', dueDate: values.dueDate || null, priority: values.priority || 'medium', reference: values.reference || null, transportOrderLinks: [],
    creatorUserId: actor.uid, creatorName: actorName(actor), audienceType: 'person', audienceId: actor.uid, audienceIds: null, audienceLabel: actorName(actor), assignedUserId: actor.uid, assignedUserName: actorName(actor), assignedAt: stamp, status: 'in_progress', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null, createdAt: stamp, updatedAt: stamp,
  }
  const metadata = { createdAt: stamp, createdBy: actor.uid, createdByName: actorName(actor), updatedAt: stamp, updatedBy: actor.uid, updatedByName: actorName(actor) }
  const fields = Object.fromEntries(mailboxRecordKinds[kind].fields.filter(field => !field.key.startsWith('deadline')).map(field => [field.key, values[field.key] ?? null]))
  if (kind === 'damage') return { ...nullFields('responsibleUserId responsibleUserName claimantPartnerId contractorPartnerId legalBasis cargoWeightKg liabilityLimit insuranceRelevance bplInsuranceCaseNumber contractorInsurance contractorInsuranceCaseNumber customerInsurance customerInsuranceNumber contractorLiability'), ...fields, title: `${caseNumber} – ${values.damageDate}`, caseNumber, caseYear: year, caseSequence: sequence, status: 'new', openBplRisk: null, ...metadata }
  if (kind === 'court') return { ...nullFields('participant opposingCounsel opposingRepresentation opposingReference responsibleUserId responsibleUserName ownCounsel lawyerHandoverDate lawyerPhone lawyerEmail courtLocation judgeOrChamber nextDeadline nextDeadlineLabel nextHearing nextHearingTime procedureType proceedingStage instance completedAt originalClaim counterClaim paidAmount openAmount legalFees courtCosts otherCosts'), ...fields, title: [caseNumber, values.transportReference, values.counterparty].filter(Boolean).join(' – '), caseNumber, caseYear: year, caseSequence: sequence, status: 'open', isClosed: false, ...metadata }
  return { ...nullFields('debtorContactName debtorAddress debtorEmail debtorPhone responsibleUserId responsibleUserName lawFirmContactName lawFirmEmail lawFirmPhone lawyerHandoverDate court courtReference paymentOrderDate enforcementOrderDate completedAt'), ...fields, caseNumber, title: `${caseNumber} – ${partner.debtorName}`, debtorName: partner.debtorName, debtorNumber: partner.debtorNumber, debtorPartnerId: partner.id, debtorPartnerRole: partner.role, status: 'open', isClosed: false, titleAvailable: false, paidAmount: 0, ...metadata }
}
export function patchRecordData(kind, previous, changes, { mode, actor, stamp, note }) {
  const patch = kind === 'calendar' || kind === 'todo' ? { updatedAt: stamp } : { updatedAt: stamp, updatedBy: actor.uid, updatedByName: actorName(actor) }
  if (mode === 'update') Object.assign(patch, changes)
  for (const key of ['deadlineDate', 'deadlineTime', 'deadlineNote']) delete patch[key]
  if (kind === 'calendar') {
    if (Object.hasOwn(patch, 'allDay')) patch.allDay = patch.allDay !== 'false'
    if (patch.allDay === true) { patch.startTime = ''; patch.endTime = '' }
    if (mode === 'close') { const title = String(previous.title || 'Termin'); patch.title = title.startsWith('Abgesagt: ') ? title : `Abgesagt: ${title}`.slice(0, 160); const description = [previous.description, 'Termin abgesagt.', note].filter(Boolean).join('\n\n'); patch.description = description.length <= 4000 ? description : previous.description || '' }
    if (mode === 'note') patch.description = [previous.description, note].filter(Boolean).join('\n\n')
    if ((patch.description || '').length > 4000 || (patch.title || '').length > 160) recordFail('invalid-argument', 'Der Kalendereintrag wäre zu lang. Bitte den Text kürzen.')
  }
  if (mode === 'close' && kind !== 'calendar') {
    patch.status = { todo: 'completed', damage: 'economically_closed', collection: 'completed', court: 'completed' }[kind]
    if (kind !== 'damage') patch.completedAt = stamp
    if (kind === 'todo') { patch.completedByUserId = actor.uid; patch.completedByName = actorName(actor) }
    if (['collection', 'court'].includes(kind)) patch.isClosed = true
  }
  if (kind === 'damage' && changes.damageDate && mode === 'update') patch.title = `${previous.caseNumber} – ${changes.damageDate}`
  if (kind === 'court' && mode === 'update') patch.title = [previous.caseNumber, changes.transportReference ?? previous.transportReference, changes.counterparty ?? previous.counterparty].filter(Boolean).join(' – ')
  // A linked debtor's name is authoritative in master data, never an AI text update.
  if (kind === 'collection' && previous.debtorPartnerId) delete patch.debtorName
  return patch
}
