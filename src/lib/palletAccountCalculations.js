const toNumber = (value) => Number(value) || 0
const timestampValue = (value) => value?.toMillis?.() ?? 0

export function isPalletMovementForPartner(movement, partnerId, memberIds = [partnerId]) {
  const ids = new Set(memberIds)
  return ids.has(movement.customerId) || ids.has(movement.carrierId) || ids.has(movement.partnerId)
}

export function getPalletMovementChangeForPartner(movement, partnerId, memberIds = [partnerId]) {
  const ids = new Set(memberIds)
  if (ids.has(movement.partnerId)) return toNumber(movement.incoming) - toNumber(movement.outgoing)
  let change = 0
  if (ids.has(movement.carrierId)) change += toNumber(movement.carrierBalance)
  if (ids.has(movement.customerId)) change += toNumber(movement.customerBalance)
  return change
}

export function getPalletMovementCounterpartyId(movement, partnerId) {
  if (movement.carrierId === partnerId && movement.customerId !== partnerId) return movement.customerId
  if (movement.customerId === partnerId && movement.carrierId !== partnerId) return movement.carrierId
  return ''
}

export function getPalletAccountEntries(movements, closings, partnerId, memberIds = [partnerId]) {
  const entries = [
    ...movements.map((movement) => ({ ...movement, entryType: 'movement', change: getPalletMovementChangeForPartner(movement, partnerId, memberIds), counterpartyId: getPalletMovementCounterpartyId(movement, partnerId) })),
    ...closings.map((closing) => ({ ...closing, entryType: 'closing', change: toNumber(closing.adjustment) })),
  ].sort((first, second) => first.date.localeCompare(second.date) || timestampValue(first.createdAt) - timestampValue(second.createdAt))
  let balance = 0
  return entries.map((entry) => { balance += entry.change; return { ...entry, balance } })
}

export function summarizePalletAccount(movements, closings, partnerId, memberIds = [partnerId]) {
  const entries = getPalletAccountEntries(movements, closings, partnerId, memberIds)
  const movementChanges = movements.map((movement) => getPalletMovementChangeForPartner(movement, partnerId, memberIds))
  const latestClosing = entries.filter((entry) => entry.entryType === 'closing').at(-1) ?? null
  return {
    totalIncoming: movementChanges.filter((change) => change > 0).reduce((sum, change) => sum + change, 0),
    totalOutgoing: movementChanges.filter((change) => change < 0).reduce((sum, change) => sum + Math.abs(change), 0),
    balance: entries.at(-1)?.balance ?? 0,
    latestClosing,
    entries,
  }
}
