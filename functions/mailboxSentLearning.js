import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { captureGroup, knowledgeCaseUpdate, selectReplyKnowledge } from './knowledgeReply.js'
import { cleanKnowledgeMailCopy } from './knowledgeTextClean.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (code, message) => { throw new HttpsError(code, message) }
const mailboxAllowed = profile => profile?.active === true && (profile.role === 'superadmin' || profile.permissions?.mailboxes === 'edit')

// Internal classifier for explicitly opted-in SentItems. No catalog text is
// returned to the mailbox user; case copies retain their separate read rights.
async function learningCatalog(db) {
  const [articles, rules] = await Promise.all([
    db.collection('knowledgeArticles').where('status', '==', 'valid').limit(201).get(),
    db.collection('knowledgeRules').where('status', '==', 'valid').limit(101).get(),
  ])
  const records = (snapshot, kind, limit) => snapshot.docs.slice(0, limit).map(doc => ({ ...doc.data(), id: doc.id, kind })).filter(record => Number.isSafeInteger(record.revision) && record.revision > 0)
  return { articles: records(articles, 'article', 200), rules: records(rules, 'rule', 100), gaps: [], limited: articles.docs.length > 200 || rules.docs.length > 100 }
}

export async function captureSentMailboxLearning({ db, scopeId, generation, connection, incoming, reply, now = Date.now(), select = selectReplyKnowledge }) {
  if (!/^[a-f0-9]{64}$/.test(scopeId || '') || !incoming?.id || !reply?.id || reply.isDraft !== false) fail('invalid-argument', 'Ungültiger versendeter Lernfall.')
  const sentAt = Date.parse(reply.sentDateTime)
  const incomingText = cleanKnowledgeMailCopy(incoming.body?.content || incoming.bodyPreview || '')
  const sentReply = cleanKnowledgeMailCopy(reply.body?.content || reply.bodyPreview || '')
  if (!Number.isFinite(sentAt) || sentAt > now + 60000 || !incomingText.trim() || !sentReply.trim()) return { skipped: true }
  if (incomingText.length + sentReply.length > 120000) fail('resource-exhausted', 'Die Mailtexte sind für einen Lernfall zu umfangreich.')
  const scopeRef = db.doc(`mailboxLearningScopes/${scopeId}`)
  const evidenceId = hash(`sent-reply-v1|${scopeId}|${reply.internetMessageId || reply.id}`)
  const evidenceRef = db.doc(`knowledgeGapEvidence/${evidenceId}`)
  const existing = await evidenceRef.get()
  if (existing.exists) return { captured: false, evidenceId }
  const enabledScope = (await scopeRef.get()).data()
  if (!enabledScope?.enabled || enabledScope.generation !== generation || sentAt < enabledScope.since) return { skipped: true }
  const [ownerBefore, connectionBefore] = await Promise.all([db.doc(`users/${connection.ownerId}`).get(), db.doc(`mailboxConnections/${connection.id}`).get()])
  const liveBefore = connectionBefore.data()
  if (!mailboxAllowed(ownerBefore.data()) || liveBefore?.ownerId !== connection.ownerId || liveBefore.status !== 'connected') fail('permission-denied', 'Kein aktiver Postfachzugriff für diesen Lernfall.')
  if (enabledScope.kind === 'shared' ? liveBefore.tenantId !== enabledScope.tenantId || liveBefore.canonicalMailboxId !== enabledScope.canonicalMailboxId : enabledScope.ownerId !== connection.ownerId || enabledScope.connectionId !== connection.id) fail('permission-denied', 'Der Lernfall gehört nicht zu diesem Postfach.')
  const catalog = await learningCatalog(db)
  // A limited catalog must not invent firm knowledge. Keep the case
  // available for manual curation without spending a classification request.
  const selection = !catalog.limited
    ? await select({ catalog, mail: { ...incoming, body: { contentType: 'text', content: incomingText } }, userId: connection.ownerId })
    : { sources: [], coverage: 'uncertain', limited: catalog.limited, gap: null, senderRole: 'unknown', recipientRole: 'unknown' }
  const group = captureGroup(selection, catalog)
  const groupRef = db.doc(`knowledgeGaps/${group.id}`)
  const receiptRef = db.doc(`knowledgeGapOccurrences/${evidenceId}`)
  return db.runTransaction(async tx => {
    const sourceRefs = (selection.sources || []).map(source => db.doc(`${source.kind === 'article' ? 'knowledgeArticles' : 'knowledgeRules'}/${source.id}`))
    const [scopeSnapshot, owner, liveConnection, currentEvidence, currentGroup, ...sources] = await Promise.all([
      tx.get(scopeRef), tx.get(db.doc(`users/${connection.ownerId}`)), tx.get(db.doc(`mailboxConnections/${connection.id}`)), tx.get(evidenceRef), tx.get(groupRef), ...sourceRefs.map(ref => tx.get(ref)),
    ])
    const scope = scopeSnapshot.data(), live = liveConnection.data()
    if (currentEvidence.exists) return { captured: false, evidenceId }
    if (!scope?.enabled || scope.generation !== generation || sentAt < scope.since) return { skipped: true }
    if (!mailboxAllowed(owner.data()) || live?.ownerId !== connection.ownerId || live.status !== 'connected') fail('permission-denied', 'Lernfreigabe oder Postfachzugriff wurde geändert.')
    if (scope.kind === 'shared' ? live.tenantId !== scope.tenantId || live.canonicalMailboxId !== scope.canonicalMailboxId : scope.ownerId !== connection.ownerId || scope.connectionId !== connection.id) fail('permission-denied', 'Der Lernfall gehört nicht zu diesem Postfach.')
    if (live.kind === 'shared') {
      const parent = (await tx.get(db.doc(`mailboxConnections/${live.parentConnectionId}`))).data()
      if (parent?.ownerId !== connection.ownerId || parent.status !== 'connected') fail('permission-denied', 'Microsoft-Verbindung wurde getrennt.')
    }
    if (sources.some((snapshot, index) => snapshot.data()?.status !== 'valid' || snapshot.data()?.revision !== selection.sources[index].revision)) fail('aborted', 'Wissensquellen wurden während der Zuordnung geändert.')
    const stamp = FieldValue.serverTimestamp(), previous = currentGroup.data()
    tx.set(groupRef, { ...(previous || {}), ...(!currentGroup.exists ? { title: group.title, process: group.process, missing: group.missing, articleId: group.articleId, category: group.category, classification: group.classification, ...(group.intentKey ? { intentKey: group.intentKey, missingAspect: group.missingAspect } : {}) } : {}), count: (previous?.count || 0) + 1, firstSeenAt: previous?.firstSeenAt || stamp, lastSeenAt: stamp, status: 'open', revision: (previous?.revision || 0) + 1 })
    tx.create(evidenceRef, knowledgeCaseUpdate(null, { gapId: group.id, incomingText, sentReply, latestSuggestion: '', sendStatus: 'accepted', sentAt: new Date(sentAt), suggestionAt: stamp, updatedAt: stamp, removed: false, senderRole: selection.senderRole || 'unknown', recipientRole: selection.recipientRole || 'unknown', sourceArticleId: group.articleId || '', sourceRevision: selection.sources?.find(source => source.kind === 'article')?.revision || 0, captureSource: 'sentitems', learningScopeId: scopeId }))
    tx.create(receiptRef, { gapId: group.id, createdAt: stamp })
    tx.update(scopeRef, { lastCapturedAt: now, state: 'active' })
    return { captured: true, evidenceId, gapId: group.id }
  })
}
