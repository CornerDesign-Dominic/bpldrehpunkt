import { randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'

export const KNOWLEDGE_COLLECTIONS = Object.freeze({ article: 'knowledgeArticles', rule: 'knowledgeRules' })
export const KNOWLEDGE_FIELDS = Object.freeze({
  article: ['title', 'process', 'topic', 'tags', 'situation', 'checks', 'action', 'cautions', 'responseTemplate', 'followUp', 'owner', 'status', 'lastReviewedDate', 'nextReviewDate', 'ruleIds'],
  rule: ['title', 'scope', 'provisions', 'avoid', 'exceptions', 'examples', 'audience', 'owner', 'status', 'lastReviewedDate', 'nextReviewDate'],
})
const invalid = (message = 'Ungültige Wissensdaten.') => { throw new HttpsError('invalid-argument', message) }
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const name = (profile, uid) => [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || uid

export function requireKnowledgeAccess(profile, edit = false, module = 'handbook') {
  if (profile?.active !== true || (profile.role !== 'superadmin' && !(edit ? ['edit'] : ['view', 'edit']).includes(profile.permissions?.[module]))) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Wissensbereich.')
}

function realDate(value) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) invalid('Ungültiges Kontrolldatum.')
}

export function normalizeKnowledgeInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(KNOWLEDGE_COLLECTIONS, data.kind)) invalid()
  if (Object.keys(data).some((key) => !['kind', 'id', 'expectedRevision', 'values'].includes(key))) invalid()
  const id = data.id ?? randomUUID()
  if (!validId(id) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) invalid()
  if (!data.values || typeof data.values !== 'object' || Array.isArray(data.values) || Object.keys(data.values).some((key) => !KNOWLEDGE_FIELDS[data.kind].includes(key))) invalid()
  const values = {}
  for (const key of KNOWLEDGE_FIELDS[data.kind]) {
    const value = Object.hasOwn(data.values, key) ? data.values[key] : key === 'ruleIds' ? [] : key === 'status' ? 'draft' : key === 'audience' ? 'general' : ''
    if (key === 'ruleIds') {
      if (!Array.isArray(value) || value.length > 50 || value.some((item) => !validId(item)) || new Set(value).size !== value.length) invalid('Ungültige Grundregel-Verknüpfung.')
      values[key] = [...value]
    } else {
      const limit = key === 'title' ? 200 : ['owner', 'process', 'topic'].includes(key) ? 500 : key === 'tags' ? 2000 : ['status', 'audience'].includes(key) ? 20 : key.endsWith('Date') ? 10 : 20000
      if (typeof value !== 'string' || value.length > limit) invalid(`Ungültiger Wert für ${key}.`)
      values[key] = value.trim()
    }
  }
  if (!values.title) invalid('Ein Titel ist erforderlich.')
  if (!['draft', 'valid', 'archived'].includes(values.status)) invalid('Ungültiger Wissensstatus.')
  if (data.kind === 'article' && !values.process) invalid('Ein Prozess ist erforderlich.')
  if (data.kind === 'rule' && !['general', 'customer', 'carrier', 'tax', 'lawyer', 'collection', 'other'].includes(values.audience)) invalid('Ungültige Zielgruppe.')
  if (values.status === 'valid' && (data.kind === 'article' ? !values.situation || !values.action : !values.scope || !values.provisions)) invalid('Gültige Artikel benötigen Situation und Vorgehen; gültige Grundregeln benötigen Geltungsbereich und Vorgaben.')
  realDate(values.lastReviewedDate); realDate(values.nextReviewDate)
  if (values.lastReviewedDate && values.nextReviewDate && values.nextReviewDate < values.lastReviewedDate) invalid('Die nächste Kontrolle darf nicht vor der letzten Kontrolle liegen.')
  return { kind: data.kind, id, expectedRevision: data.expectedRevision, values }
}

export async function persistKnowledgeRecord(db, input, actor) {
  const { kind, id, expectedRevision, values } = input
  const ref = db.doc(`${KNOWLEDGE_COLLECTIONS[kind]}/${id}`)
  return db.runTransaction(async (tx) => {
    const [current, user, ...rules] = await Promise.all([
      tx.get(ref), tx.get(db.doc(`users/${actor.uid}`)),
      ...(kind === 'article' ? values.ruleIds.map((ruleId) => tx.get(db.doc(`knowledgeRules/${ruleId}`))) : []),
    ])
    const profile = user.exists ? user.data() : null
    requireKnowledgeAccess(profile, true)
    if ((current.exists ? current.data().revision : 0) !== expectedRevision) throw new HttpsError('aborted', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden und abgleichen.')
    if (rules.some((rule) => !rule.exists)) throw new HttpsError('failed-precondition', 'Eine verknüpfte Grundregel existiert nicht mehr.')
    if (values.status === 'valid' && rules.some((rule) => rule.data().status !== 'valid')) throw new HttpsError('failed-precondition', 'Vor dem Gültigsetzen müssen alle verknüpften Grundregeln gültig sein. Bitte die Grundregeln prüfen oder die Verknüpfung entfernen.')
    const previous = current.exists ? current.data() : null
    const revision = expectedRevision + 1
    const now = FieldValue.serverTimestamp()
    const record = { ...values, revision, createdAt: previous?.createdAt ?? now, createdBy: previous?.createdBy ?? actor.uid, updatedAt: now, updatedBy: actor.uid, updatedByName: name(profile, actor.uid) }
    tx.set(ref, record)
    tx.create(ref.collection('revisions').doc(String(revision)), record)
    return { id, revision }
  })
}

export function normalizeKnowledgeGapUpdate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !['id', 'expectedRevision', 'status', 'articleId'].includes(key))) invalid()
  if (!validId(data.id) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 || !['open', 'in_progress', 'resolved', 'ignored'].includes(data.status)) invalid('Ungültige Wissenslücke.')
  const articleId = data.articleId ?? ''
  if (articleId !== '' && !validId(articleId)) invalid('Ungültige Artikelverknüpfung.')
  return { id: data.id, expectedRevision: data.expectedRevision, status: data.status, articleId }
}

export async function persistKnowledgeGapUpdate(db, input, actor) {
  const ref = db.doc(`knowledgeGaps/${input.id}`)
  return db.runTransaction(async (tx) => {
    const [current, user, article] = await Promise.all([
      tx.get(ref), tx.get(db.doc(`users/${actor.uid}`)), input.articleId ? tx.get(db.doc(`knowledgeArticles/${input.articleId}`)) : null,
    ])
    const profile = user.exists ? user.data() : null
    requireKnowledgeAccess(profile, true, 'knowledgeGaps')
    if (!current.exists) throw new HttpsError('not-found', 'Die Wissenslücke wurde nicht gefunden.')
    const previous = current.data()
    if (previous.revision !== input.expectedRevision) throw new HttpsError('aborted', 'Die Wissenslücke wurde inzwischen geändert. Bitte neu laden.')
    if (input.articleId && input.articleId !== previous.articleId) {
      requireKnowledgeAccess(profile)
      if (!article.exists) throw new HttpsError('failed-precondition', 'Der verknüpfte Handbuchartikel existiert nicht mehr.')
    }
    const revision = previous.revision + 1
    const now = FieldValue.serverTimestamp()
    const resolved = input.status === 'resolved'
    const alreadyResolved = previous.status === 'resolved'
    tx.set(ref, { ...previous, status: input.status, articleId: input.articleId, revision, updatedAt: now, updatedBy: actor.uid, updatedByName: name(profile, actor.uid),
      resolvedAt: resolved ? alreadyResolved && previous.resolvedAt ? previous.resolvedAt : now : null,
      resolvedBy: resolved ? alreadyResolved && previous.resolvedBy ? previous.resolvedBy : actor.uid : '',
      resolvedByName: resolved ? alreadyResolved && previous.resolvedByName ? previous.resolvedByName : name(profile, actor.uid) : '',
    })
    return { id: input.id, revision }
  })
}

async function handle(request, normalize, persist, module = 'handbook') {
  try {
    requireKnowledgeAccess(await requireActiveProfile(request), true, module)
    return await persist(getFirestore(), normalize(request.data), { uid: request.auth.uid })
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({ module, stage: 'save', code: 'knowledge_save_failed', message: module === 'knowledgeGaps' ? 'Wissenslücke konnte nicht gespeichert werden.' : 'Wissenseintrag konnte nicht gespeichert werden.', actorId: request.auth?.uid || '', recordId: validId(request.data?.id) ? request.data.id : '' })
    throw error
  }
}

export const saveKnowledgeRecordHandler = (request) => handle(request, normalizeKnowledgeInput, persistKnowledgeRecord)
export const updateKnowledgeGapHandler = (request) => handle(request, normalizeKnowledgeGapUpdate, persistKnowledgeGapUpdate, 'knowledgeGaps')
