import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { requireActiveProfile } from './access.js'
import { applyPartnerMergeDecisions, partnerMergePreview } from './partnerMergeDecisions.js'
import { mergeFieldChanges, mergeReversalEligibility, planCopiedMergeRecord, planMergeReference, planMergeReversalFields, restoredMergeSource, summarizeMergeReversal } from './partnerMergeReversal.js'
import { carrierAdditions, carrierDecisionDetails } from './carrierImportModel.js'
import { PARTNER_REFERENCE_CATALOG, assertFlatPartnerCluster, mergeClusterRedirects, ownedPartnerNumbers, partnerClusterMembers, partnerNumbers as clusterNumbers, resolvePartnerInIndex } from './partnerCluster.js'

const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const empty = (value) => !text(value)
const actorName = (profile) => [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt'
const unique = (values) => [...new Set(values.map(text).filter(Boolean))]

export const PARTNER_REFERENCE_FIELDS = PARTNER_REFERENCE_CATALOG.flatMap(({ collection, fields }) => fields.map((field) => [collection, field]))

export const hasPartnerMergeAccess = (profile) => profile?.role === 'superadmin' || profile?.permissions?.partnerMerges === 'edit'

function mergeObject(target = {}, source = {}) {
  return Object.fromEntries([...new Set([...Object.keys(target || {}), ...Object.keys(source || {})])].map((key) => [key, !empty(target?.[key]) ? target[key] : (source?.[key] ?? '')]))
}

function mergeContacts(target = [], source = []) {
  const result = [...(target || [])]
  ;(source || []).forEach((candidate) => {
    const email = text(candidate?.email).toLocaleLowerCase('de-DE')
    const index = email ? result.findIndex((entry) => text(entry?.email).toLocaleLowerCase('de-DE') === email) : -1
    if (index < 0) result.push(candidate)
    else result[index] = mergeObject(result[index], candidate)
  })
  return result
}

function mergedNumbers(target, source, field, referenceField) {
  const numbers = unique([target?.[field], ...(target?.dycosReferences?.[referenceField] || []), source?.[field], ...(source?.dycosReferences?.[referenceField] || [])])
  return { primary: text(target?.[field]) || text(source?.[field]) || numbers[0] || '', references: numbers }
}

export function mergePartnerRecords(target, source) {
  const debtors = mergedNumbers(target, source, 'debtorNumber', 'debtorNumbers')
  const creditors = mergedNumbers(target, source, 'creditorNumber', 'creditorNumbers')
  return {
    debtorNumber: debtors.primary,
    creditorNumber: creditors.primary,
    dycosReferences: { ...(target?.dycosReferences || {}), ...(source?.dycosReferences || {}), debtorNumbers: debtors.references, creditorNumbers: creditors.references },
    address: mergeObject(target?.address, source?.address),
    contact: mergeObject(target?.contact, source?.contact),
    companyData: mergeObject(target?.companyData, source?.companyData),
    bankData: mergeObject(target?.bankData, source?.bankData),
    contacts: mergeContacts(target?.contacts, source?.contacts),
  }
}

async function access(request) {
  const profile = await requireActiveProfile(request)
  if (!hasPartnerMergeAccess(profile)) throw new HttpsError('permission-denied', 'Für Partnerzusammenführungen wird die Berechtigung „Partner zusammenführen“ benötigt.')
  return profile
}

export function manualMergeDirection(currentId, otherId, direction) {
  if (!currentId || !otherId || currentId === otherId) throw new HttpsError('invalid-argument', 'Es müssen zwei unterschiedliche Partner ausgewählt werden.')
  if (direction === 'current-source') return { targetId: otherId, sourceId: currentId }
  if (direction === 'current-target') return { targetId: currentId, sourceId: otherId }
  throw new HttpsError('invalid-argument', 'Die Zusammenführungsrichtung ist ungültig.')
}

export function assertManualPartnerState(currentSnapshot, otherSnapshot) {
  if (!currentSnapshot.exists || !otherSnapshot.exists) throw new HttpsError('not-found', 'Eines der Stammdatenblätter ist nicht mehr verfügbar.')
  if (currentSnapshot.data().mergedIntoPartnerId || otherSnapshot.data().mergedIntoPartnerId) throw new HttpsError('failed-precondition', 'Ein Partner wurde bereits archiviert. Bitte die Auswahl neu laden.')
  if (otherSnapshot.data().status !== 'active') throw new HttpsError('failed-precondition', 'Der ausgewählte Partner ist nicht mehr aktiv. Bitte einen aktiven Partner wählen.')
}

export async function prepareManualPartnerMergeHandler(request) {
  await access(request)
  const currentId = text(request.data?.currentPartnerId); const otherId = text(request.data?.otherPartnerId)
  const { targetId, sourceId } = manualMergeDirection(currentId, otherId, request.data?.direction)
  const db = getFirestore()
  const [current, other] = await Promise.all([db.collection('businessPartners').doc(currentId).get(), db.collection('businessPartners').doc(otherId).get()])
  assertManualPartnerState(current, other)
  const partners = [current, other].map((snapshot) => ({ ...partnerMergePreview({ id: snapshot.id, ...snapshot.data() }), version: snapshot.updateTime.toMillis() }))
  return { merge: { partners, partnerIds: [currentId, otherId], currentPartnerId: currentId }, targetPartnerId: targetId, sourcePartnerId: sourceId }
}

export async function performPartnerMerge({ db, targetId, sourceId, partnerVersions, decisions, actor, rowRef = null, rowSnapshot = null, requiredActivePartnerId = '' }) {
  const [targetSnapshot, sourceSnapshot, allPartnerSnapshots] = await Promise.all([db.collection('businessPartners').doc(targetId).get(), db.collection('businessPartners').doc(sourceId).get(), db.collection('businessPartners').get()])
  if (!targetSnapshot.exists || !sourceSnapshot.exists) throw new HttpsError('failed-precondition', 'Eines der Stammdatenblätter ist nicht mehr verfügbar.')
  if (targetSnapshot.data().mergedIntoPartnerId) throw new HttpsError('failed-precondition', 'Der Zielpartner wurde bereits zusammengeführt. Bitte die Prüfzeile neu öffnen.')
  if (sourceSnapshot.data().mergedIntoPartnerId) throw new HttpsError('failed-precondition', 'Das Quell-Stammdatenblatt wurde bereits zusammengeführt.')
  if (requiredActivePartnerId && (requiredActivePartnerId === targetId ? targetSnapshot : sourceSnapshot).data().status !== 'active') throw new HttpsError('failed-precondition', 'Der ausgewählte Partner ist nicht mehr aktiv. Bitte einen aktiven Partner wählen.')
  const versions = partnerVersions || {}
  if (versions[targetId] !== targetSnapshot.updateTime.toMillis() || versions[sourceId] !== sourceSnapshot.updateTime.toMillis()) throw new HttpsError('failed-precondition', 'Ein Stammdatenblatt wurde inzwischen geändert. Bitte die Prüfzeile neu öffnen.')
  const target = { id: targetSnapshot.id, ...targetSnapshot.data() }; const source = { id: sourceSnapshot.id, ...sourceSnapshot.data() }
  const partners = allPartnerSnapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  let sourceDescendants; let targetDescendants
  try {
    sourceDescendants = mergeClusterRedirects(partners, sourceId, targetId)
    targetDescendants = partnerClusterMembers(partners, targetId).filter((entry) => entry.id !== targetId && entry.mergedIntoPartnerId !== targetId)
  } catch (error) { throw new HttpsError('failed-precondition', error.message) }
  const descendants = [...sourceDescendants, ...targetDescendants]
  if (descendants.length + (rowRef ? 1 : 0) + 5 > 450) throw new HttpsError('resource-exhausted', 'Zu viele Partner im Verbund für eine atomare, flache Weiterleitung. Es wurde nichts geändert.')
  const ownedNumbers = ownedPartnerNumbers(source, sourceDescendants)
  const movedNumbers = {
    debtors: ownedNumbers.debtors.filter((number) => !clusterNumbers(target, 'debtor').includes(number)),
    creditors: ownedNumbers.creditors.filter((number) => !clusterNumbers(target, 'creditor').includes(number)),
  }
  let applied
  try { applied = applyPartnerMergeDecisions(target, source, decisions) } catch (error) { throw new HttpsError('invalid-argument', error.message) }
  const debtors = mergedNumbers(target, source, 'debtorNumber', 'debtorNumbers')
  const creditors = mergedNumbers(target, source, 'creditorNumber', 'creditorNumbers')
  const targetPatch = {
    debtorNumber: debtors.primary, creditorNumber: creditors.primary,
    dycosReferences: { ...(source.dycosReferences || {}), ...(target.dycosReferences || {}), debtorNumbers: debtors.references, creditorNumbers: creditors.references },
    ...applied.patch,
  }
  let carrierFollowup = null
  if (rowRef?.parent?.id === 'carrierImportRows' && rowSnapshot?.data()?.sourceRow) {
    const importedRow = rowSnapshot.data().sourceRow
    const mergedRecord = { ...target, ...targetPatch }
    for (const key of ['address', 'contact', 'companyData', 'bankData']) mergedRecord[key] = { ...(target[key] || {}), ...(targetPatch[key] || {}) }
    const additions = carrierAdditions(mergedRecord, importedRow)
    const details = carrierDecisionDetails(importedRow, additions, mergedRecord)
    Object.entries(additions.patch).forEach(([key, value]) => { targetPatch[key] = ['address', 'contact', 'companyData', 'bankData'].includes(key) ? { ...(targetPatch[key] || {}), ...value } : value })
    carrierFollowup = { appliedValues: additions.patch, ...details, needsReview: details.comparisons.length > 0 || details.reasons.length > 0 }
  }
  const batch = db.batch(); const targetRef = targetSnapshot.ref; const sourceRef = sourceSnapshot.ref
  const operationRef = db.collection('partnerMergeOperations').doc(); const mergeId = operationRef.id; const mergedAt = Timestamp.now()
  const targetUpdate = { ...targetPatch, latestMergeId: mergeId, updatedAt: mergedAt }
  for (const key of ['address', 'contact', 'companyData', 'bankData']) if (targetUpdate[key]) targetUpdate[key] = { ...(target[key] || {}), ...targetUpdate[key] }
  batch.update(targetRef, targetUpdate, { lastUpdateTime: targetSnapshot.updateTime })
  batch.set(targetRef.collection('history').doc(), { category: 'merge', action: 'merged', mergeId, summary: `Stammdatenblatt ${source.companyName || source.id} zusammengeführt`, sourcePartnerId: sourceId, sourcePartnerName: source.companyName || '', decisions: applied.audit, appliedValues: applied.patch, ...(carrierFollowup ? { importedValues: carrierFollowup.appliedValues } : {}), actor, createdAt: mergedAt })
  batch.update(sourceRef, { status: 'merged', statusBeforeMerge: source.status || '', mergedIntoPartnerId: targetId, mergedIntoPartnerName: targetPatch.companyName || target.companyName || '', mergedByMergeId: mergeId, mergedAt, mergedBy: actor, updatedAt: mergedAt }, { lastUpdateTime: sourceSnapshot.updateTime })
  batch.set(sourceRef.collection('history').doc(), { category: 'merge', action: 'mergedInto', mergeId, summary: `Mit ${target.companyName || targetId} zusammengeführt`, targetPartnerId: targetId, sourceStatusBeforeMerge: source.status || '', decisions: applied.audit, actor, createdAt: mergedAt })
  descendants.forEach((entry) => {
    const snapshot = allPartnerSnapshots.docs.find((candidate) => candidate.id === entry.id)
    batch.update(snapshot.ref, { mergedIntoPartnerId: targetId, mergedIntoPartnerName: targetPatch.companyName || target.companyName || '', updatedAt: mergedAt }, { lastUpdateTime: snapshot.updateTime })
  })
  const result = { partnerId: targetId, assignment: { kind: 'merge' }, actions: carrierFollowup?.needsReview ? ['merged'] : ['merged', 'reviewed'] }
  const importPartnerField = rowRef?.parent?.id === 'carrierImportRows' ? 'carrierId' : 'customerId'
  if (rowRef) batch.update(rowRef, { [importPartnerField]: targetId, state: carrierFollowup?.needsReview ? 'open' : 'accepted', kind: carrierFollowup?.needsReview ? 'review' : rowSnapshot.data().kind, ...(carrierFollowup ? { comparisons: carrierFollowup.comparisons, reasons: carrierFollowup.reasons, automaticAppliedValues: carrierFollowup.appliedValues, merge: null } : {}), result, ...(carrierFollowup?.needsReview ? {} : { approval: { type: 'reviewed', action: 'merged', targetPartnerId: targetId, sourcePartnerId: sourceId, byUserId: actor.userId, byName: actor.name, at: FieldValue.serverTimestamp() } }), lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: rowSnapshot.updateTime })
  batch.create(operationRef, { schemaVersion: 2, mergeId, sourcePartnerId: sourceId, targetPartnerId: targetId, sourcePartnerName: source.companyName || '', targetPartnerName: targetPatch.companyName || target.companyName || '', sourceBefore: sourceSnapshot.data(), sourceOwnedNumbers: ownedNumbers, targetChanges: mergeFieldChanges(targetSnapshot.data(), targetUpdate), movedNumbers, appliedValues: applied.patch, ...(carrierFollowup ? { importAppliedValues: carrierFollowup.appliedValues, importPendingComparisons: carrierFollowup.comparisons } : {}), decisions: applied.audit, actor, mergedAt, status: 'merged', flattenedPartnerIds: descendants.map((entry) => entry.id), nestedSourceMergeId: source.latestMergeId || null })
  try { await batch.commit() } catch (error) { if (error.code === 9 || error.code === 'FAILED_PRECONDITION') throw new HttpsError('failed-precondition', 'Die Stammdaten oder die Prüfzeile wurden inzwischen geändert. Bitte die Prüfzeile neu öffnen.'); throw error }
  return { target, source, targetPatch, result, mergeId, carrierFollowup }
}

async function mergeImportPartnersHandler(request, collection, identityField, partnerField) {
  const profile = await access(request)
  if (collection === 'carrierImportRows' && profile.role !== 'superadmin' && (profile.permissions?.dataImports !== 'edit' || profile.permissions?.masterData !== 'edit')) throw new HttpsError('permission-denied', 'Für Unternehmerimporte werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt.')
  const runId = text(request.data?.runId); const rowId = text(request.data?.rowId); const targetId = text(request.data?.targetPartnerId)
  if (!runId || !rowId || !targetId) throw new HttpsError('invalid-argument', 'Importlauf, Prüfzeile oder Zielpartner fehlt.')
  const db = getFirestore(); const rowRef = db.collection(collection).doc(rowId)
  const rowSnapshot = await rowRef.get()
  if (!rowSnapshot.exists || rowSnapshot.data().runId !== runId || rowSnapshot.data().state !== 'open' || rowSnapshot.data().kind !== 'merge') throw new HttpsError('failed-precondition', 'Diese Zusammenführungsprüfung ist nicht mehr offen.')
  const row = rowSnapshot.data()
  if (row.lock?.userId !== request.auth.uid || row.lock?.expiresAt?.toMillis?.() <= Date.now()) throw new HttpsError('failed-precondition', 'Die Prüfreservierung ist abgelaufen oder gehört einem anderen Nutzer.')
  const partnerIds = unique(row.merge?.partnerIds || [])
  if (partnerIds.length !== 2 || !partnerIds.includes(targetId)) throw new HttpsError('invalid-argument', 'Der Zielpartner muss einer der beiden geprüften Partner sein.')
  const sourceId = partnerIds.find((id) => id !== targetId)
  const { target, targetPatch, result, carrierFollowup } = await performPartnerMerge({ db, targetId, sourceId, partnerVersions: request.data?.partnerVersions, decisions: request.data?.decisions, actor: { userId: request.auth.uid, name: actorName(profile) }, rowRef, rowSnapshot })
  return { row: { id: rowId, [identityField]: row[identityField], companyName: row.companyName, state: carrierFollowup?.needsReview ? 'open' : 'accepted', kind: carrierFollowup?.needsReview ? 'review' : 'merge', approvalType: carrierFollowup?.needsReview ? null : 'geprüft übernommen', [partnerField]: targetId, result, affectedPartner: { id: targetId, companyName: targetPatch.companyName || target.companyName || '' } }, targetPartnerId: targetId, sourcePartnerId: sourceId }
}

export const mergeCustomerImportPartnersHandler = (request) => mergeImportPartnersHandler(request, 'customerImportRows', 'debtorNumber', 'customerId')
export const mergeCarrierImportPartnersHandler = (request) => mergeImportPartnersHandler(request, 'carrierImportRows', 'creditorNumber', 'carrierId')

export async function mergeManualPartnersHandler(request) {
  const profile = await access(request)
  const currentId = text(request.data?.currentPartnerId); const otherId = text(request.data?.otherPartnerId)
  const { targetId, sourceId } = manualMergeDirection(currentId, otherId, request.data?.direction)
  const db = getFirestore()
  const [current, other] = await Promise.all([db.collection('businessPartners').doc(currentId).get(), db.collection('businessPartners').doc(otherId).get()])
  assertManualPartnerState(current, other)
  const { target, targetPatch } = await performPartnerMerge({ db, targetId, sourceId, partnerVersions: request.data?.partnerVersions, decisions: request.data?.decisions, actor: { userId: request.auth.uid, name: actorName(profile) }, requiredActivePartnerId: otherId })
  return { targetPartnerId: targetId, sourcePartnerId: sourceId, targetPartnerName: targetPatch.companyName || target.companyName || '' }
}

const reversalBlocked = (reason) => ({ canSeparate: false, reason: reason || 'Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden.' })
const updateValues = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === undefined ? FieldValue.delete() : value]))
const snapshotVersion = (snapshot) => snapshot?.updateTime?.toMillis?.() || 0
const partnerNumbers = (partner, primary, list) => unique([partner?.[primary], ...(partner?.dycosReferences?.[list] || [])])

async function getSnapshots(db, paths) {
  const result = []
  for (let index = 0; index < paths.length; index += 200) result.push(...await db.getAll(...paths.slice(index, index + 200).map((path) => db.doc(path))))
  return result
}

function flatNumberPatch(current, movedNumbers) {
  const patch = {}
  const warnings = []
  for (const [kind, primary, list, movedKey] of [['debtor', 'debtorNumber', 'debtorNumbers', 'debtors'], ['creditor', 'creditorNumber', 'creditorNumbers', 'creditors']]) {
    const numbers = clusterNumbers(current, kind)
    const moved = movedNumbers[movedKey] || []
    const remaining = numbers.filter((number) => !moved.includes(number))
    if (moved.some((number) => !numbers.includes(number))) warnings.push(`${primary}: eine bei der Zusammenführung übernommene Nummer wurde inzwischen geändert.`)
    if (remaining.length !== numbers.length) patch[`dycosReferences.${list}`] = remaining
    if (moved.includes(text(current[primary]))) patch[primary] = remaining[0] || ''
  }
  return { patch, warnings }
}

async function loadFlatMergeReversal(db, operationRef, operationSnapshot, requestedTargetId) {
  const operation = operationSnapshot.data()
  if (!operation.sourceBefore || !operation.sourceOwnedNumbers || !operation.movedNumbers || !Array.isArray(operation.targetChanges) || !Array.isArray(operation.flattenedPartnerIds)) return reversalBlocked('Das flache Merge-Protokoll ist unvollständig. Eine sichere Trennung ist nicht möglich.')
  if (operation.status !== 'merged') return reversalBlocked('Diese Zusammenführung wurde bereits getrennt oder ist nicht mehr offen.')
  const all = await db.collection('businessPartners').get()
  const partners = all.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
  const byId = new Map(partners.map((partner) => [partner.id, partner]))
  const bySnapshot = new Map(all.docs.map((snapshot) => [snapshot.id, snapshot]))
  const source = bySnapshot.get(operation.sourcePartnerId)
  if (!source?.exists || source.data().mergedByMergeId !== operation.mergeId || source.data().status !== 'merged') return reversalBlocked('Das Quell-Stammdatenblatt wurde seitdem verändert oder bereits getrennt.')
  let root
  try { root = resolvePartnerInIndex(byId, source.id) } catch (error) { return reversalBlocked(error.message) }
  if (!root || root.id === source.id || source.data().mergedIntoPartnerId !== root.id || root.mergedIntoPartnerId || (requestedTargetId !== root.id && requestedTargetId !== operation.targetPartnerId)) return reversalBlocked('Die Partner-Weiterleitung ist nicht direkt und eindeutig.')
  try { assertFlatPartnerCluster(partnerClusterMembers(partners, root.id)) } catch (error) { return reversalBlocked(error.message) }
  const target = bySnapshot.get(root.id)
  const sourceNumbers = operation.sourceOwnedNumbers
  const activeOthers = partners.filter((partner) => partner.id !== source.id && partner.id !== root.id && !partner.mergedIntoPartnerId)
  if (activeOthers.some((partner) => sourceNumbers.debtors.some((number) => clusterNumbers(partner, 'debtor').includes(number)) || sourceNumbers.creditors.some((number) => clusterNumbers(partner, 'creditor').includes(number)))) return reversalBlocked('Eine zurückzugebende Nummer gehört inzwischen einem anderen aktiven Partner.')
  const latestDirect = root.id === operation.targetPartnerId && root.latestMergeId === operation.mergeId
  const nonNumberChanges = latestDirect ? operation.targetChanges.filter((change) => !['debtorNumber', 'creditorNumber', 'dycosReferences.debtorNumbers', 'dycosReferences.creditorNumbers'].includes(change.path)) : []
  const dataPlan = planMergeReversalFields(target.data(), nonNumberChanges)
  const numbers = flatNumberPatch(target.data(), operation.movedNumbers)
  const warnings = [...dataPlan.warnings, ...numbers.warnings]
  if (!latestDirect) warnings.push('Das Ziel wurde seitdem weiterverarbeitet. Übernommene Stammdatenwerte bleiben zur sicheren manuellen Prüfung erhalten.')
  const targetPlan = { patch: { ...dataPlan.patch, ...numbers.patch }, warnings }
  const versions = all.docs.map((snapshot) => [snapshot.id, snapshotVersion(snapshot)])
  const fingerprint = createHash('sha256').update(JSON.stringify({ mergeId: operation.mergeId, operationVersion: snapshotVersion(operationSnapshot), versions, targetPlan })).digest('hex')
  return { canSeparate: true, operationRef, operationSnapshot, operation, source, target, targetPlan, fingerprint, summary: summarizeMergeReversal(operation, [], [], warnings, targetPlan.patch) }
}

export async function loadMergeReversal(db, mergeId, targetId) {
  const operationRef = db.collection('partnerMergeOperations').doc(mergeId)
  const operationSnapshot = await operationRef.get()
  if (operationSnapshot.exists && operationSnapshot.data().schemaVersion === 2) return loadFlatMergeReversal(db, operationRef, operationSnapshot, targetId)
  if (!operationSnapshot.exists || operationSnapshot.data().schemaVersion !== 1) return reversalBlocked('Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden: vollständiges Protokoll fehlt.')
  const operation = operationSnapshot.data()
  if (operation.targetPartnerId !== targetId) return reversalBlocked('Die Zusammenführung gehört nicht zu diesem Zielpartner.')
  if (!operation.sourcePartnerId || !operation.targetPartnerId) return reversalBlocked('Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden: Partner-IDs fehlen.')
  const [source, target, referenceDocs, copyDocs] = await Promise.all([
    db.collection('businessPartners').doc(operation.sourcePartnerId).get(), db.collection('businessPartners').doc(targetId).get(),
    operationRef.collection('references').get(), operationRef.collection('copies').get(),
  ])
  const reason = mergeReversalEligibility(operation, source.exists ? source.data() : null, target.exists ? target.data() : null, referenceDocs.size, copyDocs.size)
  if (reason) return reversalBlocked(reason)
  if (source.data().updatedAt?.toMillis?.() !== operation.mergedAt?.toMillis?.()) return reversalBlocked('Das archivierte Stammdatenblatt wurde seit der Zusammenführung verändert. Eine automatische Trennung wäre unsicher.')
  const references = referenceDocs.docs.map((doc) => doc.data())
  const copies = copyDocs.docs.map((doc) => doc.data())
  if (references.some((entry) => !entry.path || !entry.collection || !Array.isArray(entry.changes)) || copies.some((entry) => !entry.path || !entry.sourcePath || !entry.sourceBefore || !entry.after)) return reversalBlocked('Das Merge-Protokoll enthält unvollständige Dokumenteinträge. Eine automatische Trennung wäre unsicher.')
  const [referenceSnapshots, copySnapshots, sourceCopySnapshots] = await Promise.all([getSnapshots(db, references.map((entry) => entry.path)), getSnapshots(db, copies.map((entry) => entry.path)), getSnapshots(db, copies.map((entry) => entry.sourcePath))])
  const targetPlan = planMergeReversalFields(target.data(), operation.targetChanges, operation.movedNumbers)
  const sourceDebtors = partnerNumbers(operation.sourceBefore, 'debtorNumber', 'debtorNumbers')
  const sourceCreditors = partnerNumbers(operation.sourceBefore, 'creditorNumber', 'creditorNumbers')
  const remainingTarget = {
    debtorNumber: Object.hasOwn(targetPlan.patch, 'debtorNumber') ? targetPlan.patch.debtorNumber : target.data().debtorNumber,
    creditorNumber: Object.hasOwn(targetPlan.patch, 'creditorNumber') ? targetPlan.patch.creditorNumber : target.data().creditorNumber,
    dycosReferences: {
      debtorNumbers: targetPlan.patch['dycosReferences.debtorNumbers'] ?? target.data().dycosReferences?.debtorNumbers,
      creditorNumbers: targetPlan.patch['dycosReferences.creditorNumbers'] ?? target.data().dycosReferences?.creditorNumbers,
    },
  }
  if (sourceDebtors.some((number) => partnerNumbers(remainingTarget, 'debtorNumber', 'debtorNumbers').includes(number)) || sourceCreditors.some((number) => partnerNumbers(remainingTarget, 'creditorNumber', 'creditorNumbers').includes(number))) return reversalBlocked('Mindestens eine Nummer wäre nach der Trennung auf beiden Partnern vorhanden. Bitte manuell prüfen.')
  const allPartners = await db.collection('businessPartners').get()
  if (allPartners.docs.some((entry) => entry.id !== source.id && entry.id !== target.id && !entry.data().mergedIntoPartnerId && (sourceDebtors.some((number) => partnerNumbers(entry.data(), 'debtorNumber', 'debtorNumbers').includes(number)) || sourceCreditors.some((number) => partnerNumbers(entry.data(), 'creditorNumber', 'creditorNumbers').includes(number))))) return reversalBlocked('Eine zurückzugebende Nummer wurde inzwischen einem anderen Partner zugeordnet. Bitte manuell prüfen.')
  const warnings = [...targetPlan.warnings]
  const referencePlans = references.map((entry, index) => {
    const snapshot = referenceSnapshots[index]
    if (!snapshot.exists) { warnings.push(`${entry.collection}/${entry.documentId}: Verknüpfung nicht mehr vorhanden – manuelle Prüfung erforderlich.`); return { entry, snapshot, patch: {} } }
    const plan = planMergeReference(snapshot.data(), entry.changes)
    warnings.push(...plan.warnings.map((warning) => `${entry.collection}/${entry.documentId}: ${warning}`))
    return { entry, snapshot, patch: plan.patch }
  })
  const copyPlans = copies.map((entry, index) => {
    const snapshot = copySnapshots[index]
    const original = sourceCopySnapshots[index]
    const restoreSource = entry.sourcePath !== `insolvencies/${operation.sourcePartnerId}` && !original.exists
    const unchanged = planCopiedMergeRecord(snapshot.exists ? snapshot.data() : null, entry.after).archiveCopy
    if (!snapshot.exists) warnings.push(`${entry.collection}/${entry.documentId}: kopierter Datensatz nicht mehr vorhanden – manuelle Prüfung erforderlich.`)
    if (snapshot.exists && !unchanged) warnings.push(`${entry.collection}/${entry.documentId}: übernommener Datensatz wurde später verändert und bleibt am Zielpartner – manuelle Prüfung erforderlich.`)
    if (restoreSource) warnings.push(`${entry.collection}/${entry.documentId}: Quelldatensatz fehlt und wird aus dem Merge-Protokoll wiederhergestellt.`)
    else if (entry.sourcePath !== `insolvencies/${operation.sourcePartnerId}` && !isDeepStrictEqual(original.data(), entry.sourceBefore)) warnings.push(`${entry.collection}/${entry.documentId}: Quelldatensatz wurde nach der Zusammenführung verändert – manuelle Prüfung erforderlich.`)
    return { entry, snapshot, unchanged, restoreSource }
  })
  const sourceInsolvencyRef = operation.sourceInsolvencyBefore ? db.collection('insolvencies').doc(operation.sourcePartnerId) : null
  const sourceInsolvency = sourceInsolvencyRef ? await sourceInsolvencyRef.get() : null
  if (sourceInsolvency && (!sourceInsolvency.exists || sourceInsolvency.data().mergedIntoPartnerId !== targetId || sourceInsolvency.data().mergedAt?.toMillis?.() !== operation.mergedAt?.toMillis?.() || sourceInsolvency.data().updatedAt?.toMillis?.() !== operation.mergedAt?.toMillis?.())) return reversalBlocked('Der Insolvenzfall des Quellpartners wurde seitdem verändert und kann nicht sicher wiederhergestellt werden.')
  const versions = [operationSnapshot, source, target, ...referenceSnapshots, ...copySnapshots, ...sourceCopySnapshots, ...(sourceInsolvency ? [sourceInsolvency] : [])].map(snapshotVersion)
  const fingerprint = createHash('sha256').update(JSON.stringify({ mergeId, versions, warnings })).digest('hex')
  const returningReferences = referencePlans.filter(({ patch }) => Object.keys(patch).length).map(({ entry }) => entry)
  return { canSeparate: true, operationRef, operationSnapshot, operation, source, target, targetPlan, referencePlans, copyPlans, sourceInsolvency, fingerprint, summary: summarizeMergeReversal(operation, returningReferences, copyPlans.filter(({ unchanged }) => unchanged).map(({ entry }) => entry), warnings, targetPlan.patch) }
}

export async function previewPartnerMergeReversalHandler(request) {
  await access(request)
  const mergeId = text(request.data?.mergeId); const targetPartnerId = text(request.data?.targetPartnerId)
  if (!mergeId || !targetPartnerId) throw new HttpsError('invalid-argument', 'Zusammenführung und Zielpartner fehlen.')
  const preview = await loadMergeReversal(getFirestore(), mergeId, targetPartnerId)
  return preview.canSeparate ? { canSeparate: true, mergeId, fingerprint: preview.fingerprint, ...preview.summary } : preview
}

export async function performPartnerMergeReversal({ db, mergeId, targetPartnerId, fingerprint, actor }) {
  if (!mergeId || !targetPartnerId || !fingerprint) throw new HttpsError('invalid-argument', 'Bestätigte Zusammenführung oder Vorschau fehlt.')
  const preview = await loadMergeReversal(db, mergeId, targetPartnerId)
  if (!preview.canSeparate) throw new HttpsError('failed-precondition', preview.reason)
  if (preview.fingerprint !== fingerprint) throw new HttpsError('failed-precondition', 'Die Daten haben sich seit der Vorschau verändert. Bitte die Trennung erneut prüfen.')
  if (preview.operation.schemaVersion === 2) {
    const { operation, operationRef, operationSnapshot, source, target, targetPlan } = preview
    const splitAt = Timestamp.now()
    const sourceRestore = restoredMergeSource(operation.sourceBefore, source.data(), mergeId, splitAt)
    sourceRestore.status = operation.sourceBefore.status || 'active'
    sourceRestore.debtorNumber = operation.sourceOwnedNumbers.debtors[0] || ''
    sourceRestore.creditorNumber = operation.sourceOwnedNumbers.creditors[0] || ''
    sourceRestore.dycosReferences = { ...(sourceRestore.dycosReferences || {}), debtorNumbers: operation.sourceOwnedNumbers.debtors, creditorNumbers: operation.sourceOwnedNumbers.creditors }
    const batch = db.batch()
    batch.update(target.ref, updateValues({ ...targetPlan.patch, updatedAt: splitAt }), { lastUpdateTime: target.updateTime })
    batch.update(source.ref, updateValues(sourceRestore), { lastUpdateTime: source.updateTime })
    batch.update(operationRef, { status: 'separated', separatedAt: splitAt, separatedBy: actor, warnings: preview.summary.warnings, returnedReferences: 0 }, { lastUpdateTime: operationSnapshot.updateTime })
    batch.create(target.ref.collection('history').doc(), { category: 'merge', action: 'separated', mergeId, sourcePartnerId: source.id, targetPartnerId: target.id, actor, warnings: preview.summary.warnings, createdAt: splitAt, summary: `Zusammenführung mit ${operation.sourcePartnerName || source.id} getrennt` })
    batch.create(source.ref.collection('history').doc(), { category: 'merge', action: 'restored', mergeId, sourcePartnerId: source.id, targetPartnerId: target.id, actor, warnings: preview.summary.warnings, createdAt: splitAt, summary: 'Eigenständiges Stammdatenblatt nach Trennung wiederhergestellt' })
    try { await batch.commit() } catch (error) { if (error.code === 9 || error.code === 'FAILED_PRECONDITION') throw new HttpsError('failed-precondition', 'Daten wurden parallel geändert. Bitte die Vorschau neu laden.'); throw error }
    return { sourcePartnerId: source.id, targetPartnerId: target.id, warnings: preview.summary.warnings }
  }
  const { operation, operationRef, operationSnapshot, source, target, targetPlan, referencePlans, copyPlans, sourceInsolvency } = preview
  const splitAt = Timestamp.now()
  const batch = db.batch()
  const targetPatch = updateValues({ ...targetPlan.patch, updatedAt: splitAt })
  batch.update(target.ref, targetPatch, { lastUpdateTime: target.updateTime })
  const sourceRestore = restoredMergeSource(operation.sourceBefore, source.data(), mergeId, splitAt)
  batch.update(source.ref, updateValues(sourceRestore), { lastUpdateTime: source.updateTime })
  referencePlans.forEach(({ snapshot, patch }) => { if (snapshot.exists && Object.keys(patch).length) batch.update(snapshot.ref, { ...updateValues(patch), updatedAt: splitAt }, { lastUpdateTime: snapshot.updateTime }) })
  copyPlans.forEach(({ entry, snapshot, unchanged, restoreSource }) => {
    if (unchanged) batch.update(snapshot.ref, { splitArchivedAt: splitAt, splitFromMergeId: mergeId }, { lastUpdateTime: snapshot.updateTime })
    if (restoreSource) batch.create(db.doc(entry.sourcePath), entry.sourceBefore)
  })
  if (sourceInsolvency) {
    const restored = { ...operation.sourceInsolvencyBefore, updatedAt: splitAt }
    for (const key of Object.keys(sourceInsolvency.data())) if (!(key in restored)) restored[key] = FieldValue.delete()
    batch.update(sourceInsolvency.ref, restored, { lastUpdateTime: sourceInsolvency.updateTime })
  }
  batch.update(operationRef, { status: 'separated', separatedAt: splitAt, separatedBy: actor, warnings: preview.summary.warnings, returnedReferences: referencePlans.filter(({ patch }) => Object.keys(patch).length).length }, { lastUpdateTime: operationSnapshot.updateTime })
  batch.create(target.ref.collection('history').doc(), { category: 'merge', action: 'separated', mergeId, sourcePartnerId: source.id, targetPartnerId: target.id, actor, warnings: preview.summary.warnings, createdAt: splitAt, summary: `Zusammenführung mit ${operation.sourcePartnerName || source.id} getrennt` })
  batch.create(source.ref.collection('history').doc(), { category: 'merge', action: 'restored', mergeId, sourcePartnerId: source.id, targetPartnerId: target.id, actor, warnings: preview.summary.warnings, createdAt: splitAt, summary: `Eigenständiges Stammdatenblatt nach Trennung wiederhergestellt` })
  if (referencePlans.length + copyPlans.length * 2 + 7 > 450) throw new HttpsError('resource-exhausted', 'Zu viele Verknüpfungen für eine atomare Trennung.')
  try { await batch.commit() } catch (error) { if (error.code === 9 || error.code === 'FAILED_PRECONDITION') throw new HttpsError('failed-precondition', 'Daten wurden parallel geändert. Bitte die Vorschau neu laden.'); throw error }
  return { sourcePartnerId: source.id, targetPartnerId: target.id, warnings: preview.summary.warnings }
}

export async function separatePartnerMergeHandler(request) {
  const profile = await access(request)
  return performPartnerMergeReversal({ db: getFirestore(), mergeId: text(request.data?.mergeId), targetPartnerId: text(request.data?.targetPartnerId), fingerprint: text(request.data?.fingerprint), actor: { userId: request.auth.uid, name: actorName(profile) } })
}
