import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { BUSINESS_PARTNERS_COLLECTION } from './businessPartners.js'
import { db } from './firebase.js'

export const ACTIVITY_TYPES = [
  { value: 'phone', label: 'Telefonat' },
  { value: 'email', label: 'E-Mail' },
  { value: 'visit', label: 'Besuch' },
  { value: 'meeting', label: 'Besprechung' },
  { value: 'offer', label: 'Angebot' },
  { value: 'complaint', label: 'Beschwerde / Reklamation' },
  { value: 'other', label: 'Sonstiges' },
]

export const ACTIVITY_PRIORITIES = [
  { value: 'info', label: 'Allgemeine Information' },
  { value: 'notice', label: 'Hinweis' },
  { value: 'important', label: 'Achtung / Wichtig' },
]

const trimValue = (value) => (value ?? '').trim()
const activitiesRef = (partnerId) => collection(db, BUSINESS_PARTNERS_COLLECTION, partnerId, 'activities')
const mapSnapshot = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })
const timestampValue = (value) => value?.toMillis?.() ?? 0

function createPayload(values) {
  return {
    date: values.date,
    type: values.type,
    priority: values.priority,
    text: trimValue(values.text),
    contactPerson: trimValue(values.contactPerson),
    reference: trimValue(values.reference),
  }
}

export async function listCrmActivities(partnerId) {
  const snapshot = await getDocs(query(activitiesRef(partnerId), orderBy('date', 'desc')))

  return snapshot.docs
    .map(mapSnapshot)
    .sort((left, right) => (
      right.date.localeCompare(left.date)
      || timestampValue(right.createdAt) - timestampValue(left.createdAt)
    ))
}

export async function createCrmActivity(partnerId, values) {
  await addDoc(activitiesRef(partnerId), {
    ...createPayload(values),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCrmActivity(partnerId, activityId, values) {
  await updateDoc(doc(db, BUSINESS_PARTNERS_COLLECTION, partnerId, 'activities', activityId), {
    ...createPayload(values),
    updatedAt: serverTimestamp(),
  })
}
