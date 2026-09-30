import { Buffer } from 'node:buffer'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'

const limits = {
  legalName: 200, tradeName: 200, legalForm: 80, managingDirector: 200,
  street: 200, postalCode: 24, city: 120, country: 120,
  phone: 80, fax: 80, email: 320, billingEmail: 320, website: 320, contactPerson: 200,
  registerCourt: 120, registerNumber: 120, vatId: 80, taxNumber: 80,
  bankName: 160, iban: 80, bic: 40,
}

export function validateCompanyMasterData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !(key in limits))) throw new HttpsError('invalid-argument', 'Ungültige Firmenstammdaten.')
  const company = {}
  for (const [key, limit] of Object.entries(limits)) {
    const item = value[key]
    if (typeof item !== 'string' || item.length > limit) throw new HttpsError('invalid-argument', `Ungültiger Wert für ${key}.`)
    company[key] = item.trim()
  }
  if (!company.legalName) throw new HttpsError('invalid-argument', 'Die Firmierung ist erforderlich.')
  for (const key of ['email', 'billingEmail']) {
    if (company[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company[key])) throw new HttpsError('invalid-argument', `Ungültige E-Mail-Adresse für ${key}.`)
  }
  return company
}

export async function updateCompanyMasterDataHandler(request) {
  await requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Keine Berechtigung für Firmenstammdaten.')
  const company = validateCompanyMasterData(request.data?.company)
  await getFirestore().doc('appSettings/companyMasterData').set({ ...company, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid })
  return { success: true }
}

const stampPath = 'company-assets/stamp'
const maxStampSize = 2 * 1024 * 1024

function stampContentType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  return ''
}

export function validateCompanyStamp(value) {
  if (!value || typeof value !== 'object' || !['image/jpeg', 'image/png'].includes(value.contentType) || typeof value.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64)) {
    throw new HttpsError('invalid-argument', 'Bitte eine gültige JPG- oder PNG-Datei auswählen.')
  }
  const bytes = Buffer.from(value.base64, 'base64')
  if (!bytes.length || bytes.length > maxStampSize || stampContentType(bytes) !== value.contentType) throw new HttpsError('invalid-argument', 'Der Stempel muss ein JPG oder PNG mit maximal 2 MB sein.')
  return { bytes, contentType: value.contentType }
}

export async function getCompanyStampHandler(request) {
  await requireActiveProfile(request)
  const file = getStorage().bucket().file(stampPath)
  const [exists] = await file.exists()
  if (!exists) return { exists: false }
  const [bytes] = await file.download()
  const contentType = stampContentType(bytes)
  if (!contentType || bytes.length > maxStampSize) throw new HttpsError('internal', 'Der Firmenstempel ist nicht verfügbar.')
  return { exists: true, contentType, base64: bytes.toString('base64') }
}

export async function saveCompanyStampHandler(request) {
  await requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Keine Berechtigung für den Firmenstempel.')
  const { bytes, contentType } = validateCompanyStamp(request.data)
  await getStorage().bucket().file(stampPath).save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'no-store' } })
  return { success: true }
}

export async function deleteCompanyStampHandler(request) {
  await requireRole(await requireActiveProfile(request), ['admin', 'superadmin'], 'Keine Berechtigung für den Firmenstempel.')
  const file = getStorage().bucket().file(stampPath)
  const [exists] = await file.exists()
  if (exists) await file.delete()
  return { success: true }
}
