import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

const paths = { article: 'knowledgeArticles', rule: 'knowledgeRules', gap: 'knowledgeGaps' }
async function operation(stage, callback, recordId, module = 'handbook') {
  try { return await callback() }
  catch (error) {
    if (!['functions/invalid-argument', 'functions/aborted', 'functions/failed-precondition'].includes(error.code)) void reportTechnicalFailure({ module, stage, recordId, error })
    throw error
  }
}
export const listKnowledge = (kind) => operation('load', async () => {
  const result = await getDocs(collection(db, paths[kind]))
  return result.docs.map((item) => ({ ...item.data(), id: item.id }))
}, undefined, kind === 'gap' ? 'knowledgeGaps' : 'handbook')
export const getKnowledge = (kind, id) => operation('load', async () => {
  const result = await getDoc(doc(db, paths[kind], id))
  return result.exists() ? { ...result.data(), id: result.id } : null
}, id, kind === 'gap' ? 'knowledgeGaps' : 'handbook')
export const listKnowledgeHistory = (kind, id) => operation('history', async () => {
  const result = await getDocs(collection(db, paths[kind], id, 'revisions'))
  return result.docs.map((item) => item.data()).sort((left, right) => right.revision - left.revision)
}, id)
export const saveKnowledge = (kind, record, values) => operation('save', async () => {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'saveKnowledgeRecord')({ kind, id: record.id, expectedRevision: record.revision || 0, values })).data
}, record.id)
export const updateKnowledgeGap = (record, status, articleId = '') => operation('save', async () => {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'updateKnowledgeGap')({ id: record.id, expectedRevision: record.revision, status, articleId })).data
}, record.id, 'knowledgeGaps')

export const listKnowledgeGapEvidence = (gapId) => operation('load', async () => {
  const result = await getDocs(query(collection(db, 'knowledgeGapEvidence'), where('gapId', '==', gapId)))
  return result.docs.map((item) => ({ ...item.data(), id: item.id })).sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0))
}, gapId, 'knowledgeGaps')
