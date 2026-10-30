import { extractPdfWithOcr } from './pdfOcr.js'
import { statusMailAiApiKey } from './statusMailAi.js'
import { Buffer } from 'node:buffer'
import { businessPartnerRoles } from './shared/businessPartnerRoles.js'
import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { analyzeMailboxAgbText } from './agbChecker.js'

const fail = (code, message) => { throw new HttpsError(code, message) }
export function assertMailboxAgbAccess(context) {
  if (context.profile?.active !== true || !(context.profile.role === 'superadmin' || ['view', 'edit'].includes(context.profile.permissions?.agbChecker))) fail('permission-denied', 'Keine Berechtigung für den AGB-Prüfer.')
}
export function validateAgbAttachments(list, purpose = 'AGB-Prüfung') {
  if (list?.['@odata.nextLink']) fail('failed-precondition', 'Die Anhangsliste ist unvollständig. Es wurde keine Prüfung gestartet.')
  const files = (list?.value || []).filter(file => file.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name || ''))
  if (!files.length) fail('failed-precondition', `Diese Mail enthält keine PDF-Anhänge für die ${purpose}.`)
  if (files.length > 20 || files.some(file => file['@odata.type'] !== '#microsoft.graph.fileAttachment' || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) fail('failed-precondition', 'Die vollständige Prüfung unterstützt höchstens 20 PDFs, je 5 MB und zusammen 20 MB. Es wurde kein Anhang ausgelassen und keine Prüfung gestartet.')
  return files
}
export async function analyzeMailboxAgb({ db, context, files, now, extract = extractPdfWithOcr, analyze = analyzeMailboxAgbText }) {
  assertMailboxAgbAccess(context)
  const quota = db.doc(`mailboxTrackingQuotas/agb-${createHash('sha256').update(context.uid).digest('hex')}`)
  await db.runTransaction(async tx => {
    const previous = (await tx.get(quota)).data() || {}
    const windowStart = Math.floor(now / 3600000) * 3600000
    const count = previous.windowStart === windowStart ? previous.count || 0 : 0
    if (count >= 20) fail('resource-exhausted', 'Höchstens 20 AGB-Prüfungen pro Stunde möglich.')
    tx.set(quota, { windowStart, count: count + 1, expiresAt: windowStart + 7200000 })
  })
  let text = '', pageCount = 0
  const sourceFiles = []
  const ocrCache = new Map()
  for (const file of files) {
    let result
    try { result = await extract(new Uint8Array(Buffer.from(file.contentBytes, 'base64')), { actorId: context.uid, fileName: file.name, cache: ocrCache, ...(extract === extractPdfWithOcr ? { apiKey: statusMailAiApiKey.value() } : {}) }) }
    catch { fail('failed-precondition', 'Mindestens eine PDF ist geschützt, auch mit OCR nicht lesbar oder zu umfangreich. Die Prüfung wurde nicht gespeichert. Bitte die Originale prüfen.') }
    pageCount += result.pageCount
    text += `\n\n[Datei: ${file.name}]\n${result.text}`
    if (pageCount > 100 || text.length > 160000) fail('failed-precondition', 'Die PDFs überschreiten zusammen 100 Seiten oder den auswertbaren Textumfang. Es wurde keine Teilprüfung gespeichert.')
    sourceFiles.push({ name: file.name, pageCount: result.pageCount, ocrPages: result.ocrPages || [], ocrUncertainPages: result.ocrUncertainPages || [] })
  }
  return analyze({ userId: context.uid, text, pageCount, sourceFiles, apiKey: analyze === analyzeMailboxAgbText ? statusMailAiApiKey.value() : undefined })
}

export async function assignMailboxAgbCustomer({ db, context, data }) {
  assertMailboxAgbAccess(context)
  if (!(context.profile.role === 'superadmin' || ['view', 'edit'].includes(context.profile.permissions?.masterData))) fail('permission-denied', 'Keine Berechtigung für Stammdaten.')
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
  if (!validId(data.historyId) || !validId(data.partnerId) || typeof data.debtorNumber !== 'string' || data.debtorNumber.length > 80) fail('invalid-argument', 'Bitte einen gültigen Kunden auswählen.')
  return db.runTransaction(async tx => {
    const entry = db.doc(`agbCheckerHistory/${data.historyId}`)
    const partnerRef = db.doc(`businessPartners/${data.partnerId}`)
    const history = (await tx.get(entry)).data()
    const partner = (await tx.get(partnerRef)).data()
    if (!history || history.createdByUserId !== context.uid || history.channel !== 'personal_mailbox') fail('permission-denied', 'Diese Prüfung kann nicht zugeordnet werden.')
    const references = [partner?.debtorNumber, ...(partner?.dycosReferences?.debtorNumbers || [])].map(number => String(number ?? '').trim()).filter(Boolean)
    if (!partner || !businessPartnerRoles(partner).customer || partner.mergedIntoPartnerId || partner.status === 'merged' || !references.includes(data.debtorNumber)) fail('failed-precondition', 'Die Debitorennummer gehört nicht zu diesem Kunden.')
    const customerAssignment = { partnerId: data.partnerId, debtorNumber: data.debtorNumber, name: partner.companyName || '', assignedBy: context.uid }
    tx.update(entry, { customerAssignment })
    return { customerAssignment }
  })
}
