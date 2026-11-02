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
const validGroupId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
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
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['id', 'expectedRevision', 'status', 'articleId', 'hidden'].includes(key))) invalid()
  if (!validGroupId(data.id) || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) invalid('Ungültige Wissensgruppe.')
  const changes = {}
  if (Object.hasOwn(data, 'status')) {
    if (!['open', 'in_progress', 'resolved', 'ignored'].includes(data.status)) invalid('Ungültiger Status.')
    changes.status = data.status
  }
  if (Object.hasOwn(data, 'hidden')) {
    if (typeof data.hidden !== 'boolean') invalid('Ungültige Sichtbarkeit.')
    changes.hidden = data.hidden
  }
  if (Object.hasOwn(data, 'articleId')) {
    if (typeof data.articleId !== 'string' || data.articleId !== '' && !validId(data.articleId)) invalid('Ungültige Artikelzuordnung.')
    changes.articleId = data.articleId
  }
  if (!Object.keys(changes).length) invalid('Eine Änderung ist erforderlich.')
  return { id: data.id, expectedRevision: data.expectedRevision, ...changes }
}

export async function persistKnowledgeGapUpdate(db, input, actor) {
  const ref = db.doc(`knowledgeGaps/${input.id}`)
  const virtualArticleId = input.id.startsWith('article-') && validId(input.id.slice(8)) ? input.id.slice(8) : ''
  return db.runTransaction(async tx => {
    const [current, user, article, virtualArticle] = await Promise.all([
      tx.get(ref), tx.get(db.doc(`users/${actor.uid}`)), input.articleId ? tx.get(db.doc(`knowledgeArticles/${input.articleId}`)) : null,
      input.expectedRevision === 0 && virtualArticleId ? tx.get(db.doc(`knowledgeArticles/${virtualArticleId}`)) : null,
    ])
    const profile = user.exists ? user.data() : null
    requireKnowledgeAccess(profile, true, 'knowledgeGaps')
    if (!current.exists) {
      if (input.expectedRevision !== 0 || input.id !== 'unassigned' && !virtualArticleId) throw new HttpsError('not-found', 'Die Wissensgruppe wurde nicht gefunden.')
      if (virtualArticleId) {
        requireKnowledgeAccess(profile)
        if (!virtualArticle?.exists) throw new HttpsError('not-found', 'Der Handbuchartikel wurde nicht gefunden.')
      }
    }
    const previous = current.exists ? current.data() : { title: virtualArticle?.data()?.title || 'Nicht zugeordnet', process: virtualArticle?.data()?.process || '', category: virtualArticleId ? 'article' : 'unassigned', classification: virtualArticleId ? 'article' : 'unassigned', articleId: virtualArticleId, status: 'open', hidden: false, count: 0, revision: 0 }
    if (previous.revision !== input.expectedRevision) throw new HttpsError('aborted', 'Die Wissensgruppe wurde inzwischen geändert. Bitte neu laden.')
    const legacyStatus = Object.hasOwn(input, 'status')
    const moveCases = Object.hasOwn(input, 'articleId') && !legacyStatus
    const targetGapId = moveCases ? input.articleId ? `article-${input.articleId}` : 'unassigned' : input.id
    if (moveCases && input.articleId || legacyStatus && input.articleId && input.articleId !== previous.articleId) {
      requireKnowledgeAccess(profile)
      if (!article?.exists) throw new HttpsError('failed-precondition', 'Der Handbuchartikel existiert nicht mehr.')
    }
    let targetRef = null, target = null, cases = []
    if (moveCases && targetGapId !== input.id) {
      targetRef = db.doc(`knowledgeGaps/${targetGapId}`)
      const [targetSnapshot, evidence] = await Promise.all([tx.get(targetRef), tx.get(db.collection('knowledgeGapEvidence').where('gapId', '==', input.id))])
      target = targetSnapshot
      cases = evidence.docs.filter(item => item.data().removed !== true)
      if (cases.length > 400) throw new HttpsError('resource-exhausted', 'Diese Gruppe enthält mehr als 400 aktive Fälle. Bitte Fälle einzeln oder in kleineren Gruppen zuordnen.')
    }
    const now = FieldValue.serverTimestamp()
    const revision = previous.revision + 1
    const record = { ...previous, revision, updatedAt: now, updatedBy: actor.uid, updatedByName: name(profile, actor.uid), ...(!current.exists ? { firstSeenAt: now, lastSeenAt: now } : {}), ...(Object.hasOwn(input, 'hidden') ? { hidden: input.hidden } : {}) }
    if (legacyStatus) {
      const resolved = input.status === 'resolved'
      const alreadyResolved = previous.status === 'resolved'
      Object.assign(record, { status: input.status, ...(Object.hasOwn(input, 'articleId') ? { articleId: input.articleId } : {}),
        resolvedAt: resolved ? alreadyResolved && previous.resolvedAt ? previous.resolvedAt : now : null,
        resolvedBy: resolved ? alreadyResolved && previous.resolvedBy ? previous.resolvedBy : actor.uid : '',
        resolvedByName: resolved ? alreadyResolved && previous.resolvedByName ? previous.resolvedByName : name(profile, actor.uid) : '',
      })
    }
    tx.set(ref, record)
    if (targetRef) {
      const previousTarget = target.exists ? target.data() : {}
      tx.set(targetRef, { ...previousTarget, title: input.articleId ? article.data().title : 'Nicht zugeordnet', process: input.articleId ? article.data().process || '' : '', articleId: input.articleId, category: input.articleId ? 'article' : 'unassigned', classification: input.articleId ? 'article' : 'unassigned', status: previousTarget.status || 'open', hidden: previousTarget.hidden === true, count: previousTarget.count || 0, revision: (previousTarget.revision || 0) + 1, firstSeenAt: previousTarget.firstSeenAt || now, lastSeenAt: now })
      for (const item of cases) {
        const value = item.data()
        tx.update(db.doc(`knowledgeGapEvidence/${item.id}`), { gapId: targetGapId, caseRevision: (Number.isSafeInteger(value.caseRevision) && value.caseRevision > 0 ? value.caseRevision : 1) + 1, movedAt: now, movedBy: actor.uid, updatedAt: now })
      }
    }
    return { id: input.id, revision, ...(moveCases ? { targetGapId, movedCount: cases.length } : {}) }
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
