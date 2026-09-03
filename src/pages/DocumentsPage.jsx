import { useEffect, useMemo, useState } from 'react'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentsGallery from '../components/documents/DocumentsGallery.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { useAuth } from '../auth/useAuth.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  createInternalDocument,
  deleteInternalDocument,
  getDocumentErrorMessage,
  getInternalDocumentBlob,
  listInternalDocuments,
  updateInternalDocument,
} from '../lib/documents.js'

GlobalWorkerOptions.workerSrc = pdfWorker

async function getPdfPageCount(file) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    const pageCount = pdf.numPages
    await pdf.destroy()
    return pageCount
  } finally {
    loadingTask.destroy()
  }
}

function uploaderName(profile, user) {
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  return fullName || user?.email || ''
}

export default function DocumentsPage() {
  const { canEdit } = usePermissions()
  const { profile, user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [editingDocument, setEditingDocument] = useState(undefined)
  const [detailsDocument, setDetailsDocument] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function reloadDocuments() {
    const entries = await listInternalDocuments()
    setDocuments(entries)
  }

  useEffect(() => {
    let current = true
    listInternalDocuments().then((entries) => { if (current) setDocuments(entries) }).catch(() => { if (current) setError('Die Dokumente konnten nicht geladen werden. Bitte Firestore-Zugriff, Storage und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const visibleDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return documents.filter((documentItem) => !term || [documentItem.title, documentItem.description, documentItem.fileName].some((value) => value?.toLocaleLowerCase('de-DE').includes(term)))
  }, [documents, search])

  const selectedDocument = editingDocument && editingDocument !== 'new' ? (editingDocument.document || editingDocument) : null

  function requireDocumentEditPermission() {
    if (canEdit('documents')) return
    const permissionError = new Error('Keine Berechtigung zum Hochladen von Dokumenten.')
    permissionError.code = 'storage/unauthorized'
    throw permissionError
  }

  async function saveDocument(values, file) {
    requireDocumentEditPermission()
    await performSave(selectedDocument, values, file)
  }

  async function performSave(documentItem, values, file) {
    try {
      requireDocumentEditPermission()
      if (documentItem) await updateInternalDocument(documentItem, values)
      else {
        let pageCount = null
        try { pageCount = await getPdfPageCount(file) } catch (pageCountError) { console.warn('Dokumente: Seitenzahl konnte nicht ermittelt werden.', pageCountError) }
        await createInternalDocument({ ...values, pageCount }, file, { id: user?.uid, name: uploaderName(profile, user) })
      }
      await reloadDocuments()
      setEditingDocument(undefined)
      setToast(documentItem ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) {
      setError(getDocumentErrorMessage(saveError))
      throw saveError
    }
  }

  async function deleteDocument(documentItem) {
    try {
      requireDocumentEditPermission()
      await deleteInternalDocument(documentItem)
      await reloadDocuments()
      setToast('Dokument dauerhaft gelöscht.')
    } catch (deleteError) {
      setError(getDocumentErrorMessage(deleteError))
      throw deleteError
    }
  }

  async function confirmAction() {
    const target = confirmation
    if (!target) return
    setIsConfirming(true)
    try {
      await deleteDocument(target.document)
      setConfirmation(null)
    } catch {
      // The operation helper has already logged the original Firebase error and
      // placed a readable message in the form/page.
    } finally { setIsConfirming(false) }
  }

  async function openDocument(documentItem) {
    const openedWindow = window.open('about:blank', '_blank')
    if (openedWindow) openedWindow.opener = null
    try {
      const blob = await getInternalDocumentBlob(documentItem)
      const url = URL.createObjectURL(blob)
      if (openedWindow) openedWindow.location.href = url
      else window.location.assign(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (openError) {
      openedWindow?.close()
      setError(getDocumentErrorMessage(openError))
    }
  }

  async function downloadDocument(documentItem) {
    try {
      const blob = await getInternalDocumentBlob(documentItem)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = documentItem.fileName
      anchor.style.display = 'none'
      window.document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (downloadError) {
      setError(getDocumentErrorMessage(downloadError))
    }
  }

  const editable = canEdit('documents')
  const selectedEditDocument = editingDocument && editingDocument !== 'new' ? (editingDocument.document || editingDocument) : null
  return <div className="documents-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(confirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={isConfirming} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    <div className="list-toolbar documents-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Dokumente suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Dokumente suchen" /></label></div>{editable && <button className="button" type="button" onClick={() => setEditingDocument('new')}>Dokument hochladen</button>}</div>
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingDocument(undefined) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={selectedEditDocument ? 'Dokument bearbeiten' : 'Dokument hochladen'}><DocumentForm key={selectedEditDocument?.id || 'new'} documentItem={selectedEditDocument} onCancel={() => setEditingDocument(undefined)} onSubmit={saveDocument} /></section></div>}
    {error && <p className="form-error">{error}</p>}
    <DocumentsGallery documents={visibleDocuments} loading={loading} onOpen={openDocument} onDownload={downloadDocument} onDetails={setDetailsDocument} onEdit={(documentItem) => setEditingDocument(documentItem)} onDelete={(documentItem) => setConfirmation({ type: 'delete', document: documentItem })} canEdit={editable} />
  </div>
}
