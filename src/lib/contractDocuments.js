import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { getBlob, ref, uploadBytes } from 'firebase/storage'
import { db, storage, waitForAppCheckToken } from './firebase.js'
import { mutateContract } from './contracts.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { getPdfFileError } from './documents.js'

const records = (contractId) => collection(db, 'contracts', contractId, 'documents')
const blobRef = (contractId, id) => ref(storage, `contracts/${contractId}/documents/${id}.pdf`)

async function diagnosed(contractId, stage, action) {
  try { return await action() } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage, recordId: contractId, error })
    throw error
  }
}

export async function listContractDocuments(contractId) {
  return diagnosed(contractId, 'load', async () => {
    // Processing records remain visible after a reload. Only ready records may
    // reach the PDF gallery; the section renders the others as recovery states.
    const result = await getDocs(records(contractId))
    return result.docs.map((item) => ({ ...item.data(), uploadedByName: item.data().createdByName || '', id: item.id, contractId }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0))
  })
}

export async function getContractDocumentBlob(item) {
  return diagnosed(item.contractId, 'download', async () => {
    await waitForAppCheckToken()
    return getBlob(blobRef(item.contractId, item.id))
  })
}

// The caller retains this object until the action is confirmed. Payloads and IDs
// must survive uncertain replies so a retry resumes the same document.
export function createDocumentUploadAttempt(contractId, values, file) {
  const validationError = getPdfFileError(file)
  if (validationError || !file || file.size < 1 || file.name.length > 240) throw new Error('invalid-document-file')
  const title = values.title.trim()
  const description = values.description.trim()
  if (!title || title.length > 240 || description.length > 4000) throw new Error('invalid-document-values')
  return {
    contractId, id: doc(records(contractId)).id, file,
    values: { title, description, fileName: file.name, fileSize: file.size, contentType: 'application/pdf', pageCount: null },
    reserveId: crypto.randomUUID(), finalizeId: crypto.randomUUID(), discardId: crypto.randomUUID(),
    reservation: null, uploadAttempted: false, uploaded: false,
  }
}

export async function uploadContractDocument(attempt) {
  return diagnosed(attempt.contractId, 'upload', async () => {
    const { contractId, id } = attempt
    if (!attempt.reservation) attempt.reservation = await mutateContract(contractId, {
      action: 'document.reserve', recordId: id, expectedRevision: 0, values: attempt.values, mutationId: attempt.reserveId,
    })
    const finalize = () => mutateContract(contractId, {
      action: 'document.finalize', recordId: id, expectedRevision: attempt.reservation.revision, mutationId: attempt.finalizeId,
    })
    if (attempt.uploadAttempted) {
      try { return await finalize() } catch (error) {
        // Pending blobs are intentionally unreadable. The server decides whether
        // a previous upload completed; only a confirmed missing blob is retried.
        if (error?.details?.reason !== 'upload-missing') throw error
      }
    }
    await waitForAppCheckToken()
    attempt.uploadAttempted = true
    try {
      await uploadBytes(blobRef(contractId, id), attempt.file, {
        contentType: 'application/pdf', customMetadata: { contractId, documentId: id },
      })
      attempt.uploaded = true
    } catch (uploadError) {
      try { return await finalize() } catch (finalizeError) {
        throw finalizeError?.details?.reason === 'upload-missing' ? uploadError : finalizeError
      }
    }
    return finalize()
  })
}

export async function discardContractDocumentUpload(attempt) {
  return diagnosed(attempt.contractId, 'delete', async () => {
    // Resolve an uncertain reservation before discarding: a delayed reservation
    // must not arrive after we observed an absent record and closed the form.
    if (!attempt.reservation) attempt.reservation = await mutateContract(attempt.contractId, {
      action: 'document.reserve', recordId: attempt.id, expectedRevision: 0, values: attempt.values, mutationId: attempt.reserveId,
    })
    // Never infer failure from a lost finalize response. A ready record is kept.
    const snapshot = await getDoc(doc(records(attempt.contractId), attempt.id))
    if (!snapshot.exists()) return { discarded: true }
    const item = snapshot.data()
    if (item.status === 'ready') return { discarded: false, ready: true }
    if (item.status !== 'pending') throw Object.assign(new Error('Upload is being finalized'), { code: 'failed-precondition' })
    await mutateContract(attempt.contractId, {
      action: 'document.delete', recordId: attempt.id, expectedRevision: item.revision, mutationId: attempt.discardId,
    })
    return { discarded: true }
  })
}

export async function updateContractDocument(contractId, item, values, mutationId) {
  return diagnosed(contractId, 'save', () => mutateContract(contractId, {
    action: 'document.update', recordId: item.id, expectedRevision: item.revision,
    values: { title: values.title.trim(), description: values.description.trim() }, mutationId,
  }))
}

export async function deleteContractDocument(contractId, item, mutationId) {
  return diagnosed(contractId, 'delete', () => mutateContract(contractId, {
    action: 'document.delete', recordId: item.id, expectedRevision: item.revision, mutationId,
  }))
}

export function contractDocumentRecoveryMutation(item, userId, pendingAction = 'document.finalize', mutationId) {
  const locked = ['finalizing', 'deleting'].includes(item.status)
  const owner = locked ? item.operationActorId : item.createdBy
  if (!userId || owner !== userId || !Number.isInteger(item.revision) || item.revision < 1) {
    throw Object.assign(new Error('This document operation belongs to another user'), { code: 'permission-denied' })
  }
  if (locked) {
    if (!item.operationMutationId) throw Object.assign(new Error('Missing document operation identity'), { code: 'failed-precondition' })
    return { action: item.status === 'deleting' ? 'document.delete' : 'document.finalize', recordId: item.id, expectedRevision: item.revision, mutationId: item.operationMutationId }
  }
  if (item.status !== 'pending' || !['document.finalize', 'document.delete'].includes(pendingAction) || !mutationId) {
    throw Object.assign(new Error('Document is not recoverable'), { code: 'failed-precondition' })
  }
  return { action: pendingAction, recordId: item.id, expectedRevision: item.revision, mutationId }
}

export async function recoverContractDocument(contractId, item, userId, pendingAction, mutationId) {
  const mutation = contractDocumentRecoveryMutation(item, userId, pendingAction, mutationId)
  return diagnosed(contractId, mutation.action === 'document.delete' ? 'delete' : 'upload', () => mutateContract(contractId, mutation))
}
