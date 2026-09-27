import assert from 'node:assert/strict'
import { readFile, lstat } from 'node:fs/promises'
import test from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { TRANSPORT_RATING_CRITERIA, validateTransportRating } from '../shared/transportOrderRatings.js'
import { TRANSPORT_RATING_CRITERIA as deployedCriteria, validateTransportRating as deployedValidation } from './shared/transportOrderRatings.js'

if (!getApps().length) initializeApp({ projectId: 'rating-tests' })
const { listPartnerRatingRows, ratingDocumentId, summarizeCrmRatingRows, upsertTransportOrderRating } = await import('./transportOrderRatings.js')
function validationError(validate, role, scores, comment) {
  try { validate(role, scores, comment); return null } catch (error) { return error.message }
}

test('client and packaged Functions share byte-identical rating rules', async () => {
  const [source, deployed, clientImport, functionImport, index, targetInfo] = await Promise.all([
    readFile(new URL('../shared/transportOrderRatings.js', import.meta.url)),
    readFile(new URL('./shared/transportOrderRatings.js', import.meta.url)),
    readFile(new URL('../src/components/transport-orders/TransportOrderRatingModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./transportOrderRatings.js', import.meta.url), 'utf8'),
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    lstat(new URL('./shared/', import.meta.url)),
  ])
  assert.equal(targetInfo.isSymbolicLink(), false)
  assert.ok(source.equals(deployed))
  assert.match(clientImport, /shared\/transportOrderRatings\.js/)
  assert.match(functionImport, /\.\/shared\/transportOrderRatings\.js/)
  assert.match(index, /export const getOwnTransportOrderRatings = onCall/)
  assert.match(index, /export const saveTransportOrderRating = onCall/)
  assert.match(index, /export const listPartnerTransportOrderRatings = onCall/)
  assert.match(index, /export const listCrmTransportRatingSummaries = onCall/)
  assert.match(functionImport, /permissions\?\.crm/)
  assert.deepEqual(TRANSPORT_RATING_CRITERIA, deployedCriteria)
  for (const [role, scores, comment] of [
    ['customer', { compensation: 1, cooperation: 5 }, 'a'.repeat(250)],
    ['carrier', { punctuality: 5, communication: 4, execution: null }, ''],
  ]) assert.deepEqual(validateTransportRating(role, scores, comment), deployedValidation(role, scores, comment))
  for (const scores of [{}, { compensation: 0 }, { compensation: 4.5 }]) {
    assert.equal(validationError(validateTransportRating, 'customer', scores), validationError(deployedValidation, 'customer', scores))
  }
  assert.equal(validationError(validateTransportRating, 'customer', { compensation: 3 }, 'x'.repeat(251)), validationError(deployedValidation, 'customer', { compensation: 3 }, 'x'.repeat(251)))
})

test('CRM summary separates customer and carrier ratings and follows merged partners', () => {
  const partners = [{ id: 'root' }, { id: 'old', mergedIntoPartnerId: 'root' }, { id: 'other' }]
  const ratings = [
    { partnerId: 'root', partnerRole: 'customer', averageScore: 5 },
    { partnerId: 'old', partnerRole: 'customer', averageScore: 3 },
    { partnerId: 'old', partnerRole: 'carrier', averageScore: 2 },
    { partnerId: 'other', partnerRole: 'carrier', averageScore: 4 },
    { partnerId: 'root', partnerRole: 'customer', averageScore: null },
    { partnerId: 'missing', partnerRole: 'customer', averageScore: 5 },
  ]
  assert.deepEqual(summarizeCrmRatingRows(partners, ratings), {
    root: { customer: { averageScore: 4, count: 2 }, carrier: { averageScore: 2, count: 1 } },
    other: { carrier: { averageScore: 4, count: 1 } },
  })
})

test('CRM reads ratings for the active partner and merged member by canonical ID', async () => {
  const rows = {
    current: [{ id: 'new', data: () => ({ partnerRole: 'carrier', partnerId: 'current', transportOrderId: 'ta-2', transportOrderNumber: '2', averageScore: 4, scores: { price: 4 }, comment: '', createdAt: { toMillis: () => 200 } }) }],
    old: [{ id: 'old', data: () => ({ partnerRole: 'customer', partnerId: 'old', transportOrderId: 'ta-1', transportOrderNumber: '1', averageScore: 5, scores: { compensation: 5 }, comment: 'Gut', createdAt: { toMillis: () => 100 }, ratedByUserId: 'private-user' }) }],
  }
  const store = {
    doc: (path) => ({ get: async () => ({ exists: path === 'businessPartners/current' || path === 'businessPartners/old', data: () => path.endsWith('/old') ? { mergedIntoPartnerId: 'current' } : { companyName: 'Partner' } }) }),
    collection: (name) => ({ where: (field, operator, value) => ({ get: async () => ({ docs: name === 'businessPartners' ? [{ id: 'old' }] : rows[value] || [] }) }) }),
  }
  const ratings = await listPartnerRatingRows(store, 'old')
  assert.deepEqual(ratings.map(({ id, partnerRole }) => [id, partnerRole]), [['new', 'carrier'], ['old', 'customer']])
  assert.equal(ratings[1].comment, 'Gut')
  assert.equal(Object.hasOwn(ratings[1], 'ratedByUserId'), false)
})

test('average includes exactly the selected criteria', () => {
  assert.equal(validateTransportRating('carrier', { punctuality: 5, communication: 4, execution: 5, price: 3 }).averageScore, 4.25)
  assert.deepEqual(validateTransportRating('carrier', { punctuality: 5, communication: 4, execution: null, price: undefined }), { scores: { punctuality: 5, communication: 4 }, averageScore: 4.5, comment: '' })
  assert.throws(() => validateTransportRating('customer', {}), /mindestens/)
})

test('only whole scores from 1 to 5 are accepted', () => {
  for (const score of [1, 5]) assert.equal(validateTransportRating('customer', { compensation: score }).averageScore, score)
  for (const score of [0, 6, 4.5, '4']) assert.throws(() => validateTransportRating('customer', { compensation: score }), /ganze Zahlen/)
  assert.throws(() => validateTransportRating('customer', { price: 4 }), /kriterium/)
})

test('comment limit is 250 characters', () => {
  assert.equal(validateTransportRating('customer', { cooperation: 3 }, 'a'.repeat(250)).comment.length, 250)
  assert.throws(() => validateTransportRating('customer', { cooperation: 3 }, 'a'.repeat(251)), /250/)
})

test('identity creates one document and preserves createdAt when edited', async () => {
  assert.equal(ratingDocumentId('ta', 'partner', 'carrier', 'user-a'), 'cc617c42147742f71687b9ec5dcb5ebf851ef0484ad29ed61e1d4986568372b1')
  const documents = new Map()
  const store = {
    doc: (path) => path,
    runTransaction: async (callback) => callback({
      get: async (path) => ({ exists: documents.has(path), data: () => documents.get(path) }),
      set: (path, data) => documents.set(path, data),
    }),
  }
  const identity = { transportOrderId: 'ta', partnerId: 'partner', partnerRole: 'carrier', ratedByUserId: 'user-a' }
  await upsertTransportOrderRating(store, identity, { scores: { price: 3 }, averageScore: 3 })
  const createdAt = [...documents.values()][0].createdAt
  await upsertTransportOrderRating(store, identity, { scores: { price: 5 }, averageScore: 5 })
  assert.equal(documents.size, 1)
  assert.equal([...documents.values()][0].createdAt, createdAt)
  assert.equal([...documents.values()][0].averageScore, 5)
  await upsertTransportOrderRating(store, { ...identity, ratedByUserId: 'user-b' }, { scores: { price: 4 }, averageScore: 4 })
  await upsertTransportOrderRating(store, { ...identity, partnerRole: 'customer' }, { scores: { cooperation: 4 }, averageScore: 4 })
  assert.equal(documents.size, 3)
  assert.notEqual(ratingDocumentId('ta', 'partner', 'carrier', 'user-a'), ratingDocumentId('ta', 'partner', 'carrier', 'user-b'))
})
