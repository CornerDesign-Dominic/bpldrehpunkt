import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

export async function analyzeLiabilityTransportOrderWithAi(file, incidentSummary) {
  const pdfBase64 = await fileToBase64(file)
  const result = await httpsCallable(functions, 'analyzeLiabilityTransportOrder', { timeout: 120_000 })({ pdfBase64, incidentSummary })
  return result.data
}

export function liabilityAnalysisToDocumentData(analysis) {
  return {
    orderNumber: analysis.orderNumber || '',
    transportCompany: analysis.carrier?.company || '',
    transportStreet: analysis.carrier?.street || '',
    transportZip: analysis.carrier?.postalCode || '',
    transportCity: analysis.carrier?.city || '',
    transportCountry: analysis.carrier?.country || '',
    loadingCompany: analysis.loadingPlace?.company || '',
    loadingStreet: analysis.loadingPlace?.street || '',
    loadingZip: analysis.loadingPlace?.postalCode || '',
    loadingCity: analysis.loadingPlace?.city || '',
    loadingCountry: analysis.loadingPlace?.country || '',
    loadingDate: analysis.loadingPlace?.date || '',
    unloadingCompany: analysis.unloadingPlace?.company || '',
    unloadingStreet: analysis.unloadingPlace?.street || '',
    unloadingZip: analysis.unloadingPlace?.postalCode || '',
    unloadingCity: analysis.unloadingPlace?.city || '',
    unloadingCountry: analysis.unloadingPlace?.country || '',
    unloadingDate: analysis.unloadingPlace?.date || '',
    incidentText: analysis.incidentText || '',
  }
}
