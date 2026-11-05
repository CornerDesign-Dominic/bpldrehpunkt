import { createHash } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'

const MAX_PDF_SIZE = 20 * 1024 * 1024
const actions = ['details', 'position.save', 'position.delete', 'deadline.save', 'deadline.delete', 'note.add', 'document.reserve', 'document.finalize', 'document.update', 'document.delete']
const collections = { position: 'positions', deadline: 'deadlines', note: 'notes', document: 'documents' }
const invalid = (message = 'Ungültige Vertragsdaten.') => { throw new HttpsError('invalid-argument', message) }
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const conflict = () => { throw new HttpsError('aborted', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden und die Änderungen abgleichen.') }

function text(value, limit, required = false, multiline = false) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > limit || [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code === 127 || (code < 32 && (!multiline || ![9, 10, 13].includes(code)))
  })) invalid()
  const clean = value.trim()
  if (required && !clean) invalid('Bitte alle Pflichtfelder ausfüllen.')
  return clean
}
function exactValues(values, fields) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some((key) => !fields.includes(key))) invalid()
}
function enumeration(value, choices) {
  if (!choices.includes(value)) invalid()
  return value
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid('Bitte ein gültiges Datum angeben.')
  return value
}

export function normalizeContractMutation(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !['contractId', 'mutationId', 'action', 'recordId', 'expectedRevision', 'values'].includes(key))) invalid()
  const { contractId, mutationId, action } = data
  if (!id(contractId) || !id(mutationId) || !actions.includes(action)) invalid()
  const recordId = action === 'details' ? contractId : data.recordId ?? mutationId
  if (!id(recordId) || (action === 'details' && data.recordId != null && data.recordId !== contractId)) invalid()
  const expectedRevision = data.expectedRevision ?? 0
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid()
  const values = data.values ?? {}
  let clean
  if (action === 'details') {
    exactValues(values, ['partnerName', 'contractNumber', 'customerNumber', 'description'])
    clean = { partnerName: text(values.partnerName, 240, true), contractNumber: text(values.contractNumber, 120), customerNumber: text(values.customerNumber, 120), description: text(values.description, 4000, false, true) }
  } else if (action === 'position.save') {
    exactValues(values, ['title', 'grossAmountCents', 'billingCycle', 'anchorDate', 'note'])
    if (!Number.isSafeInteger(values.grossAmountCents) || values.grossAmountCents < 0 || values.grossAmountCents > 1e11) invalid('Bitte einen gültigen Bruttobetrag angeben.')
    clean = { title: text(values.title, 240, true), grossAmountCents: values.grossAmountCents, billingCycle: enumeration(values.billingCycle, ['monthly', 'quarterly', 'half-yearly', 'yearly', 'once']), anchorDate: calendarDate(values.anchorDate), note: text(values.note, 2000, false, true) }
  } else if (action === 'deadline.save') {
    exactValues(values, ['title', 'type', 'date', 'time', 'note', 'completed'])
    const time = text(values.time, 5)
    if ((time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || (values.completed !== undefined && typeof values.completed !== 'boolean')) invalid('Bitte eine gültige Uhrzeit angeben.')
    clean = { title: text(values.title, 240, true), type: enumeration(values.type, ['deadline', 'appointment', 'cancellation', 'renewal', 'contract-end']), date: calendarDate(values.date), time, note: text(values.note, 4000, false, true), completed: values.completed ?? false }
  } else if (action === 'note.add') {
    exactValues(values, ['text'])
    if (expectedRevision !== 0) invalid()
    clean = { text: text(values.text, 4000, true, true) }
  } else if (action === 'document.reserve') {
    exactValues(values, ['title', 'description', 'fileName', 'fileSize', 'contentType', 'pageCount'])
    if (expectedRevision !== 0 || !Number.isSafeInteger(values.fileSize) || values.fileSize < 1 || values.fileSize > MAX_PDF_SIZE || values.contentType !== 'application/pdf' || (values.pageCount != null && (!Number.isSafeInteger(values.pageCount) || values.pageCount < 1 || values.pageCount > 1e6))) invalid('Bitte eine PDF-Datei bis 20 MiB auswählen.')
    const fileName = text(values.fileName, 240, true)
    if (/[\\/]/.test(fileName)) invalid('Ungültiger Dateiname.')
    clean = { title: text(values.title, 240, true), description: text(values.description, 4000, false, true), fileName, fileSize: values.fileSize, contentType: values.contentType, pageCount: values.pageCount ?? null }
  } else if (action === 'document.update') {
    exactValues(values, ['title', 'description'])
    clean = { title: text(values.title, 240, true), description: text(values.description, 4000, false, true) }
  } else {
    exactValues(values, [])
    if (!data.recordId) invalid('Die Eintrags-ID fehlt.')
    clean = {}
  }
  return { contractId, mutationId, action, recordId, expectedRevision, values: clean }
}

export function requireContractEdit(profile) {
  if (profile?.active !== true || (profile.role !== 'superadmin' && profile.permissions?.contracts !== 'edit')) throw new HttpsError('permission-denied', 'Keine Bearbeitungsberechtigung für Verträge.')
}
const fingerprint = (input, uid) => createHash('sha256').update(JSON.stringify({ uid, ...input })).digest('hex')
const actorName = (profile, uid) => text([profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || uid, 320)
const storagePath = (input) => `contracts/${input.contractId}/documents/${input.recordId}.pdf`

function verifyReceipt(receipt, digest) {
  if (receipt.exists && receipt.data().fingerprint !== digest) throw new HttpsError('already-exists', 'Diese Anfrage-ID wurde bereits für eine andere Änderung verwendet.')
  return receipt.exists ? receipt.data() : null
}
function audit(transaction, parentRef, parent, input, actor, profile, target, revision, result, receiptRef, digest) {
  const now = FieldValue.serverTimestamp()
  const parentRevision = (parent.revision ?? 0) + 1
  const updatedByName = actorName(profile, actor.uid)
  transaction.update(parentRef, { revision: parentRevision, updatedAt: now, updatedBy: actor.uid, updatedByName })
  transaction.create(parentRef.collection('history').doc(input.mutationId), { action: input.action, recordId: input.recordId, targetLabel: target || 'Vertrag', revision, parentRevision, createdAt: now, createdBy: actor.uid, createdByName: updatedByName })
  const response = { id: input.recordId, revision, parentRevision, ...result }
  transaction.set(receiptRef, { fingerprint: digest, status: 'complete', result: response, createdBy: actor.uid, completedAt: now })
  return response
}

// Every authorization/revision check is repeated within the same transaction as
// its write; the handler's initial access check is not the concurrency boundary.
export async function persistContractMutation(db, input, actor, bucket) {
  if (['document.finalize', 'document.delete'].includes(input.action)) return persistDocumentTransition(db, input, actor, bucket)
  const parentRef = db.doc(`contracts/${input.contractId}`)
  const receiptRef = parentRef.collection('mutations').doc(input.mutationId)
  const childRef = input.action === 'details' ? null : parentRef.collection(collections[input.action.split('.')[0]]).doc(input.recordId)
  const digest = fingerprint(input, actor.uid)
  return db.runTransaction(async (transaction) => {
    const [parentSnapshot, profileSnapshot, receiptSnapshot, childSnapshot] = await Promise.all([
      transaction.get(parentRef), transaction.get(db.doc(`users/${actor.uid}`)), transaction.get(receiptRef), childRef ? transaction.get(childRef) : Promise.resolve(null),
    ])
    const profile = profileSnapshot.exists ? profileSnapshot.data() : null
    requireContractEdit(profile)
    if (!parentSnapshot.exists) throw new HttpsError('not-found', 'Der Vertrag existiert nicht mehr.')
    const receipt = verifyReceipt(receiptSnapshot, digest)
    if (receipt?.status === 'complete') return receipt.result
    const parent = parentSnapshot.data()
    const previous = childSnapshot?.exists ? childSnapshot.data() : null
    const current = childRef ? previous : parent
    if ((current?.revision ?? 0) !== input.expectedRevision) conflict()
    if (input.action.endsWith('.delete') && !previous) throw new HttpsError('not-found', 'Der Eintrag existiert nicht mehr.')
    if (['note.add', 'document.reserve'].includes(input.action) && previous) throw new HttpsError('already-exists', 'Der Eintrag existiert bereits.')
    if (input.action === 'document.update' && (!previous || previous.status !== 'ready')) throw new HttpsError('failed-precondition', 'Nur vollständig hochgeladene Dokumente können bearbeitet werden.')
    const revision = input.expectedRevision + 1
    const now = FieldValue.serverTimestamp()
    if (input.action === 'details') transaction.update(parentRef, { ...input.values })
    else if (input.action.endsWith('.delete')) transaction.delete(childRef)
    else {
      const record = { ...input.values, revision, updatedAt: now, updatedBy: actor.uid, updatedByName: actorName(profile, actor.uid) }
      if (!previous) Object.assign(record, { createdAt: now, createdBy: actor.uid, createdByName: actorName(profile, actor.uid) })
      if (input.action === 'document.reserve') Object.assign(record, { storagePath: storagePath(input), status: 'pending' })
      transaction.set(childRef, record, { merge: Boolean(previous) })
    }
    const target = input.action === 'note.add' ? 'Notiz' : input.values.title || previous?.title || input.values.partnerName || parent.partnerName
    return audit(transaction, parentRef, parent, input, actor, profile, target, revision, input.action === 'document.reserve' ? { storagePath: storagePath(input), status: 'pending' } : {}, receiptRef, digest)
  })
}

// Reserve -> immutable upload -> finalizing -> ready. Deletion takes the
// corresponding deleting lock before touching Storage. A lost response resumes
// with the same mutation ID instead of repeating history or deleting a new blob.
async function persistDocumentTransition(db, input, actor, bucket) {
  const parentRef = db.doc(`contracts/${input.contractId}`)
  const childRef = parentRef.collection('documents').doc(input.recordId)
  const receiptRef = parentRef.collection('mutations').doc(input.mutationId)
  const digest = fingerprint(input, actor.uid)
  const deleting = input.action === 'document.delete'
  const status = deleting ? 'deleting' : 'finalizing'
  const locked = await db.runTransaction(async (transaction) => {
    const [parent, child, receiptSnapshot, profileSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(childRef), transaction.get(receiptRef), transaction.get(db.doc(`users/${actor.uid}`))])
    requireContractEdit(profileSnapshot.exists ? profileSnapshot.data() : null)
    if (!parent.exists) throw new HttpsError('not-found', 'Der Vertrag existiert nicht mehr.')
    const receipt = verifyReceipt(receiptSnapshot, digest)
    if (receipt?.status === 'complete') return { replay: receipt.result }
    if (!child.exists) throw new HttpsError('not-found', 'Das Dokument existiert nicht mehr.')
    const previous = child.data()
    if (previous.revision !== input.expectedRevision) conflict()
    const ownLock = previous.status === status && previous.operationMutationId === input.mutationId && previous.operationActorId === actor.uid
    if (!ownLock && !(deleting ? ['pending', 'ready'].includes(previous.status) : previous.status === 'pending')) throw new HttpsError('failed-precondition', 'Das Dokument wird bereits verarbeitet. Bitte den offenen Vorgang erneut versuchen.')
    transaction.update(childRef, { status, operationMutationId: input.mutationId, operationActorId: actor.uid })
    transaction.set(receiptRef, { fingerprint: digest, status: 'processing', createdBy: actor.uid, startedAt: FieldValue.serverTimestamp() })
    return { previous }
  })
  if (locked.replay) return locked.replay
  const file = bucket.file(storagePath(input))
  let metadata
  try {
    try { [metadata] = await file.getMetadata() } catch (error) { if (Number(error.code) !== 404) throw error }
    if (deleting) {
      if (metadata) {
        try { await file.delete({ ifGenerationMatch: metadata.generation }) } catch (error) { if (Number(error.code) !== 404) throw error }
      }
    } else {
      if (!metadata) throw new HttpsError('failed-precondition', 'Die PDF-Datei wurde noch nicht vollständig hochgeladen.', { reason: 'upload-missing' })
      if (Number(metadata.size) !== locked.previous.fileSize || metadata.contentType !== 'application/pdf' || Number(metadata.size) < 1 || Number(metadata.size) > MAX_PDF_SIZE || metadata.metadata?.contractId !== input.contractId || metadata.metadata?.documentId !== input.recordId) throw new HttpsError('failed-precondition', 'Die hochgeladene Datei stimmt nicht mit der Reservierung überein.', { reason: 'upload-mismatch' })
    }
  } catch (error) {
    if (!deleting) await db.runTransaction(async (transaction) => {
      const child = await transaction.get(childRef)
      if (child.exists && child.data().status === status && child.data().operationMutationId === input.mutationId) transaction.update(childRef, { status: 'pending', operationMutationId: FieldValue.delete(), operationActorId: FieldValue.delete() })
    }).catch(() => undefined) // Best effort unlock never replaces the upload error.
    throw error
  }
  return db.runTransaction(async (transaction) => {
    const [parent, child, receiptSnapshot, profileSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(childRef), transaction.get(receiptRef), transaction.get(db.doc(`users/${actor.uid}`))])
    const profile = profileSnapshot.exists ? profileSnapshot.data() : null
    requireContractEdit(profile)
    const receipt = verifyReceipt(receiptSnapshot, digest)
    if (receipt?.status === 'complete') return receipt.result
    if (!parent.exists || !child.exists) throw new HttpsError('not-found', 'Vertrag oder Dokument existiert nicht mehr.')
    const previous = child.data()
    if (previous.revision !== input.expectedRevision || previous.status !== status || previous.operationMutationId !== input.mutationId) conflict()
    const revision = previous.revision + 1
    if (deleting) transaction.delete(childRef)
    else transaction.update(childRef, { status: 'ready', revision, storageGeneration: String(metadata.generation), operationMutationId: FieldValue.delete(), operationActorId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, updatedByName: actorName(profile, actor.uid) })
    return audit(transaction, parentRef, parent.data(), input, actor, profile, previous.title, revision, { status: deleting ? 'deleted' : 'ready' }, receiptRef, digest)
  })
}

export async function mutateContractHandler(request) {
  const profile = await requireActiveProfile(request)
  requireContractEdit(profile)
  const input = normalizeContractMutation(request.data)
  try {
    return await persistContractMutation(getFirestore(), input, { uid: request.auth.uid }, getStorage().bucket())
  } catch (error) {
    if (!['invalid-argument', 'permission-denied', 'not-found', 'aborted', 'already-exists', 'failed-precondition'].includes(error?.code)) {
      await recordDiagnostic({ module: 'contracts', stage: 'save', code: 'internal', actorId: request.auth.uid, actorName: actorName(profile, request.auth.uid), recordId: input.contractId, message: 'Eine Vertragsänderung konnte nicht gespeichert werden.' })
      throw new HttpsError('internal', 'Die Vertragsänderung konnte nicht gespeichert werden. Bitte erneut versuchen.')
    }
    throw error
  }
}
