const text = (value) => typeof value === 'string' ? value.trim() : ''

// This marker is deliberately derived from both the controlled TA-import source
// and the still-missing number. It therefore disappears as soon as master data
// is completed, without changing the original import audit trail.
export function getMissingCreditorNumberNotice(partner) {
  const status = partner?.taImportStatus
  if (
    text(partner?.creditorNumber)
    || text(status?.source) !== 'dycosTransportOrder'
    || !Array.isArray(status?.missingRequiredFields)
    || !status.missingRequiredFields.includes('creditorNumber')
    || partner?.mergedIntoPartnerId
  ) return null

  return {
    transportOrderNumber: text(status.transportOrderNumber),
    importRunId: text(status.importRunId),
    importedAt: status.importedAt,
  }
}

export function isCarrierMasterDataIncomplete(carrier) {
  return carrier?.masterDataStatus === 'creditorNumberMissing'
}
