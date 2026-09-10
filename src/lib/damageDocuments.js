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
import { DocumentOperationError, getPdfFileError, isPdfFile, MAX_DOCUMENT_FILE_SIZE } from './documents.js'
import { db, storage } from './firebase.js'

const trim = (value) => (value ?? '').trim()

function documentFailure(stage, error) {
  console.error(`Schäden: Firebase-Fehler bei ${stage}.`, error)
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

function metadataPayload(values, { includePageCount = false } = {}) {
  return {
    title: trim(values.title),
    description: trim(values.description),
    ...(includePageCount ? { pageCount: Number.isInteger(values.pageCount) && values.pageCount > 0 ? values.pageCount : null } : {}),
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '.pdf')
}

export async function listDamageCaseDocuments(damageCaseId) {
  const snapshot = await getDocs(collection(db, 'damageCases', damageCaseId, 'documents'))
  return snapshot.docs.map(mapSnapshot).sort((left, right) => timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt))
}

export async function createDamageCaseDocument(damageCaseId, values, file, uploader = {}) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const fileError = getPdfFileError(file)
  if (fileError) throw new Error(fileError)
  const documentRef = doc(collection(db, 'damageCases', damageCaseId, 'documents'))
  const storagePath = `damage-cases/${damageCaseId}/documents/${documentRef.id}.pdf`
  const fileData = { fileName: file.name, storagePath, contentType: 'application/pdf', fileSize: file.size }
  try {
    await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf', contentDisposition: `inline; filename="${sanitizeFileName(file.name)}"` })
  } catch (error) {
    throw documentFailure('upload', error)
  }
  try {
    await setDoc(documentRef, { id: documentRef.id, ...metadataPayload(values, { includePageCount: true }), ...fileData, uploadedByUserId: uploader.id || null, uploadedByName: trim(uploader.name), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  } catch (error) {
    await deleteObject(ref(storage, storagePath)).catch((cleanupError) => console.error('Schäden: hochgeladene PDF konnte nach fehlgeschlagenem Dokumenteintrag nicht entfernt werden.', cleanupError))
    throw documentFailure('createRecord', error)
  }
  return documentRef.id
}

export async function updateDamageCaseDocument(damageCaseId, documentItem, values) {
  try {
    await updateDoc(doc(db, 'damageCases', damageCaseId, 'documents', documentItem.id), { ...metadataPayload(values), updatedAt: serverTimestamp() })
  } catch (error) {
    throw documentFailure('updateRecord', error)
  }
}

export async function deleteDamageCaseDocument(damageCaseId, documentItem) {
  if (documentItem.storagePath) {
    try {
      await deleteObject(ref(storage, documentItem.storagePath))
    } catch (error) {
      throw documentFailure('deleteFile', error)
    }
  }
  try {
    await deleteDoc(doc(db, 'damageCases', damageCaseId, 'documents', documentItem.id))
  } catch (error) {
    throw documentFailure('deleteRecord', error)
  }
}

export async function getDamageCaseDocumentBlob(documentItem) {
  try {
    return await getBlob(ref(storage, documentItem.storagePath))
  } catch (error) {
    throw documentFailure('readFile', error)
  }
}

export { MAX_DOCUMENT_FILE_SIZE }
