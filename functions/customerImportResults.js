const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const unique = (values) => [...new Set(values.filter(Boolean))]

function hasNumber(partner, primaryKey, referenceKey, number) {
  return Boolean(number) && [partner?.[primaryKey], ...(partner?.dycosReferences?.[referenceKey] || [])].some((value) => text(value) === number)
}

function appliedNumber(applied, primaryKey, referenceKey, number) {
  return hasNumber(applied, primaryKey, referenceKey, number)
}

export function customerImportAssignment(debtorPartner, creditorPartner, debtorNumber, creditorNumber) {
  if (debtorPartner?.id) return { kind: 'debtor', number: text(debtorNumber) }
  if (creditorPartner?.id) return { kind: 'creditor', number: text(creditorNumber) }
  return { kind: 'new' }
}

export function customerImportActions(existing, row, applied = {}) {
  if (applied.created) return ['created']
  const actions = []
  const debtor = text(row?.debtorNumber)
  const creditor = text(row?.data?.linkedCreditorNumber)
  if (existing && !hasNumber(existing, 'debtorNumber', 'debtorNumbers', debtor) && appliedNumber(applied, 'debtorNumber', 'debtorNumbers', debtor)) actions.push('debtorAdded')
  if (existing && !hasNumber(existing, 'creditorNumber', 'creditorNumbers', creditor) && appliedNumber(applied, 'creditorNumber', 'creditorNumbers', creditor)) actions.push('creditorAdded')
  if (Object.keys(applied).some((key) => !['debtorNumber', 'creditorNumber', 'dycosReferences'].includes(key))) actions.push('updated')
  return actions.length ? actions : [Object.keys(applied).length ? 'updated' : 'unchanged']
}

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
