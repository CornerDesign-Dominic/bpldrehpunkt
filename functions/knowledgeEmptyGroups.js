import { randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { normalizeKnowledgeInput, requireKnowledgeAccess } from './knowledge.js'
import { recordDiagnostic } from './diagnostics.js'

const invalid = () => { throw new HttpsError('invalid-argument', 'Ungültige Artikelvorschlagsaktion.') }
export function normalizeEmptyKnowledgeGroup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['id', 'expectedRevision', 'action', 'values'].includes(key))) invalid()
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(data.id) || data.id === 'unassigned' || data.id.startsWith('article-') || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1 || !['remove', 'createArticle'].includes(data.action)) invalid()
  if (data.action === 'remove' && data.values !== undefined) invalid()
  if (data.action === 'createArticle' && (!data.values || typeof data.values !== 'object' || Array.isArray(data.values) || Object.keys(data.values).some(key => !['title', 'process'].includes(key)))) invalid()
  return { id: data.id, expectedRevision: data.expectedRevision, action: data.action, ...(data.action === 'createArticle' ? { articleId: randomUUID(), values: normalizeKnowledgeInput({ kind: 'article', expectedRevision: 0, values: { title: data.values.title, process: data.values.process, status: 'draft' } }).values } : {}) }
}

export async function persistEmptyKnowledgeGroup(db, input, actor) {
  const groupRef = db.doc(`knowledgeGaps/${input.id}`)
  return db.runTransaction(async tx => {
    const [snapshot, user, cases] = await Promise.all([
      tx.get(groupRef), tx.get(db.doc(`users/${actor.uid}`)),
      tx.get(db.collection('knowledgeGapEvidence').where('gapId', '==', input.id)),
    ])
    const profile = user.data()
    requireKnowledgeAccess(profile, true, 'knowledgeGaps')
    if (input.action === 'createArticle') requireKnowledgeAccess(profile, true)
    const group = snapshot.data()
    if (!snapshot.exists) throw new HttpsError('not-found', 'Der Artikelvorschlag wurde nicht gefunden.')
    if (group.revision !== input.expectedRevision) throw new HttpsError('aborted', 'Der Artikelvorschlag wurde inzwischen geändert. Bitte neu laden.')
    if (group.articleId || ['article', 'unassigned'].includes(group.category) || input.id === 'unassigned' || input.id.startsWith('article-')) throw new HttpsError('failed-precondition', 'Nur leere Artikelvorschläge können so bearbeitet werden.')
    if (cases.docs.some(item => item.data().removed !== true)) throw new HttpsError('failed-precondition', 'Der Artikelvorschlag enthält inzwischen Fälle. Bitte die Fälle zuerst prüfen oder verschieben.')
    if (input.action === 'createArticle') {
      const articleRef = db.doc(`knowledgeArticles/${input.articleId}`)
      const now = FieldValue.serverTimestamp()
      const record = { ...input.values, revision: 1, createdAt: now, createdBy: actor.uid, updatedAt: now, updatedBy: actor.uid, updatedByName: [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || actor.uid }
      tx.create(articleRef, record)
      tx.create(articleRef.collection('revisions').doc('1'), record)
      tx.create(db.doc(`knowledgeGaps/article-${input.articleId}`), { title: record.title, process: record.process, articleId: input.articleId, category: 'article', classification: 'article', status: 'open', hidden: false, count: 0, revision: 1, firstSeenAt: now, lastSeenAt: now })
    }
    tx.delete(groupRef)
    return { id: input.id, action: input.action, ...(input.articleId ? { articleId: input.articleId, revision: 1 } : {}) }
  })
}

export async function manageEmptyKnowledgeGroupHandler(request) {
  try {
    requireKnowledgeAccess(await requireActiveProfile(request), true, 'knowledgeGaps')
    return await persistEmptyKnowledgeGroup(getFirestore(), normalizeEmptyKnowledgeGroup(request.data), { uid: request.auth.uid })
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      try { await recordDiagnostic({ module: 'knowledgeGaps', stage: 'save', code: 'knowledge_empty_group_failed', actorId: request.auth?.uid || '', message: 'Leerer Artikelvorschlag konnte nicht bearbeitet werden.' }) } catch { /* Keep the original failure. */ }
    }
    throw error
  }
}
