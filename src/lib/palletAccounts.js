import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase.js'

export const PALLET_MOVEMENTS_COLLECTION = 'palletMovements'
export const PALLET_CLOSINGS_COLLECTION = 'palletClosings'

const palletMovementsRef = collection(db, PALLET_MOVEMENTS_COLLECTION)
const palletClosingsRef = collection(db, PALLET_CLOSINGS_COLLECTION)

const toNumber = (value) => Number(value) || 0
const trimValue = (value) => value.trim()
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

export async function listPalletMovements(partnerId) {
  const snapshot = await getDocs(query(palletMovementsRef, where('partnerId', '==', partnerId)))
  return snapshot.docs.map(mapSnapshot)
}

export async function listPalletClosings(partnerId) {
  const snapshot = await getDocs(query(palletClosingsRef, where('partnerId', '==', partnerId)))
  return snapshot.docs.map(mapSnapshot)
}

export async function listAllPalletMovements() {
  const snapshot = await getDocs(palletMovementsRef)
  return snapshot.docs.map(mapSnapshot)
}

export async function listAllPalletClosings() {
  const snapshot = await getDocs(palletClosingsRef)
  return snapshot.docs.map(mapSnapshot)
}

export async function createPalletMovement(partnerId, values) {
  await addDoc(palletMovementsRef, {
    partnerId,
    date: values.date,
    tourNumber: trimValue(values.tourNumber),
    counterAccount: trimValue(values.counterAccount),
    incoming: toNumber(values.incoming),
    outgoing: toNumber(values.outgoing),
    note: trimValue(values.note),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function createPalletClosing(partnerId, values) {
  await addDoc(palletClosingsRef, {
    partnerId,
    date: values.date,
    type: values.type,
    reference: trimValue(values.reference),
    note: trimValue(values.note),
    previousBalance: toNumber(values.previousBalance),
    adjustment: toNumber(values.adjustment),
    newBalance: toNumber(values.newBalance),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

function timestampValue(value) {
  return value?.toMillis?.() ?? 0
}

export function getPalletAccountEntries(movements, closings) {
  const entries = [
    ...movements.map((movement) => ({ ...movement, entryType: 'movement', incoming: toNumber(movement.incoming), outgoing: toNumber(movement.outgoing), change: toNumber(movement.incoming) - toNumber(movement.outgoing) })),
    ...closings.map((closing) => ({ ...closing, entryType: 'closing', incoming: 0, outgoing: 0, change: toNumber(closing.adjustment) })),
  ].sort((first, second) => first.date.localeCompare(second.date) || timestampValue(first.createdAt) - timestampValue(second.createdAt))

  let balance = 0
  return entries.map((entry) => {
    balance += entry.change
    return { ...entry, balance }
  })
}

export function summarizePalletAccount(movements, closings) {
  const entries = getPalletAccountEntries(movements, closings)
  const latestClosing = entries.filter((entry) => entry.entryType === 'closing').at(-1) ?? null

  return {
    totalIncoming: movements.reduce((sum, movement) => sum + toNumber(movement.incoming), 0),
    totalOutgoing: movements.reduce((sum, movement) => sum + toNumber(movement.outgoing), 0),
    balance: entries.at(-1)?.balance ?? 0,
    latestClosing,
    entries,
  }
}
