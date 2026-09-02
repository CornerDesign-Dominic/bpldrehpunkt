import { PALLET_CLOSING_TYPES, PALLET_TYPES } from '../../constants/pallets.js'

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
