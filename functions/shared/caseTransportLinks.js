export const CASE_TRANSPORT_CASE_TYPES = Object.freeze({
  damage: { module: 'damages', collection: 'damageCases', label: 'Schaden', route: '/schaeden' },
  inkasso: { module: 'inkasso', collection: 'inkassoCases', label: 'Inkasso', route: '/inkasso' },
  legalDispute: { module: 'legalDisputes', collection: 'legalDisputes', label: 'Gericht / Streit', route: '/legal-disputes' },
})

export const CASE_TRANSPORT_CASE_TYPE_IDS = Object.freeze(Object.keys(CASE_TRANSPORT_CASE_TYPES))

export function transportOrderCaseTypeOrder(links = []) {
  const linkedTypes = new Set(links.map((link) => link?.caseType))
  return [...CASE_TRANSPORT_CASE_TYPE_IDS].sort((left, right) => Number(linkedTypes.has(right)) - Number(linkedTypes.has(left)))
}

export function visibleCaseTransportCaseTypes(canViewModule) {
  return CASE_TRANSPORT_CASE_TYPE_IDS.filter((caseType) => canViewModule(CASE_TRANSPORT_CASE_TYPES[caseType].module))
}

export function isCaseTransportCaseType(value) {
  return typeof value === 'string' && Object.hasOwn(CASE_TRANSPORT_CASE_TYPES, value)
}

export function businessPartnerRoleSelectionValue(role, partnerId) {
  if (!['customer', 'carrier'].includes(role) || typeof partnerId !== 'string' || !partnerId) return ''
  return `${role}:${encodeURIComponent(partnerId)}`
}

export function parseBusinessPartnerRoleSelection(value) {
  if (typeof value !== 'string') return { role: '', partnerId: '' }
  const separator = value.indexOf(':')
  const role = separator > 0 ? value.slice(0, separator) : ''
  const encodedPartnerId = separator > 0 ? value.slice(separator + 1) : ''
  if (!['customer', 'carrier'].includes(role) || !encodedPartnerId) return { role: '', partnerId: '' }
  try { return { role, partnerId: decodeURIComponent(encodedPartnerId) } } catch { return { role: '', partnerId: '' } }
}

function isCaseTransportLinkPart(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 240 && !value.includes('/') && !value.includes('|')
}

export function isValidCaseTransportLink(link) {
  return Boolean(link) && isCaseTransportCaseType(link.caseType) && isCaseTransportLinkPart(link.caseId) && isCaseTransportLinkPart(link.transportOrderId)
}

// The source documents are Firestore document IDs and therefore cannot contain
// slashes. A fixed ID makes a repeated link request idempotent without copying
// either case or order data into the relation document.
export function caseTransportLinkId(caseType, caseId, transportOrderId) {
  if (!isCaseTransportCaseType(caseType) || !isCaseTransportLinkPart(caseId) || !isCaseTransportLinkPart(transportOrderId)) throw new Error('Ungültige Verknüpfung.')
  return `${caseType}|${caseId}|${transportOrderId}`
}

export async function resolveCaseTransportLinks(links, readCase) {
  const validLinks = []
  const ignored = []
  for (const link of links || []) {
    if (isValidCaseTransportLink(link)) validLinks.push(link)
    else ignored.push({ link, reason: 'invalid-link' })
  }
  const resolved = await Promise.allSettled(validLinks.map(async (link) => {
    const caseItem = await readCase(link.caseType, link.caseId)
    return caseItem ? { ...link, caseItem } : null
  }))
  const entries = []
  resolved.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) entries.push(result.value)
    else ignored.push({ link: validLinks[index], reason: result.status === 'rejected' ? result.reason?.code || 'case-read-failed' : 'case-missing' })
  })
  return { entries, ignored }
}

export async function loadCaseTransportLinks({ caseTypes, listLinksForType, readCase }) {
  const groups = await Promise.all((caseTypes || []).map((caseType) => listLinksForType(caseType)))
  return resolveCaseTransportLinks(groups.flat(), readCase)
}

export function caseDetailPath(caseType, caseId) {
  const definition = CASE_TRANSPORT_CASE_TYPES[caseType]
  if (!definition || !caseId) return ''
  return `${definition.route}/${encodeURIComponent(caseId)}`
}

export function linkedCaseLabel(caseType, caseItem = {}) {
  const definition = CASE_TRANSPORT_CASE_TYPES[caseType]
  const number = caseItem.caseNumber || caseItem.id
  return [definition?.label || 'Vorgang', number].filter(Boolean).join(' ')
}

function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function transportOrderSearchText(order = {}) {
  const imported = order.imported || {}
  return [
    order.externalNumber,
    imported.externalNumber,
    imported.customer?.name,
    imported.customer?.partnerName,
    imported.carrier?.originalName,
    imported.carrier?.partnerName,
    imported.customerReference,
    imported.reference,
    imported.loading?.reference,
    imported.unloading?.reference,
  ].map(text).filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
}

export function filterTransportOrders(orders, search) {
  const needle = text(search).toLocaleLowerCase('de-DE')
  if (!needle) return orders
  return orders.filter((order) => transportOrderSearchText(order).includes(needle))
}

export function transportOrderCasePrefill(order = {}) {
  const imported = order.imported || {}
  const customer = imported.customer || {}
  const carrier = imported.carrier || {}
  const transportReference = text(order.externalNumber) || text(imported.externalNumber)
  const reference = text(imported.customerReference) || text(imported.loading?.reference) || text(imported.unloading?.reference)
  return {
    transportOrderId: text(order.id),
    transportReference,
    reference,
    customer: { id: text(customer.partnerId), name: text(customer.name) || text(customer.partnerName), number: text(customer.debtorNumber) },
    carrier: { id: text(carrier.partnerId), name: text(carrier.originalName) || text(carrier.partnerName), number: text(carrier.creditorNumber) },
  }
}

export function caseCreationDefaults(caseType, prefill) {
  const context = prefill || {}
  const preferredDebtor = context.carrier?.id ? { ...context.carrier, role: 'carrier' } : { ...context.customer, role: 'customer' }
  const transportOrderLinks = context.transportOrderId ? [{ id: context.transportOrderId, number: context.transportReference || context.transportOrderId }] : []
  if (caseType === 'damage') return {
    transportReference: context.transportReference,
    transportOrderLinks,
    description: context.reference ? `TA ${context.transportReference} · Referenz ${context.reference}` : '',
    claimantPartnerId: context.customer?.id || '', claimant: context.customer?.name || '',
    contractorPartnerId: context.carrier?.id || '', contractor: context.carrier?.name || '',
  }
  if (caseType === 'inkasso') return {
    debtorPartnerId: preferredDebtor.id || '', debtorPartnerRole: preferredDebtor.role || '', debtorName: preferredDebtor.name || '', debtorNumber: preferredDebtor.number || '',
    transportOrderLinks,
  }
  if (caseType === 'legalDispute') return {
    transportReference: context.transportReference || '', counterparty: preferredDebtor.name || '', counterpartySelection: businessPartnerRoleSelectionValue(preferredDebtor.role, preferredDebtor.id),
    transportOrderLinks,
  }
  return {}
}
