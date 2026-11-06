import { createHash } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { requireContractEdit } from './contracts.js'
import { recordDiagnostic } from './diagnostics.js'

const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const invalid = () => { throw new HttpsError('invalid-argument', 'Bitte einen gültigen Namen und Status für die Kostenposition angeben.') }
const hash = (value) => createHash('sha256').update(value).digest('hex')
const normalizedName = (name) => name.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim()

export function normalizeContractCostCategoryInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !['recordId', 'mutationId', 'expectedRevision', 'values'].includes(key))) invalid()
  if (!validId(data.recordId) || !validId(data.mutationId) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) invalid()
  const values = data.values
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some((key) => !['name', 'active'].includes(key))) invalid()
  if (typeof values.name !== 'string' || values.name.length > 240 || !values.name.trim() || [...values.name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || typeof values.active !== 'boolean') invalid()
  return { recordId: data.recordId, mutationId: data.mutationId, expectedRevision: data.expectedRevision, values: { name: values.name.trim(), active: values.active } }
}

export async function persistContractCostCategory(db, input, actor) {
  const categoryRef = db.doc(`contractCostCategories/${input.recordId}`)
  const receiptRef = categoryRef.collection('mutations').doc(input.mutationId)
  const digest = hash(JSON.stringify({ uid: actor.uid, ...input }))
  return db.runTransaction(async (transaction) => {
    const [current, receipt, user] = await Promise.all([transaction.get(categoryRef), transaction.get(receiptRef), transaction.get(db.doc(`users/${actor.uid}`))])
    const profile = user.exists ? user.data() : null
    requireContractEdit(profile)
    if (receipt.exists) {
      if (receipt.data().fingerprint !== digest) throw new HttpsError('already-exists', 'Diese Anfrage-ID wurde bereits für eine andere Änderung verwendet.')
      return receipt.data().result
    }
    const previous = current.exists ? current.data() : null
    if ((previous?.revision ?? 0) !== input.expectedRevision) throw new HttpsError('aborted', 'Die Kostenposition wurde inzwischen geändert. Bitte neu laden und die Änderungen abgleichen.')
    const nameKey = hash(normalizedName(input.values.name))
    const nameRef = db.doc(`contractCostCategoryNames/${nameKey}`)
    const previousNameKey = previous?.nameKey
    const previousNameRef = previousNameKey && previousNameKey !== nameKey ? db.doc(`contractCostCategoryNames/${previousNameKey}`) : null
    const [nameOwner, previousNameOwner] = await Promise.all([transaction.get(nameRef), previousNameRef ? transaction.get(previousNameRef) : Promise.resolve(null)])
    if (nameOwner.exists && nameOwner.data().categoryId !== input.recordId) throw new HttpsError('already-exists', 'Eine Kostenposition mit diesem Namen existiert bereits. Bitte die vorhandene Position verwenden oder reaktivieren.')
    const now = FieldValue.serverTimestamp()
    const revision = input.expectedRevision + 1
    const updatedByName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || actor.uid
    transaction.set(categoryRef, { ...input.values, nameKey, revision, createdAt: previous?.createdAt ?? now, createdBy: previous?.createdBy ?? actor.uid, updatedAt: now, updatedBy: actor.uid, updatedByName })
    // Inactive names remain reserved; renaming frees only this category's old key.
    transaction.set(nameRef, { categoryId: input.recordId })
    if (previousNameRef && previousNameOwner?.exists && previousNameOwner.data().categoryId === input.recordId) transaction.delete(previousNameRef)
    const result = { id: input.recordId, revision }
    transaction.create(categoryRef.collection('history').doc(input.mutationId), { action: previous ? 'category.update' : 'category.create', targetLabel: input.values.name, active: input.values.active, revision, createdAt: now, createdBy: actor.uid, createdByName: updatedByName })
    transaction.create(receiptRef, { fingerprint: digest, result, createdBy: actor.uid, createdAt: now })
    return result
  })
}

export async function saveContractCostCategoryHandler(request) {
  const profile = await requireActiveProfile(request)
  requireContractEdit(profile)
  const input = normalizeContractCostCategoryInput(request.data)
  try {
    return await persistContractCostCategory(getFirestore(), input, { uid: request.auth.uid })
  } catch (error) {
    if (!['invalid-argument', 'permission-denied', 'aborted', 'already-exists'].includes(error?.code)) {
      await recordDiagnostic({ module: 'contracts', stage: 'save', code: 'internal', actorId: request.auth.uid, recordId: input.recordId, message: 'Eine Vertragskostenposition konnte nicht gespeichert werden.' })
      throw new HttpsError('internal', 'Die Kostenposition konnte nicht gespeichert werden. Bitte erneut versuchen.')
    }
    throw error
  }
}
