import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const region = 'europe-west3'
const maximumInvoiceCount = 50
const maximumCounterValue = 9_000_000_000_000_000

const cleanText = (value) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value, maximumLength, label) => {
  const text = cleanText(value)
  if (text.length > maximumLength) throw new HttpsError('invalid-argument', `${label} ist zu lang.`)
  return text || null
}

function amount(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new HttpsError('invalid-argument', `${label} muss eine nicht negative Zahl sein.`)
  return number
}

function invoicesFrom(data) {
  if (!Array.isArray(data)) return []
  if (data.length > maximumInvoiceCount) throw new HttpsError('invalid-argument', `Es können höchstens ${maximumInvoiceCount} Rechnungen gleichzeitig erfasst werden.`)
  return data.map((entry) => {
    const invoiceNumber = optionalText(entry?.invoiceNumber, 240, 'Die Rechnungsnummer')
    if (!invoiceNumber) throw new HttpsError('invalid-argument', 'Bitte je Rechnung Nummer, Nettobetrag und USt.-Betrag erfassen.')
    const netAmount = amount(entry?.netAmount, 'Der Nettobetrag')
    const vatAmount = amount(entry?.vatAmount, 'Der USt.-Betrag')
    return { invoiceNumber, netAmount, vatAmount, grossAmount: netAmount + vatAmount }
  })
}

function inkassoPermission(profile) {
  return profile?.role === 'superadmin' || profile?.permissions?.inkasso === 'edit'
}

async function actor(request) {
  const profile = await requireActiveProfile(request)
  if (!inkassoPermission(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zum Anlegen von Inkassofällen.')
  const name = [profile.firstName, profile.lastName].filter((value) => typeof value === 'string' && value.trim()).join(' ').trim()
  return { id: request.auth.uid, name: name || profile.email || 'Unbekannt' }
}

function berlinYear() {
  return new Intl.DateTimeFormat('de-DE', { year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date())
}

function highestIssuedNumber(cases, year) {
  const numberPattern = new RegExp(`^I-${year}-(\\d+)$`)
  return cases.docs.reduce((highest, entry) => {
    const match = numberPattern.exec(entry.data().caseNumber)
    const number = match ? Number(match[1]) : 0
    return Number.isSafeInteger(number) ? Math.max(highest, number) : highest
  }, 0)
}

function optionalPartnerId(value) {
  const id = cleanText(value)
  if (id.includes('/')) throw new HttpsError('invalid-argument', 'Der ausgewählte Geschäftspartner ist ungültig.')
  return id || null
}

function optionalPartnerRole(value) {
  const role = cleanText(value)
  if (role && !['customer', 'carrier'].includes(role)) throw new HttpsError('invalid-argument', 'Die Rolle des ausgewählten Geschäftspartners ist ungültig.')
  return role || null
}

export const createInkassoCase = onCall({ region, enforceAppCheck: true }, async (request) => {
  const currentActor = await actor(request)
  const data = request.data || {}
  const title = optionalText(data.title, 500, 'Die Fallbezeichnung')
  if (!title) throw new HttpsError('invalid-argument', 'Bitte eine Fallbezeichnung eingeben.')

  const description = optionalText(data.description, 4000, 'Die Beschreibung')
  const collectionAgency = optionalText(data.collectionAgency, 240, 'Das Inkassounternehmen')
  const collectionReference = optionalText(data.collectionReference, 240, 'Das Aktenzeichen des Inkassounternehmens')
  const debtorPartnerId = optionalPartnerId(data.debtorPartnerId)
  const debtorPartnerRole = optionalPartnerRole(data.debtorPartnerRole)
  const invoices = invoicesFrom(data.invoices)
  const year = berlinYear()
  const database = getFirestore()
  const counterRef = database.doc(`inkassoCaseCounters/${year}`)
  const caseRef = database.collection('inkassoCases').doc()

  await database.runTransaction(async (transaction) => {
    const counter = await transaction.get(counterRef)
    let lastNumber
    if (counter.exists) {
      lastNumber = counter.data().lastNumber
      if (!Number.isSafeInteger(lastNumber) || lastNumber < 1) throw new HttpsError('failed-precondition', 'Der Jahreszähler für Inkassofälle ist ungültig.')
    } else {
      const currentYearCases = await transaction.get(database.collection('inkassoCases')
        .where('caseNumber', '>=', `I-${year}-`)
        .where('caseNumber', '<', `I-${year}.`))
      lastNumber = highestIssuedNumber(currentYearCases, year)
    }
    if (lastNumber >= maximumCounterValue) throw new HttpsError('resource-exhausted', 'Der Jahreszähler für Inkassofälle ist ausgeschöpft.')

    let debtorName = null
    let debtorNumber = null
    if (debtorPartnerId) {
      const partner = await transaction.get(database.doc(`businessPartners/${debtorPartnerId}`))
      const partnerData = partner.data()
      const partnerNumber = debtorPartnerRole === 'customer' ? partnerData?.debtorNumber : partnerData?.creditorNumber
      if (!partner.exists || !debtorPartnerRole || typeof partnerData?.companyName !== 'string' || !partnerData.companyName.trim() || typeof partnerNumber !== 'string' || !partnerNumber.trim()) {
        throw new HttpsError('invalid-argument', 'Der ausgewählte Geschäftspartner ist nicht verfügbar.')
      }
      debtorName = partnerData.companyName.trim()
      debtorNumber = partnerNumber.trim()
    }

    const nextNumber = lastNumber + 1
    const caseNumber = `I-${year}-${nextNumber}`
    const claimAmount = invoices.length ? invoices.reduce((total, invoice) => total + invoice.grossAmount, 0) : null
    const invoiceNumbers = invoices.length ? invoices.map((invoice) => invoice.invoiceNumber).join(', ') : null
    const metadata = {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: currentActor.id,
      createdByName: currentActor.name,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: currentActor.id,
      updatedByName: currentActor.name,
    }

    transaction.set(caseRef, {
      caseNumber,
      title,
      description,
      collectionAgency,
      collectionReference,
      status: 'open',
      isClosed: false,
      debtorName,
      debtorPartnerId,
      debtorPartnerRole,
      debtorNumber,
      debtorContactName: null,
      debtorAddress: null,
      debtorEmail: null,
      debtorPhone: null,
      responsibleUserId: null,
      responsibleUserName: null,
      invoiceNumbers,
      claimAmount,
      paidAmount: 0,
      invoiceDate: null,
      originalDueDate: null,
      lastReminderDate: null,
      lawFirm: null,
      lawyerReference: null,
      lawFirmContactName: null,
      lawFirmEmail: null,
      lawFirmPhone: null,
      lawyerHandoverDate: null,
      court: null,
      courtReference: null,
      paymentOrderDate: null,
      enforcementOrderDate: null,
      titleAvailable: false,
      completedAt: null,
      ...metadata,
    })
    invoices.forEach((invoice) => transaction.set(caseRef.collection('invoices').doc(), {
      ...invoice,
      isPaid: false,
      paidAt: null,
      paidBy: null,
      paidByName: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: currentActor.id,
      createdByName: currentActor.name,
    }))
    transaction.set(counterRef, {
      year: Number(year),
      lastNumber: nextNumber,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })

  return { caseId: caseRef.id }
})
