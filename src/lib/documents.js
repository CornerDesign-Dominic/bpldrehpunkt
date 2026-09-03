import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase.js'

export const INTERNAL_DOCUMENTS_COLLECTION = 'internalDocuments'

// Central action names provide a stable base for future role checks.
export const DOCUMENT_ACTIONS = ['view', 'download', 'upload', 'edit', 'delete']

const documentsRef = collection(db, INTERNAL_DOCUMENTS_COLLECTION)
const trim = (value) => (value ?? '').trim()

export class DocumentOperationError extends Error {
  constructor(stage, originalError) {
    super(`Dokumentaktion fehlgeschlagen: ${stage}`)
    this.name = 'DocumentOperationError'
    this.stage = stage
    this.code = originalError?.code
    this.originalError = originalError
  }
}

function documentFailure(stage, error) {
  // Keep Firebase's original error available to support diagnoses in production.
  console.error(`Dokumente: Firebase-Fehler bei ${stage}.`, error)
  return new DocumentOperationError(stage, error)
}

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
    description: trim(values.description),
    expirationDate: values.expirationDate || null,
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '.pdf')
}

export function createEmptyDocument() {
  return { title: '', description: '', expirationDate: '' }
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

export function getDocumentErrorMessage(error) {
  const code = error?.code || error?.originalError?.code
  if (['storage/unauthorized', 'permission-denied', 'firestore/permission-denied'].includes(code)) return 'Keine Berechtigung zum Hochladen oder Bearbeiten von Dokumenten.'
  if (code === 'storage/unauthenticated') return 'Bitte erneut anmelden, bevor du ein Dokument hochlädst.'
  if (code === 'storage/quota-exceeded') return 'Der Speicherplatz für Dokumente ist erschöpft.'
  if (code === 'storage/canceled') return 'Der PDF-Upload wurde abgebrochen.'
  if (error?.stage === 'upload') return 'PDF konnte nicht in den Speicher geladen werden.'
  if (error?.stage === 'createRecord') return 'PDF wurde hochgeladen, aber der Dokumenteintrag konnte nicht angelegt werden. Die Datei wurde wieder entfernt.'
  if (error?.stage === 'updateRecord') return 'Die Dokumentangaben konnten nicht gespeichert werden.'
  if (error?.stage === 'deleteReplacedFile') return 'Die neue PDF wurde gespeichert, aber die bisherige Datei konnte nicht entfernt werden.'
  if (error?.stage === 'deleteFile') return 'Die PDF-Datei konnte nicht gelöscht werden.'
  if (error?.stage === 'deleteRecord') return 'Der Dokumenteintrag konnte nicht gelöscht werden.'
  if (error?.stage === 'readFile') return 'Die PDF-Datei konnte nicht geladen werden.'
  return 'Das Dokument konnte nicht gespeichert werden.'
}

export async function listInternalDocuments() {
  const snapshot = await getDocs(documentsRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt))
}

async function uploadDocumentFile(documentId, file) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const storagePath = `internalDocuments/${documentId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  try {
    await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf', contentDisposition: `inline; filename="${sanitizeFileName(file.name)}"` })
  } catch (error) {
    throw documentFailure('upload', error)
  }
  return { fileName: file.name, storagePath, contentType: 'application/pdf', fileSize: file.size }
}

export async function createInternalDocument(values, file) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const documentRef = doc(documentsRef)
  const fileData = await uploadDocumentFile(documentRef.id, file)
  try {
    await setDoc(documentRef, { id: documentRef.id, ...metadataPayload(values), ...fileData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  } catch (error) {
    await deleteObject(ref(storage, fileData.storagePath)).catch((cleanupError) => console.error('Dokumente: hochgeladene PDF konnte nach fehlgeschlagenem Firestore-Eintrag nicht entfernt werden.', cleanupError))
    throw documentFailure('createRecord', error)
  }
  return documentRef.id
}

export async function updateInternalDocument(document, values) {
  try {
    await updateDoc(doc(db, INTERNAL_DOCUMENTS_COLLECTION, document.id), { ...metadataPayload(values), updatedAt: serverTimestamp() })
  } catch (error) {
    throw documentFailure('updateRecord', error)
  }
}

export async function deleteInternalDocument(document) {
  if (document.storagePath) {
    try {
      await deleteObject(ref(storage, document.storagePath))
    } catch (error) {
      throw documentFailure('deleteFile', error)
    }
  }
  try {
    await deleteDoc(doc(db, INTERNAL_DOCUMENTS_COLLECTION, document.id))
  } catch (error) {
    throw documentFailure('deleteRecord', error)
  }
}

export async function getInternalDocumentBlob(document) {
  try {
    return await getBlob(ref(storage, document.storagePath))
  } catch (error) {
    throw documentFailure('readFile', error)
  }
}
