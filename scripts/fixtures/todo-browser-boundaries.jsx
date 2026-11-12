import { useSyncExternalStore } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './todo-browser-firebase.js'

const config = window.__TODO_BROWSER_QA__
const listeners = new Set()
let actor = { user: { uid: config.actor }, profile: null }
const initial = await fetch('/__todo_qa/directory').then(result => result.json())
actor = { ...actor, profile: initial.find(person => person.id === config.actor) }
onSnapshot(doc(db, 'users', config.actor), snapshot => {
  actor = { ...actor, profile: snapshot.data() }
  listeners.forEach(listener => listener())
}, () => { actor = { ...actor, profile: { ...actor.profile, active: false } }; listeners.forEach(listener => listener()) })
export const useAuth = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => actor)
export const usePermissions = () => {
  const { profile } = useAuth()
  return { canEdit: key => profile?.active === true && (profile?.role === 'superadmin' || profile?.permissions?.[key] === 'edit'), canView: key => profile?.active === true && (profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.[key])) }
}
export const getUserDisplayName = (entry, fallback) => [entry?.firstName, entry?.lastName].filter(Boolean).join(' ') || entry?.name || fallback?.email || 'Benutzer'
export const listVisibleUserDirectory = async () => fetch('/__todo_qa/directory').then(result => result.json())
export const listBusinessPartners = async () => []
export const listDamageCases = async () => []
export const listInsolvencies = async () => []
export const listTransportOrdersPage = async () => ({ entries: [], nextCursor: null })
export const reportTechnicalFailure = async () => false
export const getReminderStatus = async () => ({ status: 'scheduled', recipients: [] })
export const invalidateReminderStatuses = () => {}
