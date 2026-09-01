import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const KNOWLEDGE_ARTICLES_COLLECTION = 'knowledgeArticles'

export const KNOWLEDGE_CATEGORIES = [
  { value: 'work-instructions', label: 'Arbeitsanweisungen' },
  { value: 'processes', label: 'Prozesse' },
  { value: 'quality-iso', label: 'Qualitätsmanagement / ISO' },
  { value: 'dispatch', label: 'Disposition' },
  { value: 'accounting', label: 'Buchhaltung' },
  { value: 'it-systems', label: 'IT & Systeme' },
  { value: 'hr-organization', label: 'Personal & Organisation' },
  { value: 'templates-checklists', label: 'Vorlagen & Checklisten' },
]

const trim = (value) => (value ?? '').trim()
const articlesRef = collection(db, KNOWLEDGE_ARTICLES_COLLECTION)
const timestampValue = (value) => value?.toMillis?.() ?? 0

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function payload(values) {
  return {
    title: trim(values.title),
    category: values.category,
    summary: trim(values.summary),
    content: trim(values.content),
  }
}

export function getKnowledgeCategory(category) {
  return KNOWLEDGE_CATEGORIES.find((item) => item.value === category) ?? null
}

export function createEmptyKnowledgeArticle() {
  return { title: '', category: KNOWLEDGE_CATEGORIES[0].value, summary: '', content: '' }
}

export async function listKnowledgeArticles() {
  const snapshot = await getDocs(articlesRef)
  return snapshot.docs
    .map(mapSnapshot)
    .sort((left, right) => timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt))
}

export async function getKnowledgeArticle(articleId) {
  const snapshot = await getDoc(doc(db, KNOWLEDGE_ARTICLES_COLLECTION, articleId))
  return snapshot.exists() ? mapSnapshot(snapshot) : null
}

export async function createKnowledgeArticle(values) {
  const articleRef = doc(articlesRef)
  await setDoc(articleRef, {
    id: articleRef.id,
    ...payload(values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return articleRef.id
}

export async function updateKnowledgeArticle(articleId, values) {
  await updateDoc(doc(db, KNOWLEDGE_ARTICLES_COLLECTION, articleId), {
    ...payload(values),
    updatedAt: serverTimestamp(),
  })
}
