import { isDeepStrictEqual } from 'node:util'

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key)
const parts = (path) => path.split('.')
const read = (object, path) => parts(path).reduce((value, part) => value?.[part], object)
const exists = (object, path) => {
  let value = object
  for (const part of parts(path)) {
    if (!own(value, part)) return false
    value = value[part]
  }
  return true
}
const plain = (value) => value && Object.getPrototypeOf(value) === Object.prototype

export function flattenMergePatch(patch, prefix = '') {
  return Object.entries(patch || {}).flatMap(([key, value]) => {
    if (key === 'updatedAt' && !prefix) return []
    const path = prefix ? `${prefix}.${key}` : key
    return plain(value) ? flattenMergePatch(value, path) : [[path, value]]
  })
}

export function mergeFieldChanges(before, patch) {
  return flattenMergePatch(patch).filter(([path, value]) => !isDeepStrictEqual(read(before, path), value)).map(([path, after]) => ({ path, beforeExists: exists(before, path), before: read(before, path) ?? null, after }))
}

export function mergedNumbersForReversal(target, source) {
  const numbers = (partner, field, list) => [...new Set([partner?.[field], ...(partner?.dycosReferences?.[list] || [])].map((value) => String(value ?? '').trim()).filter(Boolean))]
  return {
    debtors: numbers(source, 'debtorNumber', 'debtorNumbers').filter((number) => !numbers(target, 'debtorNumber', 'debtorNumbers').includes(number)),
    creditors: numbers(source, 'creditorNumber', 'creditorNumbers').filter((number) => !numbers(target, 'creditorNumber', 'creditorNumbers').includes(number)),
  }
}

export function planMergeReversalFields(current, changes, movedNumbers = { debtors: [], creditors: [] }) {
  const patch = {}
  const warnings = []
  for (const change of changes) {
    const value = read(current, change.path)
    if (['dycosReferences.debtorNumbers', 'dycosReferences.creditorNumbers'].includes(change.path)) {
      const moved = change.path.endsWith('debtorNumbers') ? movedNumbers.debtors : movedNumbers.creditors
      const currentNumbers = Array.isArray(value) ? value : []
      patch[change.path] = currentNumbers.filter((number) => !moved.includes(String(number).trim()))
      continue
    }
    if (!isDeepStrictEqual(value, change.after)) {
      warnings.push(`${change.path}: seit der Zusammenführung verändert – manuelle Prüfung erforderlich.`)
      continue
    }
    patch[change.path] = change.beforeExists ? change.before : undefined
  }
  return { patch, warnings }
}

export function planMergeReference(current, changes) {
  const labels = { 'imported.customer.partnerId': 'imported.customer.partnerName', 'imported.carrier.partnerId': 'imported.carrier.partnerName', customerId: 'customerName', carrierId: 'carrierName', claimantPartnerId: 'claimant', contractorPartnerId: 'contractor', debtorPartnerId: 'debtorName' }
  const changedIdentities = changes.filter((change) => (change.path.endsWith('Id') || change.path.endsWith('.partnerId')) && !isDeepStrictEqual(read(current, change.path), change.after))
  const blocked = new Set(changedIdentities.flatMap((change) => [change.path, labels[change.path]].filter(Boolean)))
  if (blocked.has('customerId') || blocked.has('result.partnerId')) { blocked.add('customerId'); blocked.add('customerName'); blocked.add('result.partnerId') }
  const plan = planMergeReversalFields(current, changes.filter((change) => !blocked.has(change.path)))
  return { patch: plan.patch, warnings: [...changedIdentities.map((change) => `${change.path}: Verknüpfung wurde später geändert – manuelle Prüfung erforderlich.`), ...plan.warnings] }
}

export function planCopiedMergeRecord(current, after) {
  return { archiveCopy: current !== null && isDeepStrictEqual(current, after), needsManualReview: current === null || !isDeepStrictEqual(current, after) }
}

export function summarizeMergeReversal(operation, references = [], copies = [], warnings = [], targetPatch = null) {
  const modules = {}
  references.forEach((reference) => { modules[reference.collection] = (modules[reference.collection] || 0) + 1 })
  return {
    sourcePartnerId: operation.sourcePartnerId,
    sourcePartnerName: operation.sourcePartnerName,
    targetPartnerId: operation.targetPartnerId,
    targetPartnerName: operation.targetPartnerName,
    debtorCount: operation.movedNumbers?.debtors?.length || 0,
    creditorCount: operation.movedNumbers?.creditors?.length || 0,
    referenceCounts: modules,
    dataCount: (targetPatch ? Object.keys(targetPatch).map((path) => ({ path })) : (operation.targetChanges || [])).filter((change) => !['debtorNumber', 'creditorNumber', 'latestMergeId'].includes(change.path) && !change.path.startsWith('dycosReferences.')).length + copies.length,
    warnings,
  }
}

export function mergeReversalEligibility(operation, source, target, referenceCount, copyCount) {
  if (!operation || operation.schemaVersion !== 1 || !operation.sourceBefore || !Array.isArray(operation.targetChanges) || !operation.movedNumbers) return 'Diese frühere Zusammenführung kann nicht automatisch sicher getrennt werden: vollständiges Protokoll fehlt.'
  if (operation.status !== 'merged') return 'Diese Zusammenführung wurde bereits getrennt oder ist nicht mehr offen.'
  if (operation.nestedSourceMergeId) return 'Diese verschachtelte Zusammenführung kann nicht automatisch sicher getrennt werden.'
  if (!source || !target || source.mergedIntoPartnerId !== operation.targetPartnerId || source.mergedByMergeId !== operation.mergeId || target.latestMergeId !== operation.mergeId || target.mergedIntoPartnerId) return 'Die Partner wurden seitdem weiter zusammengeführt oder ihr Archivzustand passt nicht mehr zum Protokoll.'
  if (referenceCount !== operation.referenceCount || copyCount !== operation.copyCount) return 'Das Verknüpfungsprotokoll ist unvollständig. Eine automatische Trennung wäre unsicher.'
  return ''
}

export function restoredMergeSource(before, current, mergeId, separatedAt) {
  const restored = { ...before, status: 'active', lastSeparatedMergeId: mergeId, separatedAt, updatedAt: separatedAt }
  for (const key of Object.keys(current || {})) if (!own(restored, key)) restored[key] = undefined
  return restored
}
