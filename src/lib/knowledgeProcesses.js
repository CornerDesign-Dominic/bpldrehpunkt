import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'

export const KNOWLEDGE_PROCESS_CATEGORIES = [
  { value: 'damages', label: 'Schäden' },
  { value: 'transport_dispatch', label: 'Transport & Disposition' },
  { value: 'customers_carriers', label: 'Kunden & Unternehmer' },
  { value: 'accounting_billing', label: 'Buchhaltung & Abrechnung' },
  { value: 'personnel_administration', label: 'Personal & Administration' },
  { value: 'general', label: 'Allgemein' },
]

export const KNOWLEDGE_PROCESS_STATUSES = [
  { value: 'draft', label: 'Entwurf' },
  { value: 'active', label: 'Aktiv' },
  { value: 'archived', label: 'Archiviert' },
]

export const KNOWLEDGE_PROCESS_NODE_TYPES = [
  { value: 'action', label: 'Handlung' },
  { value: 'decision', label: 'Frage' },
  { value: 'checklist', label: 'Checkliste' },
  { value: 'end', label: 'Ende' },
]

const processes = collection(db, 'knowledgeProcesses')
const milliseconds = (value) => value?.toMillis?.() || 0
const uid = () => globalThis.crypto?.randomUUID?.().replaceAll('-', '_') || `${Date.now()}_${Math.random().toString(36).slice(2)}`

export function createEmptyKnowledgeProcess() {
  return {
    title: '', category: '', shortDescription: '', status: 'draft', nodes: [{ id: 'start', type: 'start', title: 'Start', description: 'Startpunkt des Prozesses.' }], edges: [],
  }
}

export function createKnowledgeProcessNode(type) {
  const id = `node_${uid()}`
  if (type === 'decision') return { id, type, title: 'Frage', description: '', outputs: [{ id: 'yes', label: 'Ja' }, { id: 'no', label: 'Nein' }] }
  if (type === 'checklist') return { id, type, title: 'Checkliste', description: '', checklistItems: [''] }
  return { id, type, title: type === 'end' ? 'Ende' : 'Neuer Schritt', description: '' }
}

export function categoryLabel(value) {
  return KNOWLEDGE_PROCESS_CATEGORIES.find((item) => item.value === value)?.label || '—'
}

export function statusLabel(value) {
  return KNOWLEDGE_PROCESS_STATUSES.find((item) => item.value === value)?.label || 'Entwurf'
}

export function formatProcessDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

export async function listKnowledgeProcesses(canEdit) {
  const snapshot = await getDocs(canEdit ? processes : query(processes, where('status', '==', 'active')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((left, right) => milliseconds(right.updatedAt) - milliseconds(left.updatedAt))
}

export async function getKnowledgeProcess(id) {
  const snapshot = await getDoc(doc(db, 'knowledgeProcesses', id))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function saveKnowledgeProcess(id, process, status) {
  const result = await httpsCallable(functions, 'saveKnowledgeProcess')({ id: id || undefined, process, status })
  return result.data
}

export function outgoingEdges(process, nodeId) {
  return (process.edges || []).filter((edge) => edge.sourceId === nodeId)
}

export function findNode(process, nodeId) {
  return (process.nodes || []).find((node) => node.id === nodeId)
}

export function processValidationErrors(process) {
  const errors = []
  if (!process.title?.trim()) errors.push('Bitte einen Prozesstitel eingeben.')
  if (!process.category) errors.push('Bitte eine Kategorie auswählen.')
  const start = (process.nodes || []).find((node) => node.type === 'start')
  if (!start || outgoingEdges(process, start.id).length === 0) errors.push('Nach dem Startblock fehlt ein Schritt.')
  const nodesById = new Map((process.nodes || []).map((node) => [node.id, node]))
  const outgoing = new Map((process.nodes || []).map((node) => [node.id, outgoingEdges(process, node.id)]))
  for (const node of process.nodes || []) {
    const edges = outgoing.get(node.id) || []
    if (!node.title?.trim()) errors.push(`Der Block „${node.type}“ benötigt einen Titel.`)
    if (node.type === 'decision' && (node.outputs || []).some((output) => !output.label?.trim() || edges.filter((edge) => edge.sourceOutputId === output.id).length !== 1)) errors.push(`Jeder Antwortweg der Frage „${node.title || 'Frage'}“ benötigt einen nächsten Schritt.`)
    if (!['decision', 'end'].includes(node.type) && edges.length !== 1) errors.push(`„${node.title || 'Schritt'}“ benötigt genau einen nächsten Schritt.`)
    if (node.type === 'end' && edges.length) errors.push(`Der Endblock „${node.title || 'Ende'}“ darf keinen Folgeschritt haben.`)
  }
  if (!start) return [...new Set(errors)]
  const visited = new Set(); const visiting = new Set()
  function walk(nodeId) {
    if (visiting.has(nodeId)) { errors.push('Zirkuläre Prozesswege sind in Phase 1 nicht zulässig.'); return }
    if (visited.has(nodeId)) return
    visiting.add(nodeId)
    for (const edge of outgoing.get(nodeId) || []) walk(edge.targetId)
    visiting.delete(nodeId); visited.add(nodeId)
  }
  walk(start.id)
  if (visited.size !== (process.nodes || []).length) errors.push('Alle Prozessblöcke müssen mit dem Start verbunden sein.')
  if (![...visited].some((id) => nodesById.get(id)?.type === 'end')) errors.push('Mindestens ein Weg muss in einem Endblock enden.')
  return [...new Set(errors)]
}
