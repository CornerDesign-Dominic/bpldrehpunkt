import { recordHistoryTime as partnerHistoryTime, recordHistoryValue } from './recordHistoryPresentation.js'
import { businessPartnerHistoryChanges, mergePartnerHistoryPatch, partnerHistoryFieldLabel } from '../../shared/businessPartnerHistory.js'

const categories = new Set(['masterData', 'paymentData', 'contactPerson', 'creditLimit', 'shipmentTrackingPolicy', 'import', 'merge'])
function expanded(values) {
  const result = {}
  for (const [path, value] of Object.entries(values || {})) {
    const parts = path.split('.')
    if (parts.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) continue
    let target = result
    for (const key of parts.slice(0, -1)) target = target[key] ||= {}
    target[parts.at(-1)] = value
  }
  return result
}
function changesFor(entry) {
  if (Array.isArray(entry.metadata?.changes)) return entry.metadata.changes
  if (entry.action === 'merged' && Array.isArray(entry.decisions)) {
    return entry.decisions.filter((decision) => JSON.stringify(decision.targetValue ?? null) !== JSON.stringify(decision.resultValue ?? null)).map((decision) => ({
      path: decision.key, label: decision.label || partnerHistoryFieldLabel(decision.key),
      oldValue: /accessNumber|password|portals/i.test(decision.key) ? 'Geschützt' : decision.targetValue ?? null,
      newValue: /accessNumber|password|portals/i.test(decision.key) ? 'Geschützt' : decision.resultValue ?? null,
    }))
  }
  if (entry.previousValues && entry.appliedValues) {
    const before = expanded(entry.previousValues)
    return businessPartnerHistoryChanges(before, mergePartnerHistoryPatch(before, expanded(entry.appliedValues)))
  }
  const metadata = entry.metadata || {}
  if (Object.hasOwn(metadata, 'oldValue') || Object.hasOwn(metadata, 'newValue')) {
    const path = metadata.field || entry.category
    return [{ path, label: path === 'creditLimit' ? 'Kreditlimit' : partnerHistoryFieldLabel(path), oldValue: metadata.oldValue ?? null, newValue: metadata.newValue ?? null }]
  }
  return null
}

export function businessPartnerHistoryRows(partner, history) {
  const creations = history.filter((entry) => entry.action === 'created' && categories.has(entry.category))
  const created = creations.sort((a, b) => partnerHistoryTime(a.createdAt) - partnerHistoryTime(b.createdAt))[0] || {
    id: 'record-created', action: 'created', createdAt: partner?.createdAt,
    createdByName: partner?.createdByName, createdByUserId: partner?.createdByUserId || partner?.createdBy,
  }
  const createdTime = partnerHistoryTime(created.createdAt)
  const rows = history.filter((entry) => entry.action !== 'created').flatMap((entry) => {
    if (!categories.has(entry.category) && !Array.isArray(entry.metadata?.changes)) return []
    // Initial import enrichment belongs to creation, not to later edits.
    if (createdTime && partnerHistoryTime(entry.createdAt) && partnerHistoryTime(entry.createdAt) <= createdTime) return []
    const changes = changesFor(entry)
    if (changes && !changes.length) return []
    return [{ ...entry, changes, legacy: !changes }]
  })
  const grouped = new Map()
  const compactRows = []
  for (const row of rows) {
    const key = row.metadata?.operationId
    if (!key || !row.changes) { compactRows.push(row); continue }
    if (grouped.has(key)) grouped.get(key).changes.push(...row.changes)
    else { const combined = { ...row, changes: [...row.changes] }; grouped.set(key, combined); compactRows.push(combined) }
  }
  if (creations.length || partner?.createdAt) compactRows.push({ ...created, changes: [], creation: true })
  return compactRows.sort((a, b) => partnerHistoryTime(b.createdAt) - partnerHistoryTime(a.createdAt))
}

export { recordHistoryActor as businessPartnerHistoryActor } from './recordHistoryPresentation.js'
export function businessPartnerHistoryValue(value, language) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).map(([key, item]) => `${partnerHistoryFieldLabel(key)}: ${businessPartnerHistoryValue(item, language)}`).join('\n')
  return recordHistoryValue(value, language)
}
