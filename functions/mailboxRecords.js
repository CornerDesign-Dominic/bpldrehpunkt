import { randomBytes } from 'node:crypto'
import { FieldValue, FieldPath } from 'firebase-admin/firestore'
import { mailboxRecordKinds, recordInvoices, recordValues } from './shared/mailboxRecordFields.js'
import { inkassoPartnerSnapshot } from './inkassoCases.js'
import { extractRecordSources, inferMailboxRecord } from './mailboxRecordAi.js'
import { actorName, assertRecordAccess, assertRecordPath, assertTodoMutation, canModule, canReadRecord, cleanSegment, newRecordData, patchRecordData, recordFail, recordHash, recordVersion, scoreRecord } from './mailboxRecordData.js'

const messageKey = (actor, id) => recordHash(`${actor.connection.tenantId || ''}|${actor.connection.graphUserId}|${id}`)
const configOf = kind => mailboxRecordKinds[kind] || recordFail('invalid-argument', 'Ungültige Aktion.')
const stamp = () => FieldValue.serverTimestamp()
const sourceFields = (kind, data) => Object.fromEntries(mailboxRecordKinds[kind].fields.map(field => [field.key, data[field.key] ?? '']))
function publicTarget(kind, snapshot, analysis, actor) {
  const data = snapshot.data()
  return { path: snapshot.ref.path, id: snapshot.id, title: data.title || data.caseNumber || 'Ohne Titel', caseNumber: data.caseNumber || '', status: data.status || '', canUpdate: kind !== 'todo' || (actor.profile.role === 'superadmin' || data.creatorUserId === actor.uid) && ['open', 'in_progress'].includes(data.status), canClose: kind !== 'todo' || data.assignedUserId === actor.uid && ['open', 'in_progress'].includes(data.status), linkedDebtor: Boolean(data.debtorPartnerId), values: sourceFields(kind, data), version: recordVersion(kind, data), ...(analysis ? scoreRecord(kind, data, analysis) : {}) }
}
async function editableCalendars(db, actor) {
  const permission = await db.collection('calendarPermissions').where('userId', '==', actor.uid).get()
  const grants = new Set(permission.docs.filter(doc => doc.data().level === 'edit').map(doc => doc.data().calendarId))
  const calendars = await db.collection('calendars').get()
  const result = calendars.docs.filter(doc => doc.data().active !== false && !doc.id.startsWith('system-') && (actor.profile.role === 'superadmin' || doc.data().ownerUserId === actor.uid || grants.has(doc.id))).map(doc => ({ id: doc.id, name: doc.data().name || doc.id }))
  if (!result.some(calendar => calendar.id === `personal-${actor.uid}`) && !calendars.docs.some(doc => doc.id === `personal-${actor.uid}`)) result.unshift({ id: `personal-${actor.uid}`, name: 'Mein Kalender' })
  return result
}
export async function searchRecordTargets({ db, actor, kind, data = {}, analysis = null }) {
  assertRecordAccess(actor, kind)
  const config = configOf(kind)
  const search = typeof data.search === 'string' ? data.search.trim().toLowerCase() : ''
  if (search.length > 200) recordFail('invalid-argument', 'Suchtext ist zu lang.')
  const calendars = kind === 'calendar' ? await editableCalendars(db, actor) : []
  let collection = config.collection
  if (kind === 'calendar') {
    const selected = data.calendarId || `personal-${actor.uid}`
    if (!calendars.some(calendar => calendar.id === selected)) recordFail('permission-denied', 'Kein Bearbeitungsrecht für diesen Kalender.')
    collection = `calendars/${selected}/events`
  }
  if (data.cursor && !cleanSegment(data.cursor)) recordFail('invalid-argument', 'Ungültige Folgeseite.')
  const query = db.collection(collection).orderBy(FieldPath.documentId()).limit(100)
  const snapshot = await (data.cursor ? query.startAfter(data.cursor) : query).get()
  const records = snapshot.docs.filter(doc => canReadRecord(actor, kind, doc.data())).map(doc => publicTarget(kind, doc, analysis, actor)).filter(record => !search || [record.title, record.caseNumber, ...Object.values(record.values)].join(' ').toLowerCase().includes(search))
  return { records, calendars, nextCursor: snapshot.docs.length === 100 ? snapshot.docs.at(-1).id : null, limited: snapshot.docs.length === 100 }
}
export async function previewMailboxRecord({ db, actor, kind, messageId, mail, files, apiKey, now = Date.now(), extract = extractRecordSources, infer = inferMailboxRecord }) {
  assertRecordAccess(actor, kind)
  const quota = db.doc(`mailboxRecordQuotas/${recordHash(actor.uid)}`)
  await db.runTransaction(async tx => {
    const previous = (await tx.get(quota)).data() || {}
    const windowStart = Math.floor(now / 3600000) * 3600000
    const count = previous.windowStart === windowStart ? previous.count || 0 : 0
    if (count >= 20) recordFail('resource-exhausted', 'Höchstens 20 Vorgangsauswertungen pro Stunde möglich.')
    tx.set(quota, { windowStart, count: count + 1, expiresAt: windowStart + 7200000 })
  })
  const extracted = await extract({ mail, files, actorId: actor.uid, apiKey })
  const analysis = await infer({ kind, sources: extracted.sources, actorId: actor.uid, apiKey })
  const candidates = []
  let cursor, limited = false, calendars = []
  // Bounded server-side matching; manual selection can page through the full list.
  const selectedCalendars = kind === 'calendar' ? await editableCalendars(db, actor) : [null]
  if (selectedCalendars.length > 20) limited = true
  for (const calendar of selectedCalendars.slice(0, 20)) {
    cursor = null
    for (let page = 0; page < 5; page++) {
      const batch = await searchRecordTargets({ db, actor, kind, data: { cursor, ...(calendar ? { calendarId: calendar.id } : {}) }, analysis })
      calendars = batch.calendars
      candidates.push(...batch.records.filter(record => record.score > 0))
      cursor = batch.nextCursor
      if (!cursor) break
    }
    limited ||= Boolean(cursor)
  }
  const previewId = randomBytes(24).toString('hex')
  const source = { subject: String(mail.subject || '').slice(0, 1000), receivedDateTime: mail.receivedDateTime || '', webLink: typeof mail.webLink === 'string' && /^https:\/\/outlook\.(office\.com|office365\.com|live\.com)\//i.test(mail.webLink) ? mail.webLink : '', files: extracted.sourceFiles }
  const result = { previewId, kind, values: analysis.values, evidence: analysis.evidence, invoices: analysis.invoices || [], summary: analysis.summary, sourceFiles: extracted.sourceFiles, warnings: [...extracted.warnings, ...analysis.warnings], candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 12), matchingLimited: limited, calendars }
  await db.doc(`mailboxRecordPreviews/${previewId}`).set({ ...result, ownerId: actor.uid, connectionId: actor.connectionId, messageKey: messageKey(actor, messageId), source, createdAt: now, expiresAt: now + 86400000 })
  return result
}
export async function applyMailboxRecord({ db, actor, data, now = Date.now() }) {
  const { kind, previewId, mode } = data
  const config = configOf(kind)
  assertRecordAccess(actor, kind)
  if (!/^[a-f0-9]{48}$/.test(previewId || '') || !['create', 'update', 'note', 'close'].includes(mode)) recordFail('invalid-argument', 'Ungültige Übernahme.')
  if (!Array.isArray(data.selectedFields) || data.selectedFields.some(key => !config.fields.some(field => field.key === key))) recordFail('invalid-argument', 'Ungültige Feldauswahl.')
  const selected = new Set(data.selectedFields)
  let values
  let invoices = []
  try { values = ['create', 'update'].includes(mode) ? recordValues(kind, data.values, { required: mode === 'create' }) : {} } catch (error) { recordFail('invalid-argument', error.message) }
  if (kind === 'collection' && ['create', 'update'].includes(mode)) { try { invoices = recordInvoices(data.invoices) } catch (error) { recordFail('invalid-argument', error.message) } }
  const note = typeof data.note === 'string' ? data.note.trim() : ''
  if (note.length > 3000 || note.includes('\0')) recordFail('invalid-argument', 'Der Hinweis ist zu lang oder ungültig.')
  const requested = { kind, mode, values, invoices, selectedFields: [...selected].sort(), note, targetPath: mode === 'create' ? null : data.targetPath || null, calendarId: data.calendarId || null, partnerId: data.partnerId || null, partnerRole: data.partnerRole || null }
  const fingerprint = recordHash(requested)
  const previewRef = db.doc(`mailboxRecordPreviews/${previewId}`)
  const receiptRef = db.doc(`mailboxRecordApplications/${previewId}`)
  return db.runTransaction(async tx => {
    const [previewSnapshot, receiptSnapshot, profileSnapshot, connectionSnapshot] = await Promise.all([tx.get(previewRef), tx.get(receiptRef), tx.get(db.doc(`users/${actor.uid}`)), tx.get(actor.ref)])
    const live = { ...actor, profile: profileSnapshot.data() }
    if (!live.profile) recordFail('permission-denied', 'Das Benutzerprofil ist nicht verfügbar.')
    assertRecordAccess(live, kind)
    if (!canModule(live, 'mailboxes', true) || connectionSnapshot.data()?.ownerId !== actor.uid || connectionSnapshot.data()?.status !== 'connected') recordFail('permission-denied', 'Kein Zugriff auf dieses Postfach.')
    if (actor.credential) {
      const parent = (await tx.get(actor.credential.ref)).data()
      if (parent?.ownerId !== actor.uid || parent.status !== 'connected' || connectionSnapshot.data().parentConnectionId !== actor.credential.connectionId) recordFail('permission-denied', 'Die persönliche Postfachverbindung ist nicht mehr verfügbar.')
    }
    const preview = previewSnapshot.data()
    if (!preview || preview.ownerId !== actor.uid || preview.connectionId !== actor.connectionId || preview.kind !== kind || preview.messageKey !== messageKey(actor, data.messageId) || preview.expiresAt <= now) recordFail('permission-denied', 'Diese Auswertung ist nicht verfügbar oder gehört zu einer anderen Mail.')
    if (receiptSnapshot.exists) {
      const receipt = receiptSnapshot.data()
      if (receipt.fingerprint !== fingerprint) recordFail('already-exists', 'Diese Auswertung wurde bereits anders übernommen.')
      return receipt.result
    }
    if (!preview.actionJobId || !/^mailboxActionScopes\/[a-f0-9]{64}\/actions\/[a-f0-9]{64}$/.test(preview.actionSlotPath || '')) recordFail('failed-precondition', 'Die Auswertung ist noch nicht zur Übernahme bereit.')
    const slotRef = db.doc(preview.actionSlotPath)
    const slot = (await tx.get(slotRef)).data()
    if (slot?.jobId !== preview.actionJobId || slot.state !== 'review' || slot.kind !== kind || slot.result?.previewId !== previewId) recordFail('aborted', 'Die Auswertung wurde inzwischen verworfen, ersetzt oder übernommen.')
    if (preview.warnings.length && data.acceptWarnings !== true) recordFail('failed-precondition', 'Bitte die Hinweise zu Quellen und Anhängen zuerst bestätigen.')
    const year = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(new Date(now))
    const counterRef = mode === 'create' && config.counter ? db.doc(`${config.counter}/${year}`) : null
    const counter = counterRef ? (await tx.get(counterRef)).data() : null
    let sequence = 0, caseNumber = '', partner = null
    if (counterRef) {
      if (kind === 'collection' && counter && (!Number.isSafeInteger(counter.lastNumber) || counter.lastNumber < 1)) recordFail('failed-precondition', 'Der Jahreszähler für Inkasso ist ungültig.')
      if (kind === 'collection' && !counter) {
        const previousCases = await tx.get(db.collection(config.collection).where('caseNumber', '>=', `I-${year}-`).where('caseNumber', '<', `I-${year}.`))
        sequence = previousCases.docs.reduce((highest, entry) => Math.max(highest, Number(entry.data().caseNumber.split('-').at(-1)) || 0), 0)
      } else sequence = Number(kind === 'collection' ? counter?.lastNumber : counter?.nextNumber) || 0
      if (!Number.isSafeInteger(sequence) || sequence < 0) recordFail('failed-precondition', 'Der Jahreszähler ist ungültig.')
      sequence++
      if (!Number.isSafeInteger(sequence) || sequence > (kind === 'collection' ? 9_000_000_000_000_000 : 9999)) recordFail('resource-exhausted', 'Der Jahreszähler ist ausgeschöpft.')
      caseNumber = `${config.prefix}-${year}-${kind === 'collection' ? sequence : String(sequence).padStart(4, '0')}`
    }
    if (kind === 'collection' && mode === 'create') {
      if (!canModule(live, 'masterData') || !cleanSegment(data.partnerId) || !['customer', 'carrier'].includes(data.partnerRole)) recordFail('invalid-argument', 'Bitte ein verfügbares Unternehmen aus den Stammdaten auswählen.')
      const snapshot = await tx.get(db.doc(`businessPartners/${data.partnerId}`))
      const details = inkassoPartnerSnapshot(snapshot.data(), data.partnerRole)
      if (!details) recordFail('failed-precondition', 'Das ausgewählte Unternehmen ist nicht verfügbar.')
      partner = { ...details, id: data.partnerId, role: data.partnerRole }
    }
    let targetRef, previous = null, calendarRef = null, calendar = null
    if (kind === 'calendar') {
      let calendarId = data.calendarId
      if (mode !== 'create') calendarId = assertRecordPath(kind, data.targetPath)[1]
      if (!cleanSegment(calendarId) || calendarId.startsWith('system-')) recordFail('invalid-argument', 'Bitte einen normalen Drehpunkt-Kalender auswählen.')
      calendarRef = db.doc(`calendars/${calendarId}`)
      calendar = (await tx.get(calendarRef)).data()
      const grant = (await tx.get(db.doc(`calendarPermissions/${calendarId}_${actor.uid}`))).data()
      const ownNew = !calendar && calendarId === `personal-${actor.uid}` && mode === 'create'
      if (!ownNew && (!calendar || calendar.active === false || !(live.profile.role === 'superadmin' || calendar.ownerUserId === actor.uid || grant?.level === 'edit'))) recordFail('permission-denied', 'Kein Bearbeitungsrecht für diesen Kalender.')
      targetRef = db.doc(mode === 'create' ? `${calendarRef.path}/events/${previewId}` : data.targetPath)
    } else {
      if (mode !== 'create') assertRecordPath(kind, data.targetPath)
      targetRef = db.doc(mode === 'create' ? `${config.collection}/${kind === 'court' ? caseNumber : previewId}` : data.targetPath)
    }
    const targetSnapshot = await tx.get(targetRef)
    if (mode !== 'create') {
      previous = targetSnapshot.data()
      if (!previous || !canReadRecord(live, kind, previous)) recordFail('permission-denied', 'Der ausgewählte Eintrag ist nicht verfügbar.')
      if (recordVersion(kind, previous) !== data.targetVersion) recordFail('aborted', 'Der Eintrag wurde inzwischen geändert. Bitte erneut auswählen und vergleichen.')
      if (kind === 'todo') assertTodoMutation(live, previous, mode)
    } else if (targetSnapshot.exists) recordFail('already-exists', 'Der Zieleintrag existiert bereits.')
    const timestamp = stamp()
    const existingInvoices = kind === 'collection' && mode === 'update' && invoices.length ? (await tx.get(db.collection(`${targetRef.path}/invoices`))).docs.map(item => item.data()) : []
    if (invoices.some(invoice => existingInvoices.some(existing => String(existing.invoiceNumber || '').toLowerCase().replace(/\s+/g, '') === invoice.invoiceNumber.toLowerCase().replace(/\s+/g, '')))) recordFail('failed-precondition', 'Mindestens eine Rechnung ist in diesem Inkassofall bereits vorhanden. Bitte diese Zeile abwählen; bestehende Rechnungsbeträge werden direkt im Inkassofall bearbeitet.')
    const changes = Object.fromEntries(config.fields.filter(field => selected.has(field.key)).map(field => [field.key, values[field.key] ?? (field.type === 'textarea' || ['todo', 'calendar'].includes(kind) ? '' : null)]))
    if (kind === 'collection' && mode === 'update' && (selected.has('claimAmount') || selected.has('invoiceNumbers'))) recordFail('invalid-argument', 'Rechnungen und Forderungsbeträge bitte über die einzelnen Rechnungszeilen übernehmen.')
    if (mode === 'update' && (selected.has('deadlineTime') || selected.has('deadlineNote')) && !selected.has('deadlineDate')) recordFail('invalid-argument', 'Bitte zur neuen Frist auch das Datum zur Übernahme auswählen.')
    if (mode === 'update' && !selected.size && !invoices.length) recordFail('invalid-argument', 'Bitte mindestens ein Feld übernehmen oder „Nur dokumentieren“ auswählen.')
    if (mode === 'update' && ['todo', 'calendar'].includes(kind)) {
      try { recordValues(kind, { ...previous, ...changes }, { required: true }) } catch (error) { recordFail('invalid-argument', error.message) }
    }
    const sourceNote = [(note || preview.summary).slice(0, 3000), `Mail: ${preview.source.subject.slice(0, 200)}`, preview.source.webLink, preview.source.files.length ? `Anhänge: ${preview.source.files.length} (Details im gespeicherten Mailergebnis).` : '', 'KI-Vorschlag durch Nutzer bestätigt.'].filter(Boolean).join('\n\n')
    const document = mode === 'create' ? newRecordData(kind, values, { actor: live, stamp: timestamp, caseNumber, sequence, year, partner }) : patchRecordData(kind, previous, changes, { mode, actor: live, stamp: timestamp, note: sourceNote })
    if (kind === 'collection' && mode === 'create') { document.claimAmount = invoices.length ? invoices.reduce((sum, invoice) => sum + invoice.grossAmount, 0) : null; document.invoiceNumbers = invoices.length ? invoices.map(invoice => invoice.invoiceNumber).join(', ') : null }
    if (kind === 'collection' && mode === 'update' && invoices.length) { document.claimAmount = Number(previous.claimAmount ?? existingInvoices.filter(invoice => !invoice.isPaid).reduce((sum, invoice) => sum + Number(invoice.grossAmount || 0), 0)) + invoices.reduce((sum, invoice) => sum + invoice.grossAmount, 0); document.invoiceNumbers = [...existingInvoices.map(invoice => invoice.invoiceNumber), ...invoices.map(invoice => invoice.invoiceNumber)].join(', ') }
    if (kind === 'collection' && document.claimAmount !== undefined && document.claimAmount !== null && (!Number.isFinite(document.claimAmount) || document.claimAmount < 0)) recordFail('invalid-argument', 'Die Forderungssumme ist ungültig. Bitte den bestehenden Inkassofall prüfen.')
    if (kind === 'calendar' && mode === 'create') {
      document.description = [document.description, `Mail: ${preview.source.subject}`, preview.source.webLink].filter(Boolean).join('\n\n')
      if (document.description.length > 4000 || document.title.length > 160) recordFail('invalid-argument', 'Titel oder Beschreibung des Termins ist zu lang.')
    }
    if (counterRef) tx.set(counterRef, { year: kind === 'collection' ? Number(year) : year, [kind === 'collection' ? 'lastNumber' : 'nextNumber']: sequence, updatedAt: timestamp }, { merge: true })
    if (kind === 'calendar' && !calendar) tx.set(calendarRef, { name: 'Mein Kalender', color: '#c99a3d', kind: 'personal', ownerUserId: actor.uid, active: true, createdAt: timestamp, updatedAt: timestamp })
    if (mode === 'create') tx.create(targetRef, document)
    else tx.update(targetRef, document)
    invoices.forEach((invoice, index) => tx.create(db.doc(`${targetRef.path}/invoices/${previewId}-${index}`), { ...invoice, isPaid: false, paidAt: null, paidBy: null, paidByName: null, createdAt: timestamp, createdBy: actor.uid, createdByName: actorName(live) }))
    if (kind !== 'calendar') {
      const chunks = sourceNote.match(/[\s\S]{1,900}/gu) || []
      chunks.forEach((text, index) => tx.set(db.doc(`${targetRef.path}/updates/${previewId}-${index}`), { type: 'note', text: chunks.length > 1 ? `Mailübernahme (${index + 1}/${chunks.length})\n${text}` : text, createdByUserId: actor.uid, createdByName: actorName(live), createdAt: timestamp }))
    }
    const deadline = mode === 'create' ? values : changes
    if (['damage', 'collection', 'court'].includes(kind) && deadline.deadlineDate && ['create', 'update'].includes(mode)) tx.set(db.doc(`${targetRef.path}/deadlines/${previewId}`), { ...(kind === 'court' ? { type: 'deadline' } : {}), date: deadline.deadlineDate, time: deadline.deadlineTime || null, note: deadline.deadlineNote || '', reminderEnabled: false, reminderRecipientEmail: live.profile.email || '', createdAt: timestamp, createdBy: actor.uid, createdByName: actorName(live), updatedAt: timestamp, updatedBy: actor.uid, updatedByName: actorName(live) })
    const acceptedValues = Object.fromEntries(config.fields.filter(field => (mode === 'create' || mode === 'update') && field.key.startsWith('deadline') ? Boolean(deadline.deadlineDate) && Object.hasOwn(deadline, field.key) : Object.hasOwn(document, field.key)).map(field => [field.key, field.key.startsWith('deadline') ? deadline[field.key] : document[field.key]]))
    const result = { targetPath: targetRef.path, id: targetRef.id, title: document.title || previous?.title || caseNumber, mode, kind, href: kind === 'calendar' ? '/kalender' : `${config.route}${encodeURIComponent(targetRef.id)}`, invoices, acceptedValues, beforeValues: previous ? sourceFields(kind, previous) : null, note: (note || preview.summary).slice(0, 3000) }
    tx.create(receiptRef, { ownerId: actor.uid, connectionId: actor.connectionId, previewId, jobId: preview.actionJobId, kind, mode, fingerprint, result, source: preview.source, messageKey: preview.messageKey, evidence: preview.evidence, beforeValues: result.beforeValues, acceptedValues, origin: 'KI', confirmedByUserId: actor.uid, appliedAt: timestamp })
    tx.update(slotRef, { state: 'completed', completion: result, updatedAt: now })
    return result
  })
}
