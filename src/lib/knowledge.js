import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
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
export const updateKnowledgeGap = (record, values) => operation('save', async () => {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, 'updateKnowledgeGap')({ id: record.id, expectedRevision: record.revision || 0, ...values })).data
}, record.id, 'knowledgeGaps')

export const listKnowledgeGapEvidence = (gapId) => operation('load', async () => {
  const result = await getDocs(query(collection(db, 'knowledgeGapEvidence'), where('gapId', '==', gapId)))
  return result.docs.map((item) => ({ ...item.data(), id: item.id })).sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0))
}, gapId, 'knowledgeGaps')

export const listKnowledgeCases = () => operation('load', async () => {
  const result = await getDocs(collection(db, 'knowledgeGapEvidence'))
  return result.docs.map((item) => ({ ...item.data(), id: item.id }))
}, undefined, 'knowledgeGaps')

function watchKnowledgeCollection(path, onNext, onError, module) {
  return onSnapshot(collection(db, path), (snapshot) => onNext(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))), (error) => {
    void reportTechnicalFailure({ module, stage: 'load', error })
    onError(error)
  })
}
export const watchKnowledge = (kind, onNext, onError) => watchKnowledgeCollection(paths[kind], onNext, onError, kind === 'gap' ? 'knowledgeGaps' : 'handbook')
export const watchKnowledgeCases = (onNext, onError) => watchKnowledgeCollection('knowledgeGapEvidence', onNext, onError, 'knowledgeGaps')
export const watchKnowledgeLearningRuns = (onNext, onError) => watchKnowledgeCollection('knowledgeLearningRuns', onNext, onError, 'knowledgeGaps')

export const listKnowledgeLearningRuns = (gapId) => operation('load', async () => {
  const result = await getDocs(query(collection(db, 'knowledgeLearningRuns'), where('gapId', '==', gapId)))
  return result.docs.map((item) => ({ ...item.data(), id: item.id })).sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))
}, gapId, 'knowledgeGaps')

const knowledgeCaseCall = (name, values) => operation('save', async () => {
  await waitForAppCheckToken()
  return (await httpsCallable(functions, name, { timeout: 180000 })(values)).data
}, values.id || values.gapId, 'knowledgeGaps')
export const manageKnowledgeCase = (values) => knowledgeCaseCall('manageKnowledgeCase', values)
export const learnKnowledgeCases = (values) => knowledgeCaseCall('learnKnowledgeCases', values)
export const applyKnowledgeLearning = (values) => knowledgeCaseCall('applyKnowledgeLearning', values)
export const discardKnowledgeLearning = (values) => knowledgeCaseCall('discardKnowledgeLearning', values)
export const manageEmptyKnowledgeGroup = (record, action, values) => knowledgeCaseCall('manageEmptyKnowledgeGroup', { id: record.id, expectedRevision: record.revision || 0, action, ...(values ? { values } : {}) })
