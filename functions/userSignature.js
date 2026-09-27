import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const maxSignatureSize = 2 * 1024 * 1024

export async function getOwnSignatureHandler(request) {
  await requireActiveProfile(request)

  // Only the authenticated user's fixed object path can be read. The client
  // cannot provide a UID or an arbitrary Storage path.
  const file = getStorage().bucket().file(`user-signatures/${request.auth.uid}/signature.jpg`)
  let bytes
  try {
    ;[bytes] = await file.download()
  } catch (error) {
    if (Number(error?.code) === 404 || Number(error?.response?.statusCode) === 404) return { exists: false }
    throw error
  }

  if (!bytes.length || bytes.length > maxSignatureSize || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new HttpsError('internal', 'Die persönliche Unterschrift ist nicht verfügbar.')
  }
  return { exists: true, contentType: 'image/jpeg', base64: bytes.toString('base64') }
}
