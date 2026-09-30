import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
import { normalizeCompanyData } from './companyDataModel.js'

export function subscribeCompanyData(onValue, onError) {
  return onSnapshot(doc(db, 'appSettings', 'companyMasterData'), (snapshot) => onValue(normalizeCompanyData(snapshot.exists() ? snapshot.data() : null)), onError)
}

export async function saveCompanyData(value) {
  await httpsCallable(functions, 'updateCompanyMasterData')({ company: normalizeCompanyData(value) })
}

export async function loadCompanyStamp() {
  const { data } = await httpsCallable(functions, 'getCompanyStamp')()
  if (!data?.exists) {
    const error = new Error('Kein Firmenstempel hinterlegt.')
    error.code = 'storage/object-not-found'
    throw error
  }
  if (!['image/jpeg', 'image/png'].includes(data.contentType) || typeof data.base64 !== 'string') {
    const error = new Error('Ungültige Antwort für den Firmenstempel.')
    error.code = 'diagnostic/invalid-response'
    throw error
  }
  let binary
  try { binary = atob(data.base64) } catch {
    const error = new Error('Ungültige Antwort für den Firmenstempel.')
    error.code = 'diagnostic/invalid-response'
    throw error
  }
  if (!binary.length || binary.length > 2 * 1024 * 1024) {
    const error = new Error('Ungültige Antwort für den Firmenstempel.')
    error.code = 'diagnostic/invalid-response'
    throw error
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: data.contentType })
}

export async function uploadCompanyStamp(file) {
  const contentType = file?.type === 'image/jpeg' || /\.jpe?g$/i.test(file?.name || '') ? 'image/jpeg' : file?.type === 'image/png' || /\.png$/i.test(file?.name || '') ? 'image/png' : ''
  if (!contentType || !file?.size || file.size > 2 * 1024 * 1024) throw new Error('Bitte eine JPG-, JPEG- oder PNG-Datei mit maximal 2 MB auswählen.')
  const base64 = await blobToDataUrl(file).then((dataUrl) => dataUrl.split(',')[1])
  await httpsCallable(functions, 'saveCompanyStamp')({ contentType, base64 })
}

export async function deleteCompanyStamp() {
  await httpsCallable(functions, 'deleteCompanyStamp')()
}

export function companyStampErrorMessage(error, action = 'load') {
  if (error?.code === 'storage/object-not-found') return ''
  if (['storage/unauthorized', 'storage/permission-denied', 'functions/permission-denied'].includes(error?.code)) return 'Keine Berechtigung für den Firmenstempel.'
  if (['storage/unauthenticated', 'functions/unauthenticated'].includes(error?.code)) return 'Bitte erneut anmelden.'
  if (error?.code === 'functions/unavailable') return 'Der Firmenstempel-Dienst ist derzeit nicht erreichbar.'
  if (action === 'upload') return 'Der Firmenstempel konnte nicht gespeichert werden.'
  if (action === 'delete') return 'Der Firmenstempel konnte nicht entfernt werden.'
  return 'Der Firmenstempel konnte nicht geladen werden.'
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}
