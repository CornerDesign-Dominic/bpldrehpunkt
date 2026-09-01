import { PALLET_CLOSING_TYPES } from '../../constants/pallets.js'

const currentDate = () => new Date().toISOString().slice(0, 10)

export function createPalletMovementForm(partner) {
  const isCarrier = Boolean(partner?.creditorNumber?.trim())
  const isCustomer = Boolean(partner?.debtorNumber?.trim())
  return {
    tourNumber: '',
    date: currentDate(),
    customerId: isCustomer && !isCarrier ? partner.id : '',
    carrierId: isCarrier ? partner.id : '',
    palletReceiptNumber: '',
    note: '',
    loadingPoint: { received: '', delivered: '' },
    unloadingPoint: { received: '', delivered: '' },
  }
}

export function createPalletMovementFormFromEntry(movement) {
  return {
    tourNumber: movement.tourNumber ?? '',
    date: movement.date ?? currentDate(),
    customerId: movement.customerId ?? '',
    carrierId: movement.carrierId ?? '',
    palletReceiptNumber: movement.palletReceiptNumber ?? '',
    note: movement.note ?? '',
    loadingPoint: { received: String(movement.loadingPoint?.received ?? 0), delivered: String(movement.loadingPoint?.delivered ?? 0) },
    unloadingPoint: { received: String(movement.unloadingPoint?.received ?? 0), delivered: String(movement.unloadingPoint?.delivered ?? 0) },
  }
}

export function createPalletClosingForm(balance) {
  return { date: currentDate(), type: PALLET_CLOSING_TYPES[0], reference: '', note: '', adjustment: '', previousBalance: balance }
}

export function isPalletQuantityInput(value) {
  return value === '' || /^\d+$/.test(value)
}

export function isNonNegativePalletQuantity(value) {
  return Number.isInteger(Number(value || 0)) && Number(value || 0) >= 0
}
