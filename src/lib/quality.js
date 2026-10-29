import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

const collections = { topic: 'qualityTopics', meeting: 'qualityMeetings', handbook: 'qualityHandbook' }
const moduleFor = (kind) => kind === 'handbook' ? 'handbook' : 'kvp'

export async function getQualityTopic(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null
  try {
    const snapshot = await getDoc(doc(db, collections.topic, id))
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null
  } catch (error) {
    void reportTechnicalFailure({ module: 'kvp', stage: 'load', recordId: id, error })
    throw error
  }
}

export async function listQualityMeetingsForTopic(id) {
  try {
    const snapshot = await getDocs(query(collection(db, collections.meeting), where('topicIds', 'array-contains', id)))
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })).sort((a, b) => b.date.localeCompare(a.date))
  } catch (error) {
    void reportTechnicalFailure({ module: 'kvp', stage: 'load', recordId: id, error })
    throw error
  }
}

export async function listQualityRecords(kind, departmentId) {
  try {
    const snapshot = await getDocs(query(collection(db, collections[kind]), where('departmentId', '==', departmentId)))
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })).sort((a, b) => a.title.localeCompare(b.title))
  } catch (error) {
    void reportTechnicalFailure({ module: moduleFor(kind), stage: 'load', error })
    throw error
  }
}

export async function saveQualityRecord(kind, record, values) {
  try {
    await waitForAppCheckToken()
    return (await httpsCallable(functions, 'saveQualityRecord')({ kind, id: record.id, expectedRevision: record.revision || 0, values })).data
  } catch (error) {
    if (error.code !== 'functions/aborted') void reportTechnicalFailure({ module: moduleFor(kind), stage: 'save', recordId: record.id, error })
    throw error
  }
}

export async function listQualityHistory(kind, id) {
  try {
    const snapshot = await getDocs(collection(db, collections[kind], id, 'revisions'))
    return snapshot.docs.map((doc) => doc.data()).sort((a, b) => b.revision - a.revision)
  } catch (error) {
    void reportTechnicalFailure({ module: moduleFor(kind), stage: 'history', recordId: id, error })
    throw error
  }
}
