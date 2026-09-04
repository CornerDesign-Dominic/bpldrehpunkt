import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const NEWS_ITEMS_COLLECTION = 'newsItems'

export const NEWS_CATEGORIES = [
  { value: 'internal', label: 'Interne News' },
  { value: 'traffic_infrastructure', label: 'Verkehr & Infrastruktur' },
  { value: 'law_regulations', label: 'Recht & Vorgaben' },
  { value: 'logistics_market', label: 'Logistik & Markt' },
]

export const INTERNAL_NEWS_CATEGORIES = [
  { value: 'general', label: 'Allgemein' },
  { value: 'technical', label: 'Technisches' },
  { value: 'events', label: 'Ereignisse' },
  { value: 'organization_processes', label: 'Organisation & Prozesse' },
  { value: 'people_team', label: 'Personal & Team' },
  { value: 'security_privacy', label: 'Sicherheit & Datenschutz' },
]

// These values may still exist in Firestore until the server-side migration has run.
// Keeping the mapping here prevents historical news from disappearing in the meantime.
export const LEGACY_NEWS_CATEGORIES = [
  { value: 'other', label: 'Weitere (Bestand)' },
]

const LEGACY_CATEGORY_MAPPINGS = {
  highway: 'traffic_infrastructure',
  law: 'law_regulations',
  logistics: 'logistics_market',
}

export const NEWS_PRIORITIES = [
  { value: 'information', label: 'Information' },
  { value: 'notice', label: 'Hinweis' },
  { value: 'important', label: 'Wichtig' },
]

const newsItemsRef = collection(db, NEWS_ITEMS_COLLECTION)
const trim = (value) => (value ?? '').trim()

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function dateToMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  return new Date(`${value}T12:00:00`).getTime() || 0
}

function payload(values) {
  const sourceType = values.sourceType || 'internal'
  const internalCategory = INTERNAL_NEWS_CATEGORIES.some((item) => item.value === values.internalCategory)
    ? values.internalCategory
    : 'general'

  return {
    title: trim(values.title),
    summary: trim(values.summary),
    content: trim(values.content),
    category: values.category || 'internal',
    priority: values.priority || 'information',
    sourceType,
    ...(sourceType === 'internal' ? { internalCategory } : {}),
    source: trim(values.source),
    sourceUrl: trim(values.sourceUrl),
    publishedAt: values.publishedAt || null,
    validUntil: values.validUntil || null,
    status: values.status || 'active',
    // External importers can fill these fields later without a model migration.
    fetchedAt: values.fetchedAt || null,
    aiSummary: trim(values.aiSummary),
    relevance: values.relevance ?? null,
  }
}

export function createEmptyInternalNewsItem() {
  return {
    title: '', summary: '', content: '', category: 'internal', priority: 'information', sourceType: 'internal',
    internalCategory: 'general', source: '', sourceUrl: '', publishedAt: todayValue(), validUntil: '', status: 'active', fetchedAt: null, aiSummary: '', relevance: null,
  }
}

export function normalizeNewsCategory(category) {
  return LEGACY_CATEGORY_MAPPINGS[category] || category
}

export function getNewsCategory(category) {
  return NEWS_CATEGORIES.find((item) => item.value === normalizeNewsCategory(category))?.label
    || LEGACY_NEWS_CATEGORIES.find((item) => item.value === category)?.label
    || 'Weitere (Bestand)'
}

export function getInternalNewsCategory(category) {
  return INTERNAL_NEWS_CATEGORIES.find((item) => item.value === category)?.label || 'Allgemein'
}

export function getNewsPriority(priority) {
  return NEWS_PRIORITIES.find((item) => item.value === priority)?.label || 'Information'
}

export function todayValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function isNewsNew(item, today = new Date()) {
  const published = dateToMillis(item.publishedAt)
  const limit = new Date(today); limit.setHours(0, 0, 0, 0); limit.setDate(limit.getDate() - 6)
  return published >= limit.getTime()
}

export function isNewsInPeriod(item, period, today = new Date()) {
  if (period === 'all') return true
  const published = dateToMillis(item.publishedAt)
  const start = new Date(today); start.setHours(0, 0, 0, 0)
  if (period === 'today') return published >= start.getTime()
  start.setDate(start.getDate() - (period === '7days' ? 6 : 29))
  return published >= start.getTime()
}

export function formatNewsDate(value) {
  const date = value?.toDate?.() ?? (value ? new Date(`${value}T12:00:00`) : null)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('de-DE').format(date) : '—'
}

export async function listNewsItems() {
  const snapshot = await getDocs(newsItemsRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => dateToMillis(right.publishedAt) - dateToMillis(left.publishedAt) || dateToMillis(right.updatedAt || right.createdAt) - dateToMillis(left.updatedAt || left.createdAt))
}

export async function createNewsItem(values) {
  const itemRef = doc(newsItemsRef)
  await setDoc(itemRef, { id: itemRef.id, ...payload(values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return itemRef.id
}

export async function updateNewsItem(itemId, values) {
  await updateDoc(doc(db, NEWS_ITEMS_COLLECTION, itemId), { ...payload(values), updatedAt: serverTimestamp() })
}

export async function archiveNewsItem(item) {
  await updateDoc(doc(db, NEWS_ITEMS_COLLECTION, item.id), { status: 'archived', updatedAt: serverTimestamp() })
}
