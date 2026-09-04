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
const NEWS_ITEM_READ_STATES_COLLECTION = 'newsItemReadStates'

export const NEWS_CATEGORIES = [
  { value: 'internal', label: 'Interne News', description: 'Unternehmen & Team' },
  { value: 'traffic_infrastructure', label: 'Verkehr & Infrastruktur', description: 'Routen & Einschränkungen' },
  { value: 'law_regulations', label: 'Recht & Vorgaben', description: 'Pflichten & Fristen' },
  { value: 'logistics_market', label: 'Logistik & Markt', description: 'Branche & Kapazitäten' },
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

export const EXTERNAL_NEWS_COUNTRIES = ['DE', 'NL', 'BE', 'LU', 'FR', 'PL', 'AT', 'CH', 'CZ', 'IT', 'ES', 'DK', 'UK', 'EU']

export const EXTERNAL_NEWS_TAGS = {
  traffic_infrastructure: [
    { value: 'construction', label: 'Baustelle' },
    { value: 'road_closure', label: 'Vollsperrung' },
    { value: 'driving_ban', label: 'Fahrverbot' },
    { value: 'toll', label: 'Maut' },
    { value: 'border_disruption', label: 'Grenzstörung' },
    { value: 'strike', label: 'Streik' },
    { value: 'port_ferry', label: 'Hafen/Fähre' },
    { value: 'rail_terminal', label: 'Bahn/Terminal' },
    { value: 'weather', label: 'Wetter' },
  ],
  law_regulations: [
    { value: 'transport_law', label: 'Transportrecht' },
    { value: 'accounting_taxes', label: 'Abrechnung & Steuern' },
    { value: 'personnel_social', label: 'Personal & Sozial' },
    { value: 'customs_foreign_trade', label: 'Zoll & Außenhandel' },
    { value: 'environment', label: 'Umwelt' },
    { value: 'eu_law', label: 'EU-Recht' },
    { value: 'case_law', label: 'Rechtsprechung' },
  ],
  logistics_market: [
    { value: 'market_prices', label: 'Markt & Preise' },
    { value: 'capacity', label: 'Kapazität' },
    { value: 'partners_insolvencies', label: 'Partner & Insolvenzen' },
    { value: 'industry_development', label: 'Branchenentwicklung' },
    { value: 'operational_disruption', label: 'operative Störung' },
  ],
}

export const EXTERNAL_NEWS_AFFECTS = [
  { value: 'dispatch', label: 'Disposition' },
  { value: 'accounting', label: 'Buchhaltung' },
  { value: 'personnel', label: 'Personal' },
  { value: 'management', label: 'Geschäftsleitung' },
  { value: 'it', label: 'IT' },
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

function asDate(value) {
  if (!value) return null
  const date = value?.toDate?.() ?? new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function payload(values) {
  const sourceType = values.sourceType || 'internal'
  const internalCategory = INTERNAL_NEWS_CATEGORIES.some((item) => item.value === values.internalCategory)
    ? values.internalCategory
    : 'general'
  const category = values.category || 'internal'
  const externalTags = EXTERNAL_NEWS_TAGS[category] || []
  const affectedCountries = normalizeSelections(values.affectedCountries, EXTERNAL_NEWS_COUNTRIES, 8)
  const topicTags = normalizeSelections(values.topicTags, externalTags.map((tag) => tag.value), 3)
  const affects = normalizeSelections(values.affects, EXTERNAL_NEWS_AFFECTS.map((area) => area.value), 5)

  return {
    title: trim(values.title),
    summary: trim(values.summary),
    content: trim(values.content),
    category,
    priority: values.priority || 'information',
    sourceType,
    ...(sourceType === 'internal' ? { internalCategory } : {}),
    ...(sourceType === 'external' ? { affectedCountries, topicTags, affects } : {}),
    source: trim(values.source),
    sourceUrl: trim(values.sourceUrl),
    publishedAt: values.publishedAt || null,
    validFrom: values.validFrom || null,
    validUntil: values.validUntil || null,
    status: values.status || 'active',
    // External importers can fill these fields later without a model migration.
    fetchedAt: values.fetchedAt || null,
    aiSummary: trim(values.aiSummary),
    relevance: values.relevance ?? null,
  }
}

function normalizeSelections(values, allowedValues, maximum) {
  if (!Array.isArray(values)) return []
  const allowed = new Set(allowedValues)
  return [...new Set(values.filter((value) => typeof value === 'string' && allowed.has(value)))].slice(0, maximum)
}

export function createEmptyInternalNewsItem() {
  return {
    title: '', summary: '', content: '', category: 'internal', priority: 'information', sourceType: 'internal',
    internalCategory: 'general', source: '', sourceUrl: '', publishedAt: todayValue(), validFrom: '', validUntil: '', status: 'active', fetchedAt: null, aiSummary: '', relevance: null,
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

export function getExternalNewsTag(tag) {
  return Object.values(EXTERNAL_NEWS_TAGS).flat().find((item) => item.value === tag)?.label || tag
}

export function getExternalNewsAffects(area) {
  return EXTERNAL_NEWS_AFFECTS.find((item) => item.value === area)?.label || area
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
  const date = asDate(value)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('de-DE').format(date) : '—'
}

export function isNewsCurrent(item, today = new Date()) {
  if ((item.status || 'active') === 'resolved' || item.status === 'archived') return false
  const validUntil = asDate(item.validUntil)
  if (!validUntil) return true
  const endOfDay = new Date(validUntil)
  endOfDay.setHours(23, 59, 59, 999)
  return endOfDay.getTime() >= today.getTime()
}

export function formatNewsCurrentStatus(item) {
  if (item.status === 'resolved') return 'aufgehoben'
  const validFrom = asDate(item.validFrom)
  const validUntil = asDate(item.validUntil)
  if (validFrom && validUntil) {
    const formatter = new Intl.DateTimeFormat('de-DE')
    return `${formatter.format(validFrom)}–${formatter.format(validUntil)}`
  }
  if (validFrom) return `ab ${formatNewsDate(item.validFrom)}`
  if (validUntil) return `bis ${formatNewsDate(item.validUntil)}`
  if (item.status === 'openEnded') return 'laufend'
  return 'Termin offen'
}

export async function listNewsItems() {
  const snapshot = await getDocs(newsItemsRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => dateToMillis(right.publishedAt) - dateToMillis(left.publishedAt) || dateToMillis(right.updatedAt || right.createdAt) - dateToMillis(left.updatedAt || left.createdAt))
}

export async function listNewsUpdates(itemId) {
  if (!itemId) return []
  const snapshot = await getDocs(collection(db, NEWS_ITEMS_COLLECTION, itemId, 'updates'))
  return snapshot.docs.map(mapSnapshot).sort((left, right) => dateToMillis(right.changedAt) - dateToMillis(left.changedAt))
}

export async function listNewsItemPersonalStates(uid) {
  if (!uid) return { readItemIds: [], laterItemIds: [], favoriteItemIds: [] }
  const snapshot = await getDocs(collection(db, NEWS_ITEM_READ_STATES_COLLECTION, uid, 'items'))
  return snapshot.docs.reduce((states, item) => {
    const state = item.data()
    if (state.readAt) states.readItemIds.push(item.id)
    if (state.later === true) states.laterItemIds.push(item.id)
    if (state.favorite === true) states.favoriteItemIds.push(item.id)
    return states
  }, { readItemIds: [], laterItemIds: [], favoriteItemIds: [] })
}

export async function markNewsItemSeen(uid, itemId) {
  if (!uid || !itemId) return
  await setDoc(doc(db, NEWS_ITEM_READ_STATES_COLLECTION, uid, 'items', itemId), { itemId, readAt: serverTimestamp() }, { merge: true })
}

export async function setNewsItemMarker(uid, itemId, marker, enabled) {
  if (!uid || !itemId || !['later', 'favorite'].includes(marker)) return
  await setDoc(doc(db, NEWS_ITEM_READ_STATES_COLLECTION, uid, 'items', itemId), { itemId, [marker]: enabled === true }, { merge: true })
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

export async function hideExternalNewsItem(item) {
  await updateDoc(doc(db, NEWS_ITEMS_COLLECTION, item.id), { status: 'archived', hiddenAt: serverTimestamp(), updatedAt: serverTimestamp() })
}
