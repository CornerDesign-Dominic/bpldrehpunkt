import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { mergeComparison } from '../src/lib/partnerMergeDecisions.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'
import { mergeFieldChanges } from './partnerMergeReversal.js'
import { mailboxOrderCustomerIdentity } from './shared/mailboxOrderCustomerIdentity.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const account = (number, sourceId) => ({ entity: 'customer', number, sourceId })
const actor = { userId: 'account-test', name: 'Account-Test' }

for (const legacy of [false, true]) test(`emulator: ${legacy ? 'historical v1' : 'current v2'} split preserves source IDs learned after merge`, { skip: !enabled }, async () => {
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-drehpunkt'}-accountmerge`
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(); const app = initializeApp({ projectId }, `account-merge-${suffix}`); const db = getFirestore(app)
  const targetRef = db.doc(`businessPartners/root-${suffix}`); const sourceRef = db.doc(`businessPartners/source-${suffix}`)
  const targetBefore = { id: targetRef.id, companyName: 'Root', status: 'active', debtorNumber: '10042', creditorNumber: '', dycosReferences: { debtorNumbers: ['10042'], accounts: [account('10042', '33')] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: '33' }], lastSyncedAt: 'root-confirmed' } }
  const sourceBefore = { id: sourceRef.id, companyName: 'Source', status: 'active', debtorNumber: '10043', creditorNumber: '', dycosReferences: { debtorNumbers: ['10043'] } }
  try {
    await targetRef.set(targetBefore); await sourceRef.set(sourceBefore)
    let mergeId
    if (legacy) {
      mergeId = `legacy-${suffix}`; const mergedAt = Timestamp.now()
      const patch = { latestMergeId: mergeId, dycosReferences: { debtorNumbers: ['10042', '10043'], accounts: [account('10042', '33')] } }
      await targetRef.update(patch)
      await sourceRef.update({ status: 'merged', mergedIntoPartnerId: targetRef.id, mergedByMergeId: mergeId, updatedAt: mergedAt })
      await db.doc(`partnerMergeOperations/${mergeId}`).set({ schemaVersion: 1, mergeId, sourcePartnerId: sourceRef.id, targetPartnerId: targetRef.id, sourceBefore, sourcePartnerName: 'Source', targetPartnerName: 'Root', targetChanges: mergeFieldChanges(targetBefore, patch), movedNumbers: { debtors: ['10043'], creditors: [] }, referenceCount: 0, copyCount: 0, status: 'merged', mergedAt })
    } else {
      const [target, source] = await Promise.all([targetRef.get(), sourceRef.get()])
      const comparison = mergeComparison({ partners: [{ id: target.id, ...target.data() }, { id: source.id, ...source.data() }] }, target.id)
      const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, value]) => [key, value.resolution ? value : { ...value, resolution: 'target' }]))
      const merged = await performPartnerMerge({ db, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: target.updateTime.toMillis(), [source.id]: source.updateTime.toMillis() }, decisions, actor })
      mergeId = merged.mergeId
    }
    await targetRef.update({ 'dycosReferences.accounts': [account('10042', '33'), account('10043', '44')], 'dycosImport.sourceReferences': [{ entity: 'customer', id: '33' }, { entity: 'customer', id: '44' }], 'dycosImport.lastSyncedAt': 'later-confirmed' })
    const preview = await loadMergeReversal(db, mergeId, targetRef.id)
    assert.equal(preview.canSeparate, true, preview.reason)
    await performPartnerMergeReversal({ db, mergeId, targetPartnerId: targetRef.id, fingerprint: preview.fingerprint, actor })
    const root = (await targetRef.get()).data(); const restored = (await sourceRef.get()).data()
    assert.equal(mailboxOrderCustomerIdentity(root, '10042').sourceId, '33')
    assert.equal(mailboxOrderCustomerIdentity(root, '10043'), null)
    assert.equal(mailboxOrderCustomerIdentity(restored, '10043').sourceId, '44')
    assert.deepEqual(root.dycosImport.sourceReferences, [{ entity: 'customer', id: '33' }])
    assert.equal(root.dycosImport.lastSyncedAt, 'later-confirmed')
    assert.equal(restored.dycosImport.lastSyncedAt, undefined)
  } finally { await db.terminate(); await deleteApp(app) }
})
