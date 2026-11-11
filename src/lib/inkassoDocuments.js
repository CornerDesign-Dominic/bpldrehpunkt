import { caseOperation, reportCaseFailure } from './caseDiagnostics.js'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { DocumentOperationError, getPdfFileError, isPdfFile } from './documents.js'
import { db, storage } from './firebase.js'

const trim = (value) => (value ?? '').trim()

function documentFailure(stage, error) {
  return new DocumentOperationError(stage, error)
}

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }
function timestampValue(value) { return typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime() || 0 }
function sanitizeFileName(name) { return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '.pdf') }
function metadataPayload(values) { return { title: trim(values.title), description: trim(values.description) } }

export const listInkassoCaseDocuments = caseOperation('inkasso', 'load', async function listInkassoCaseDocuments(caseId) {
  const snapshot = await getDocs(collection(db, 'inkassoCases', caseId, 'documents'))
  return snapshot.docs.map(mapSnapshot).sort((left, right) => timestampValue(right.updatedAt || right.createdAt) - timestampValue(left.updatedAt || left.createdAt))
})

export const createInkassoCaseDocument = caseOperation('inkasso', 'upload', async function createInkassoCaseDocument(caseId, values, file, uploader = {}) {
  if (!isPdfFile(file)) throw new Error('Nur PDF-Dateien sind zulässig.')
  const fileError = getPdfFileError(file)
  if (fileError) throw new Error(fileError)
  const documentRef = doc(collection(db, 'inkassoCases', caseId, 'documents'))
  const storagePath = `inkasso-cases/${caseId}/documents/${documentRef.id}.pdf`
  try {
    await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf', contentDisposition: `inline; filename="${sanitizeFileName(file.name)}"` })
  } catch (error) { throw documentFailure('upload', error) }
  try {
    await setDoc(documentRef, { id: documentRef.id, ...metadataPayload(values), pageCount: null, fileName: file.name, storagePath, contentType: 'application/pdf', fileSize: file.size, uploadedByUserId: uploader.id || null, uploadedByName: trim(uploader.name), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  } catch (error) {
    await deleteObject(ref(storage, storagePath)).catch((error) => { reportCaseFailure('inkasso', 'cleanup', error) })
    throw documentFailure('createRecord', error)
  }
})

export const updateInkassoCaseDocument = caseOperation('inkasso', 'save', async function updateInkassoCaseDocument(caseId, documentItem, values) {
  try { await updateDoc(doc(db, 'inkassoCases', caseId, 'documents', documentItem.id), { ...metadataPayload(values), updatedAt: serverTimestamp() }) } catch (error) { throw documentFailure('updateRecord', error) }
})

export const deleteInkassoCaseDocument = caseOperation('inkasso', 'delete', async function deleteInkassoCaseDocument(caseId, documentItem) {
  if (documentItem.storagePath) {
    try { await deleteObject(ref(storage, documentItem.storagePath)) } catch (error) { throw documentFailure('deleteFile', error) }
  }
  try { await deleteDoc(doc(db, 'inkassoCases', caseId, 'documents', documentItem.id)) } catch (error) { throw documentFailure('deleteRecord', error) }
})

export const getInkassoCaseDocumentBlob = caseOperation('inkasso', 'download', async function getInkassoCaseDocumentBlob(documentItem) {
  try { return await getBlob(ref(storage, documentItem.storagePath)) } catch (error) { throw documentFailure('readFile', error) }
})
