import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from './firebase.js'

export const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024

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
  return getBlob(currentUserSignatureRef())
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
  if (error?.code === 'storage/object-not-found') return ''
  if (error?.code === 'signature/invalid-file') return error.message
  if (['storage/unauthorized', 'storage/permission-denied'].includes(error?.code)) return 'Du hast keine Berechtigung für diese Unterschrift.'
  if (error?.code === 'storage/unauthenticated') return 'Bitte melde dich erneut an.'
  if (error?.code === 'storage/quota-exceeded') return 'Der Speicherplatz ist derzeit erschöpft.'
  if (error?.code === 'storage/canceled') return 'Der Upload wurde abgebrochen.'
  return action === 'load' ? 'Die Unterschrift konnte nicht geladen werden.' : 'Die Unterschrift konnte nicht gespeichert werden.'
}
