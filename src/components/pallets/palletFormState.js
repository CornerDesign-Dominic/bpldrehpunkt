import { PALLET_CLOSING_TYPES, PALLET_TYPES } from '../../constants/pallets.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { effectivePartnerReference } from '../../lib/partnerCluster.js'

const currentDate = () => new Date().toISOString().slice(0, 10)

export function createPalletMovementForm(partner) {
  const roles = businessPartnerRoles(partner)
  return {
    tourNumber: '',
    date: currentDate(),
    customerId: roles.customer && !roles.carrier ? partner.id : '',
    carrierId: roles.carrier ? partner.id : '',
    palletReceiptNumber: '',
    palletType: PALLET_TYPES[0],
    note: '',
    loadingPoint: { received: '', delivered: '', note: '' },
    unloadingPoint: { received: '', delivered: '', note: '' },
  }
}

export function createPalletMovementFormFromEntry(movement) {
  return {
    tourNumber: movement.tourNumber ?? '',
    date: movement.date ?? currentDate(),
    customerId: movement.customerId ?? '',
    carrierId: movement.carrierId ?? '',
    palletReceiptNumber: movement.palletReceiptNumber ?? '',
    palletType: PALLET_TYPES.includes(movement.palletType) ? movement.palletType : PALLET_TYPES[0],
    note: movement.note ?? '',
    loadingPoint: { received: String(movement.loadingPoint?.received ?? 0), delivered: String(movement.loadingPoint?.delivered ?? 0), note: movement.loadingPoint?.note ?? movement.note ?? '' },
    unloadingPoint: { received: String(movement.unloadingPoint?.received ?? 0), delivered: String(movement.unloadingPoint?.delivered ?? 0), note: movement.unloadingPoint?.note ?? '' },
  }
}

/** Keep the stored origin as the select value. The label follows the active
 * merge target so editing a historical booking never silently reassigns it. */
export function palletPartnerOption(partnersById, partnerId) {
  const original = partnersById.get(partnerId)
  if (!original) return null
  const effective = effectivePartnerReference(partnersById, partnerId)
  const target = partnersById.get(effective.effectivePartnerId)
  const originalLabel = original.companyName || original.id
  const targetLabel = target?.companyName || effective.effectivePartnerName || effective.effectivePartnerId
  return {
    id: partnerId,
    isHistorical: Boolean(effective.effectivePartnerId && effective.effectivePartnerId !== partnerId),
    label: effective.effectivePartnerId && effective.effectivePartnerId !== partnerId ? `${targetLabel} · Ursprung: ${originalLabel}` : originalLabel,
  }
}

export function createPalletClosingForm(balance) {
  return { date: currentDate(), type: PALLET_CLOSING_TYPES[0], reference: '', note: '', direction: '', quantity: '', previousBalance: balance }
}

export function createPalletClosingFormFromEntry(closing) {
  const adjustment = Number(closing.adjustment) || 0
  return {
    date: closing.date ?? currentDate(),
    type: PALLET_CLOSING_TYPES.includes(closing.type) ? closing.type : PALLET_CLOSING_TYPES[0],
    reference: closing.reference ?? '',
    note: closing.note ?? '',
    direction: adjustment > 0 ? 'add' : adjustment < 0 ? 'subtract' : '',
    quantity: adjustment ? String(Math.abs(adjustment)) : '',
    previousBalance: closing.previousBalance ?? 0,
  }
}

export function isPalletQuantityInput(value) {
  return value === '' || /^\d+$/.test(value)
}

export function isNonNegativePalletQuantity(value) {
  return Number.isInteger(Number(value || 0)) && Number(value || 0) >= 0
}
