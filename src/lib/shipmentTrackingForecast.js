import { httpsCallable } from 'firebase/functions'
import { functions, waitForAppCheckToken } from './firebase.js'

async function call(name, payload) { await waitForAppCheckToken(); return (await httpsCallable(functions, name)(payload)).data }
export const getShipmentTrackingForecast = (orderId) => call('getShipmentTrackingForecast', { orderId })
export const refreshShipmentTrackingForecast = (orderId) => call('refreshShipmentTrackingForecast', { orderId, trigger: 'manual' })
export const getShipmentTrackingAttention = (orderId) => call('getShipmentTrackingAttention', { orderId })
