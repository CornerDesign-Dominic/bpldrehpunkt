import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase.js'

export const INTERNAL_DOCUMENTS_COLLECTION = 'internalDocuments'

// Central action names provide a stable base for future role checks.
export const DOCUMENT_ACTIONS = ['view', 'download', 'upload', 'edit', 'replace', 'delete']

const documentsRef = collection(db, INTERNAL_DOCUMENTS_COLLECTION)
const trim = (value) => (value ?? '').trim()

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function timestampValue(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  return new Date(value).getTime() || 0
}

function metadataPayload(values) {
  return {
    title: trim(values.title),
    category: trim(values.category),
    description: trim(values.description),
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function createEmptyDocument() {
  return { title: '', category: '', description: '' }
}

export function isPdfFile(file) {
  return Boolean(file) && (file.type === 'application/pdf' || file.name.toLocaleLowerCase('de-DE').endsWith('.pdf'))
}

export function formatDocumentDate(value) {
  const date = value?.toDate?.() ?? (value ? new Date(`${value}T12:00:00`) : null)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('de-DE').format(date) : '—'
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
}

export async function listInternalDocuments() {
  const snapshot = await getDocs(documentsRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt))
}

async function uploadDocumentFile(documentId, file) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const storagePath = `internalDocuments/${documentId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf', contentDisposition: `inline; filename="${sanitizeFileName(file.name)}"` })
  return { fileName: file.name, storagePath, contentType: 'application/pdf', fileSize: file.size }
}

export async function createInternalDocument(values, file) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const documentRef = doc(documentsRef)
  const fileData = await uploadDocumentFile(documentRef.id, file)
  try {
    await setDoc(documentRef, { id: documentRef.id, ...metadataPayload(values), ...fileData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  } catch (error) {
    await deleteObject(ref(storage, fileData.storagePath)).catch(() => {})
    throw error
  }
  return documentRef.id
}

export async function updateInternalDocument(document, values, file) {
  let fileData = null
  if (file) fileData = await uploadDocumentFile(document.id, file)
  try {
    await updateDoc(doc(db, INTERNAL_DOCUMENTS_COLLECTION, document.id), { ...metadataPayload(values), ...(fileData || {}), updatedAt: serverTimestamp() })
  } catch (error) {
    if (fileData) await deleteObject(ref(storage, fileData.storagePath)).catch(() => {})
    throw error
  }
  if (fileData && document.storagePath && document.storagePath !== fileData.storagePath) await deleteObject(ref(storage, document.storagePath))
}

export async function deleteInternalDocument(document) {
  if (document.storagePath) await deleteObject(ref(storage, document.storagePath))
  await deleteDoc(doc(db, INTERNAL_DOCUMENTS_COLLECTION, document.id))
}

export async function getInternalDocumentUrl(document) {
  return getDownloadURL(ref(storage, document.storagePath))
}
