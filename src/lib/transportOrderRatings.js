import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

export async function getOwnTransportOrderRatings(transportOrderId) {
  const result = await httpsCallable(functions, 'getOwnTransportOrderRatings')({ transportOrderId })
  return { ratings: result.data?.ratings || {}, partners: result.data?.partners || {} }
}

export async function saveTransportOrderRating(values) {
  const result = await httpsCallable(functions, 'saveTransportOrderRating')(values)
  return result.data?.rating
}

export async function listPartnerTransportOrderRatings(partnerId) {
  const result = await httpsCallable(functions, 'listPartnerTransportOrderRatings')({ partnerId })
  return result.data?.ratings || []
}

export async function listCrmTransportRatingSummaries() {
  const result = await httpsCallable(functions, 'listCrmTransportRatingSummaries')()
  return result.data?.summaries || {}
}
