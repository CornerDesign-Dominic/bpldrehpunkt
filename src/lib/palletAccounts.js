import { Timestamp, addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { PALLET_TYPES } from '../constants/pallets.js'
import { getPartnerCluster } from './partnerClusterQueries.js'
import { summarizePalletAccount } from './palletAccountCalculations.js'
export { getPalletAccountEntries, getPalletMovementChangeForPartner, getPalletMovementCounterpartyId, isPalletMovementForPartner, summarizePalletAccount } from './palletAccountCalculations.js'

export const PALLET_MOVEMENTS_COLLECTION = 'palletMovements'
export const PALLET_CLOSINGS_COLLECTION = 'palletClosings'

const palletMovementsRef = collection(db, PALLET_MOVEMENTS_COLLECTION)
const palletClosingsRef = collection(db, PALLET_CLOSINGS_COLLECTION)

const toNumber = (value) => Number(value) || 0
const trimValue = (value) => (value ?? '').trim()
const normalizePalletType = (value) => (PALLET_TYPES.includes(value) ? value : PALLET_TYPES[0])
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })

function getMovementSnapshots(partnerId) {
  return Promise.all([
    getDocs(query(palletMovementsRef, where('customerId', '==', partnerId))),
    getDocs(query(palletMovementsRef, where('carrierId', '==', partnerId))),
    getDocs(query(palletMovementsRef, where('partnerId', '==', partnerId))),
  ])
}

async function loadClusterMovements(cluster) {
  const memberIds = cluster.members.map((partner) => partner.id)
  const movementSnapshots = await Promise.all(memberIds.map(getMovementSnapshots))
  const movements = movementSnapshots.flatMap((group) => group.flatMap((snapshot) => snapshot.docs.map(mapSnapshot)))
  return {
    memberIds,
    movements: [...new Map(movements.map((movement) => [movement.id, movement])).values()],
  }
}

async function loadClusterClosings(cluster) {
  const memberIds = cluster.members.map((partner) => partner.id)
  const snapshots = await Promise.all(memberIds.map((id) => getDocs(query(palletClosingsRef, where('partnerId', '==', id)))))
  return snapshots.flatMap((snapshot) => snapshot.docs.map(mapSnapshot))
}

export function calculatePalletMovement(values) {
  const loadingPoint = {
    received: toNumber(values.loadingPoint.received),
    delivered: toNumber(values.loadingPoint.delivered),
  }
  const unloadingPoint = {
    received: toNumber(values.unloadingPoint.received),
    delivered: toNumber(values.unloadingPoint.delivered),
  }

  loadingPoint.carrierChange = loadingPoint.delivered - loadingPoint.received
  unloadingPoint.carrierChange = unloadingPoint.delivered - unloadingPoint.received

  const carrierBalance = loadingPoint.carrierChange + unloadingPoint.carrierChange
  return {
    loadingPoint,
    unloadingPoint,
    carrierBalance,
    customerBalance: carrierBalance * -1,
  }
}

export async function listPalletMovements(partnerId) {
  const cluster = await getPartnerCluster(partnerId)
  return (await loadClusterMovements(cluster)).movements
}

export async function listPalletClosings(partnerId) {
  const cluster = await getPartnerCluster(partnerId)
  return loadClusterClosings(cluster)
}

/** Returns one consolidated pallet account for the active merge target. The
 * underlying movements and closings deliberately keep their original IDs. */
export async function loadPalletAccount(partnerId) {
  const cluster = await getPartnerCluster(partnerId)
  if (!cluster.root) return null
  const [{ memberIds, movements }, closings] = await Promise.all([loadClusterMovements(cluster), loadClusterClosings(cluster)])
  return {
    partner: cluster.root,
    members: cluster.members,
    memberIds,
    movements,
    closings,
    account: summarizePalletAccount(movements, closings, cluster.root.id, memberIds),
  }
}

export async function listAllPalletMovements() {
  const snapshot = await getDocs(palletMovementsRef)
  return snapshot.docs.map(mapSnapshot)
}

export async function listAllPalletClosings() {
  const snapshot = await getDocs(palletClosingsRef)
  return snapshot.docs.map(mapSnapshot)
}

export async function createPalletMovement(values) {
  const calculation = calculatePalletMovement(values)
  await addDoc(palletMovementsRef, {
    tourNumber: trimValue(values.tourNumber),
    date: values.date,
    customerId: values.customerId || null,
    carrierId: values.carrierId || null,
    palletReceiptNumber: trimValue(values.palletReceiptNumber),
    palletType: normalizePalletType(values.palletType),
    note: trimValue(values.note),
    ...calculation,
    loadingPoint: { ...calculation.loadingPoint, note: trimValue(values.loadingPoint?.note) },
    unloadingPoint: { ...calculation.unloadingPoint, note: trimValue(values.unloadingPoint?.note) },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

function createMovementHistorySnapshot(movement) {
  return {
    tourNumber: movement.tourNumber ?? '',
    date: movement.date ?? '',
    customerId: movement.customerId ?? null,
    carrierId: movement.carrierId ?? null,
    palletReceiptNumber: movement.palletReceiptNumber ?? '',
    palletType: normalizePalletType(movement.palletType),
    note: movement.note ?? '',
    loadingPoint: movement.loadingPoint ?? { received: 0, delivered: 0, carrierChange: 0 },
    unloadingPoint: movement.unloadingPoint ?? { received: 0, delivered: 0, carrierChange: 0 },
    carrierBalance: toNumber(movement.carrierBalance),
    customerBalance: toNumber(movement.customerBalance),
  }
}

export async function updatePalletMovement(movementId, values) {
  const movementRef = doc(db, PALLET_MOVEMENTS_COLLECTION, movementId)
  const previousSnapshot = await getDoc(movementRef)
  if (!previousSnapshot.exists()) throw new Error('Palettenbewegung nicht gefunden.')

  const calculation = calculatePalletMovement(values)
  await updateDoc(movementRef, {
    tourNumber: trimValue(values.tourNumber),
    date: values.date,
    customerId: values.customerId || null,
    carrierId: values.carrierId || null,
    palletReceiptNumber: trimValue(values.palletReceiptNumber),
    palletType: normalizePalletType(values.palletType),
    note: trimValue(values.note),
    ...calculation,
    loadingPoint: { ...calculation.loadingPoint, note: trimValue(values.loadingPoint?.note) },
    unloadingPoint: { ...calculation.unloadingPoint, note: trimValue(values.unloadingPoint?.note) },
    editHistory: arrayUnion({ editedAt: Timestamp.now(), previousData: createMovementHistorySnapshot(previousSnapshot.data()) }),
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

export async function deletePalletMovement(movementId) {
  await deleteDoc(doc(db, PALLET_MOVEMENTS_COLLECTION, movementId))
}

function createClosingHistorySnapshot(closing) {
  return {
    date: closing.date ?? '',
    type: closing.type ?? '',
    reference: closing.reference ?? '',
    note: closing.note ?? '',
    previousBalance: toNumber(closing.previousBalance),
    adjustment: toNumber(closing.adjustment),
    newBalance: toNumber(closing.newBalance),
  }
}

export async function updatePalletClosing(closingId, values) {
  const closingRef = doc(db, PALLET_CLOSINGS_COLLECTION, closingId)
  const previousSnapshot = await getDoc(closingRef)
  if (!previousSnapshot.exists()) throw new Error('Kontoabschluss nicht gefunden.')

  await updateDoc(closingRef, {
    date: values.date,
    type: values.type,
    reference: trimValue(values.reference),
    note: trimValue(values.note),
    previousBalance: toNumber(values.previousBalance),
    adjustment: toNumber(values.adjustment),
    newBalance: toNumber(values.newBalance),
    editHistory: arrayUnion({ editedAt: Timestamp.now(), previousData: createClosingHistorySnapshot(previousSnapshot.data()) }),
    updatedAt: serverTimestamp(),
  })
}

export async function deletePalletClosing(closingId) {
  await deleteDoc(doc(db, PALLET_CLOSINGS_COLLECTION, closingId))
}
