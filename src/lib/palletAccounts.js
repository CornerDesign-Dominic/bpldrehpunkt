import { listTransportOrderPalletMovements as loadTransportOrderPalletMovements, mutatePalletRecord } from './palletSummaries.js'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { getPartnerCluster } from './partnerClusterQueries.js'
import { summarizePalletAccount } from './palletAccountCalculations.js'
export { getPalletAccountEntries, getPalletMovementChangeForPartner, getPalletMovementCounterpartyId, isPalletMovementForPartner, summarizePalletAccount } from './palletAccountCalculations.js'

export const PALLET_MOVEMENTS_COLLECTION = 'palletMovements'
export const PALLET_CLOSINGS_COLLECTION = 'palletClosings'

const palletMovementsRef = collection(db, PALLET_MOVEMENTS_COLLECTION)
const palletClosingsRef = collection(db, PALLET_CLOSINGS_COLLECTION)

const toNumber = (value) => Number(value) || 0
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

export async function createPalletMovement(values) { return mutatePalletRecord('movement', 'create', '', values) }
export async function updatePalletMovement(id, values, expectedRevision) { return mutatePalletRecord('movement', 'update', id, values, expectedRevision) }
export async function deletePalletMovement(id, expectedRevision) { return mutatePalletRecord('movement', 'delete', id, undefined, expectedRevision) }
export async function createPalletClosing(partnerId, values) { return mutatePalletRecord('closing', 'create', '', { ...values, partnerId }) }
export async function updatePalletClosing(id, values, expectedRevision) {
  // Existing editor does not submit partnerId; the server preserves ownership.
  return mutatePalletRecord('closing', 'update', id, values, expectedRevision)
}
export async function deletePalletClosing(id, expectedRevision) { return mutatePalletRecord('closing', 'delete', id, undefined, expectedRevision) }



export async function listTransportOrderPalletMovements(orderId) {
  return (await loadTransportOrderPalletMovements(orderId)).movements
}
