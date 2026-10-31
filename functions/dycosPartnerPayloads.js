import { newShipmentTrackingPartnerPolicy } from './shared/shipmentTrackingPartnerDefaults.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
export const importPartnerId = (kind, value) => `dycos-${kind}-${encodeURIComponent(value)}`

export function customerPartnerPayload(row, { partnerId, importRunId, now, ruleCatalog = null }) {
  const customer = row.imported.customer; const email = text(row.imported.contacts?.customerStandardEmail)
  return {
    id: partnerId, companyName: customer.name, debtorNumber: customer.debtorNumber, creditorNumber: '', timocomNumber: '', transeuNumber: '', dplNumber: '', pakiNumber: '', status: 'active', paymentTermDays: '', creditNoteProcedure: false, creditLimit: null, palletNote: '', crmStatus: '', potential: '',
    address: { street: text(customer.snapshot?.street), houseNumber: '', postalCode: text(customer.snapshot?.postalCode), city: text(customer.snapshot?.city), country: text(customer.snapshot?.country) },
    contact: { phone: '', fax: '', email, website: '' }, contacts: [], portals: [], companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
    dycosReferences: { debtorNumbers: [customer.debtorNumber], creditorNumbers: [] },
    shipmentTrackingPolicy: newShipmentTrackingPartnerPolicy({ debtorNumber: customer.debtorNumber }, ruleCatalog),
    importOrigin: { source: 'dycosTransportOrder', transportOrderNumber: row.externalNumber, importRunId, createdAt: now }, createdAt: now, updatedAt: now,
  }
}

export function carrierPartnerPayload(row, { partnerId, importRunId, now, ruleCatalog = null }) {
  const email = text(row.imported.contacts?.carrierStandardEmail)
  return {
    id: partnerId, companyName: row.imported.carrier.originalName, debtorNumber: '', creditorNumber: '', timocomNumber: '', transeuNumber: '', dplNumber: '', pakiNumber: '', status: 'active', paymentTermDays: '', creditNoteProcedure: false, creditLimit: null, palletNote: '', crmStatus: '', potential: '',
    address: { street: '', houseNumber: '', postalCode: '', city: '', country: '' }, contact: { phone: '', fax: '', email, website: '' }, contacts: [], portals: [], companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
    dycosReferences: { debtorNumbers: [], creditorNumbers: [] },
    importOrigin: { source: 'dycosTransportOrder', transportOrderNumber: row.externalNumber, importRunId, createdAt: now },
    taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'], transportOrderNumber: row.externalNumber, importRunId, importedAt: now, partnerId },
    shipmentTrackingPolicy: newShipmentTrackingPartnerPolicy({ taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }, ruleCatalog),
    createdAt: now, updatedAt: now,
  }
}

