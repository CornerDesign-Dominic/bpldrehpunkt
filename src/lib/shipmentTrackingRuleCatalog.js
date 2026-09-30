import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH, fallbackShipmentTrackingRuleCatalog, normalizeShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'

const catalogRef = doc(db, ...SHIPMENT_TRACKING_RULE_CATALOG_PATH.split('/'))

export const getShipmentTrackingRuleCatalog = async () => {
  const snapshot = await getDoc(catalogRef)
  return snapshot.exists() ? normalizeShipmentTrackingRuleCatalog(snapshot.data()) : fallbackShipmentTrackingRuleCatalog()
}

export const watchShipmentTrackingRuleCatalog = (onCatalog, onError) => onSnapshot(catalogRef, (snapshot) => onCatalog(snapshot.exists() ? normalizeShipmentTrackingRuleCatalog(snapshot.data()) : fallbackShipmentTrackingRuleCatalog()), onError)

export { SHIPMENT_TRACKING_RULE_CATALOG_PATH }
