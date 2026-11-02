const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const unique = (values) => [...new Set(values.filter(Boolean))]

export function reviewedCustomerImportResult(previous, partnerId, updates = {}) {
  const actions = (previous?.actions || []).filter((action) => action !== 'unchanged')
  if (Object.keys(updates).length && !actions.includes('created')) actions.push('updated')
  return { partnerId, assignment: previous?.assignment || { kind: 'unknown' }, actions: unique([...actions, 'reviewed']) }
}

function legacyActions(row) {
  if (row.approval?.action === 'merged') return ['merged', 'reviewed']
  const applied = row.automaticAppliedValues || {}
  const actions = applied.created ? ['created'] : Object.keys(applied).length ? ['updated'] : []
  if (!actions.length && Object.keys(row.approval?.appliedValues || {}).length) actions.push('updated')
  if (row.approval?.type === 'reviewed') actions.push('reviewed')
  return actions.length ? actions : [Object.hasOwn(row, 'automaticAppliedValues') ? 'unchanged' : 'legacyUnknown']
}

export function projectAcceptedCustomerImportRow(row, partner) {
  const partnerId = text(row.customerId || row.carrierId || row.approval?.targetPartnerId || row.result?.partnerId)
  const actualPartner = partner?.id === partnerId ? { id: partner.id, companyName: text(partner.companyName) } : null
  return {
    ...row,
    result: row.result || { partnerId, assignment: { kind: row.approval?.action === 'merged' ? 'merge' : 'unknown' }, actions: legacyActions(row) },
    affectedPartner: actualPartner,
  }
}
