import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

const paths = { article: 'knowledgeArticles', rule: 'knowledgeRules', gap: 'knowledgeGaps' }
async function operation(stage, callback, recordId) {
  try { return await callback() }
  catch (error) {
    if (!['functions/invalid-argument', 'functions/aborted', 'functions/failed-precondition'].includes(error.code)) void reportTechnicalFailure({ module: 'handbook', stage, recordId, error })
    throw error
  }
}
export const listKnowledge = (kind) => operation('load', async () => {
  const result = await getDocs(collection(db, paths[kind]))
  return result.docs.map((item) => ({ ...item.data(), id: item.id }))
})
export const getKnowledge = (kind, id) => operation('load', async () => {
  const result = await getDoc(doc(db, paths[kind], id))
  return result.exists() ? { ...result.data(), id: result.id } : null
}, id)
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
}, record.id)
