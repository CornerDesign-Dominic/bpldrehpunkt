import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { fetchDycosFlowPartner } from './dycosFlowClient.js'
import { mapDycosMasterData, resolveSource } from './dycosMasterData.js'
import { resolvePartner } from './dycosTransportOrders.js'
import { combineDycosPartnerSources, dycosPartnerAdditions, dycosPartnerReviewFingerprint, hasDycosMasterDataAccess } from './dycosPartnerData.js'
import { dycosPartnerRefreshTargets } from './shared/dycosPartnerRefresh.js'
import { dycosConflictRows, retainedDycosResolutions } from './shared/dycosPartnerConflicts.js'
import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './shared/businessPartnerHistory.js'

const identityError = () => new HttpsError('failed-precondition', 'Die Partnerzuordnung ist widersprüchlich oder mehrdeutig. Bitte die Stammdaten prüfen; es wurde nichts übernommen.')
const actorName = profile => [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Unbekannt'
function targetsFor(partner) {
  if (!partner || partner.mergedIntoPartnerId || partner.status === 'merged') throw identityError()
  const targets = dycosPartnerRefreshTargets(partner)
  if (!targets?.length) throw identityError()
  return targets
}
const signature = targets => JSON.stringify(targets)

async function claimRefresh(db, uid, data, token) {
  return db.runTransaction(async tx => {
    const receiptRef = db.doc(`dycosMasterDataRefreshRequests/${createHash('sha256').update(`${uid}|${data.requestId}`).digest('hex')}`)
    const quotaRef = db.doc(`dycosImportQuotas/${uid}`)
    const [receipt, partner, quota] = await Promise.all([tx.get(receiptRef), tx.get(db.doc(`businessPartners/${data.partnerId}`)), tx.get(quotaRef)])
    const targets = targetsFor(partner.data())
    if (receipt.exists) {
      if (receipt.get('partnerId') !== data.partnerId) throw identityError()
      return { result: receipt.get('result') }
    }
    const locks = await Promise.all(targets.map(account => tx.get(db.doc(`dycosMasterDataLocks/${account.typ}-${account.nummer}`))))
    const now = Date.now()
    if (locks.some(lock => lock.get('expiresAtMs') > now)) throw new HttpsError('aborted', 'Eine Kontonummer dieses Partners wird bereits verarbeitet. Bitte kurz warten.')
    const start = quota.exists && now - quota.get('windowStart') < 60_000 ? quota.get('windowStart') : now
    const count = start === quota.get('windowStart') ? Number(quota.get('count')) || 0 : 0
    if (count + targets.length > 10) throw new HttpsError('resource-exhausted', 'Zu viele Abrufe. Bitte eine Minute warten.')
    tx.set(quotaRef, { windowStart: start, count: count + targets.length })
    for (const lock of locks) tx.set(lock.ref, { token, expiresAtMs: now + 180_000 })
    return { receiptRef, locks: locks.map(lock => lock.ref), targets }
  })
}

async function saveRefresh(db, request, data, claim, incoming, token) {
  return db.runTransaction(async tx => {
    const ref = db.doc(`businessPartners/${data.partnerId}`)
    const [snapshot, profile, receipt, ...locks] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${request.auth.uid}`)), tx.get(claim.receiptRef), ...claim.locks.map(lock => tx.get(lock))])
    if (profile.get('active') !== true || !hasDycosMasterDataAccess(profile.data())) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
    if (receipt.exists) {
      if (receipt.get('partnerId') !== data.partnerId) throw identityError()
      return receipt.get('result')
    }
    if (locks.some(lock => lock.get('token') !== token || lock.get('expiresAtMs') <= Date.now())) throw new HttpsError('aborted', 'Die Aktualisierung ist abgelaufen. Bitte erneut versuchen.')
    const partner = snapshot.data()
    if (signature(targetsFor(partner)) !== signature(claim.targets)) throw identityError()
    const warnings = new Set()
    for (const source of incoming) {
      const number = await resolvePartner(tx, db, source.sourceKind === 'customer' ? 'debtor' : 'creditor', source.number)
      const identity = await resolveSource(tx, db, { entity: source.sourceKind, id: source.sourceId })
      const counterpart = await resolveSource(tx, db, source.counterpart)
      if (number?.id !== data.partnerId || [identity, counterpart].some(match => match && match.id !== data.partnerId)) throw identityError()
      if ((partner.dycosReferences?.accounts || []).some(account => account.entity === source.sourceKind && account.number === source.number && account.sourceId !== source.sourceId)) throw identityError()
      source.warningCodes.forEach(code => warnings.add(code))
      if (source.counterpart && !counterpart) warnings.add('PARTNER_COUNTERPART_NOT_MATCHED')
    }
    const combined = combineDycosPartnerSources(incoming)
    const additions = dycosPartnerAdditions(partner, combined.fields)
    const conflicts = [...combined.conflicts, ...additions.conflicts]
    const patch = mergePartnerHistoryPatch(partner, additions.patch)
    const now = FieldValue.serverTimestamp(), name = actorName(profile.data())
    const references = { ...(partner.dycosReferences || {}) }
    references.accounts = [...(references.accounts || []).filter(account => !incoming.some(source => source.sourceKind === account.entity && source.number === account.number)), ...incoming.map(source => ({ entity: source.sourceKind, number: source.number, sourceId: source.sourceId }))]
    const sourceReferences = [...new Map([...(partner.dycosImport?.sourceReferences || []), ...incoming.map(source => ({ entity: source.sourceKind, id: source.sourceId }))].map(value => [`${value.entity}:${value.id}`, value])).values()]
    const metadata = { ...(partner.dycosImport || {}), source: 'dycos-api', sourceReferences, lastSyncedAt: now, syncedByUserId: request.auth.uid, syncedByName: name, importRunId: data.requestId, conflicts, resolutions: retainedDycosResolutions(partner), conflictFingerprint: dycosPartnerReviewFingerprint(conflicts), addedFields: additions.changedFields, refreshedAccounts: claim.targets }
    const changes = businessPartnerHistoryChanges(partner, patch)
    const update = { dycosReferences: references, dycosImport: metadata }
    for (const key of Object.keys(additions.patch)) update[key] = patch[key]
    if (changes.length) Object.assign(update, { updatedAt: now, updatedByUserId: request.auth.uid, updatedByName: name })
    tx.update(ref, update)
    if (changes.length) tx.create(ref.collection('history').doc(), { category: 'masterData', action: 'updated', summary: 'Stammdaten gemeinsam aus DyCoS ergänzt', source: 'dycos-api', metadata: { changes, importRunId: data.requestId }, createdAt: now, createdByUserId: request.auth.uid, createdByName: name })
    const result = { status: changes.length ? 'updated' : 'unchanged', partnerId: data.partnerId, requestId: data.requestId, conflicts: dycosConflictRows({ ...patch, dycosImport: metadata }).length, warningCodes: [...warnings], refreshedAccounts: claim.targets }
    tx.create(claim.receiptRef, { partnerId: data.partnerId, result, createdAt: now })
    return result
  })
}

export async function refreshDycosMasterDataHandler(request, { db = getFirestore(), fetchPartner = fetchDycosFlowPartner, report = recordDiagnostic } = {}) {
  const profile = await requireActiveProfile(request)
  if (!hasDycosMasterDataAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
  const { partnerId, requestId } = request.data || {}
  if (typeof partnerId !== 'string' || !partnerId || partnerId.length > 200 || partnerId.includes('/') || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Ungültige Aktualisierungsanfrage.')
  const data = { partnerId, requestId }, token = randomUUID()
  const claim = await claimRefresh(db, request.auth.uid, data, token)
  if (claim.result) return claim.result
  let stage = 'refresh-fetch'
  try {
    // At most the primary customer and carrier account. Both reads must finish
    // successfully before any partner value or comparison is written.
    const responses = await Promise.allSettled(claim.targets.map(async account => mapDycosMasterData(await fetchPartner(account), account)))
    const failure = responses.find(response => response.status === 'rejected')
    if (failure) throw failure.reason
    stage = 'refresh-save'
    return await saveRefresh(db, request, data, claim, responses.map(response => response.value), token)
  } catch (error) {
    if (error?.code === 'partner_not_found') throw new HttpsError('not-found', 'Ein zugeordneter Stammdatensatz wurde in DyCoS nicht gefunden.', { sourceCode: 'PARTNER_NOT_FOUND' })
    try { await report({ module: 'dycos-master-data', stage, code: 'dycos_partner_refresh_failed', message: 'Die gemeinsame Stammdatenaktualisierung konnte nicht abgeschlossen werden.', actorId: request.auth.uid, actorName: actorName(profile), recordId: partnerId }, db) } catch { /* Preserve the original safe error. */ }
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', 'Die gemeinsame Stammdatenaktualisierung konnte nicht abgeschlossen werden. Bitte erneut versuchen.')
  } finally {
    try { await db.runTransaction(async tx => { const locks = await Promise.all(claim.locks.map(lock => tx.get(lock))); for (const lock of locks) if (lock.get('token') === token) tx.delete(lock.ref) }) } catch { /* Leases expire after interruption. */ }
  }
}
