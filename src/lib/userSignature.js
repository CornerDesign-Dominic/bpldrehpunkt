import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { auth, functions, storage } from './firebase.js'

export const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024
const SIGNATURE_LOAD_TIMEOUT_MS = 30000

function invalidSignatureResponse() {
  const error = new Error('Ungültige Antwort für die persönliche Unterschrift.')
  error.code = 'diagnostic/invalid-response'
  return error
}

function currentUserSignatureRef() {
  const uid = auth.currentUser?.uid
  if (!uid) {
    const error = new Error('Bitte erneut anmelden.')
    error.code = 'storage/unauthenticated'
    throw error
  }

  // The path is derived only from Firebase Auth, never from route or form data.
  return ref(storage, `user-signatures/${uid}/signature.jpg`)
}

export function validateSignatureFile(file) {
  if (!file) return 'Bitte wähle eine JPG- oder JPEG-Datei aus.'
  if (file.type !== 'image/jpeg') return 'Bitte lade ausschließlich eine JPG- oder JPEG-Datei hoch.'
  if (file.size === 0) return 'Die ausgewählte Datei ist leer.'
  if (file.size > MAX_SIGNATURE_SIZE_BYTES) return 'Die Unterschrift darf maximal 2 MB groß sein.'
  return ''
}

export async function loadCurrentUserSignature() {
  // Keep the browser out of the direct Storage download path. This callable
  // applies the same active-profile check as the shared stamp, while the
  // server selects the fixed object path from the authenticated UID.
  let timeoutId
  try {
    const { data } = await Promise.race([
      httpsCallable(functions, 'getOwnSignature')(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('Zeitüberschreitung beim Laden der Unterschrift.')
          error.code = 'signature/timeout'
          reject(error)
        }, SIGNATURE_LOAD_TIMEOUT_MS)
      }),
    ])
    if (data?.exists === false) {
      const error = new Error('Keine persönliche Unterschrift hinterlegt.')
      error.code = 'signature/not-uploaded'
      throw error
    }
    if (data?.contentType !== 'image/jpeg' || typeof data.base64 !== 'string') throw invalidSignatureResponse()
    let binary
    try { binary = atob(data.base64) } catch { throw invalidSignatureResponse() }
    if (!binary.length || binary.length > MAX_SIGNATURE_SIZE_BYTES) throw invalidSignatureResponse()
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: 'image/jpeg' })
  } finally {
    clearTimeout(timeoutId)
  }
}

export function signatureBlobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Die Unterschrift konnte nicht verarbeitet werden.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export async function uploadCurrentUserSignature(file) {
  const validationError = validateSignatureFile(file)
  if (validationError) {
    const error = new Error(validationError)
    error.code = 'signature/invalid-file'
    throw error
  }

  await uploadBytes(currentUserSignatureRef(), file, {
    contentType: 'image/jpeg',
    contentDisposition: 'inline; filename="signature.jpg"',
    cacheControl: 'no-store',
  })
}

export async function deleteCurrentUserSignature() {
  await deleteObject(currentUserSignatureRef())
}

export function signatureErrorMessage(error, action) {
  if (['storage/object-not-found', 'signature/not-uploaded'].includes(error?.code)) return ''
  if (error?.code === 'signature/invalid-file') return error.message
  if (['storage/unauthorized', 'storage/permission-denied', 'functions/permission-denied'].includes(error?.code)) return 'Du hast keine Berechtigung für diese Unterschrift.'
  if (['storage/unauthenticated', 'functions/unauthenticated'].includes(error?.code)) return 'Bitte melde dich erneut an.'
  if (error?.code === 'signature/timeout') return 'Das Laden der Unterschrift dauert zu lange. Bitte versuche es erneut.'
  if (error?.code === 'storage/quota-exceeded') return 'Der Speicherplatz ist derzeit erschöpft.'
  if (error?.code === 'storage/canceled') return 'Der Upload wurde abgebrochen.'
  return action === 'load' ? 'Die Unterschrift konnte nicht geladen werden.' : 'Die Unterschrift konnte nicht gespeichert werden.'
}
