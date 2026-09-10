import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

export async function analyzeCustomerOrderTerms(file) {
  const pdfBase64 = await fileToBase64(file)
  const result = await httpsCallable(functions, 'analyzeCustomerOrderTerms', { timeout: 120_000 })({ pdfBase64, fileName: file.name })
  return result.data
}
