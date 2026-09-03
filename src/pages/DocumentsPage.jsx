import { useEffect, useMemo, useState } from 'react'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import DocumentsGallery from '../components/documents/DocumentsGallery.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import {
  createInternalDocument,
  deleteInternalDocument,
  getInternalDocumentUrl,
  listInternalDocuments,
  updateInternalDocument,
} from '../lib/documents.js'

export default function DocumentsPage() {
  const { canEdit } = usePermissions()
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [editingDocument, setEditingDocument] = useState(undefined)
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
    return documents.filter((documentItem) => !term || [documentItem.title, documentItem.category, documentItem.description, documentItem.fileName].some((value) => value?.toLocaleLowerCase('de-DE').includes(term)))
  }, [documents, search])

  const selectedDocument = editingDocument && editingDocument !== 'new' ? (editingDocument.document || editingDocument) : null

  async function saveDocument(values, file) {
    if (selectedDocument && file) {
      setConfirmation({ type: 'replace', document: selectedDocument, values, file })
      return
    }
    await performSave(selectedDocument, values, file)
  }

  async function performSave(documentItem, values, file) {
    try {
      if (documentItem) await updateInternalDocument(documentItem, values, file)
      else await createInternalDocument(values, file)
      await reloadDocuments()
      setEditingDocument(undefined)
      setToast(documentItem ? (file ? 'PDF ersetzt.' : 'Dokument aktualisiert.') : 'Dokument hochgeladen.')
    } catch (saveError) {
      setError('Das Dokument konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function deleteDocument(documentItem) {
    try {
      await deleteInternalDocument(documentItem)
      await reloadDocuments()
      setToast('Dokument dauerhaft gelöscht.')
    } catch {
      setError('Das Dokument konnte nicht gelöscht werden.')
    }
  }

  async function confirmAction() {
    const target = confirmation
    if (!target) return
    setIsConfirming(true)
    try {
      if (target.type === 'delete') await deleteDocument(target.document)
      else await performSave(target.document, target.values, target.file)
      setConfirmation(null)
    } finally { setIsConfirming(false) }
  }

  async function openDocument(documentItem) {
    const openedWindow = window.open('', '_blank', 'noopener')
    try {
      const url = await getInternalDocumentUrl(documentItem)
      if (openedWindow) openedWindow.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      openedWindow?.close()
      setError('Die Dokumentdatei konnte nicht geöffnet werden.')
    }
  }

  async function downloadDocument(documentItem) {
    try {
      const url = await getInternalDocumentUrl(documentItem)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = documentItem.fileName
      anchor.style.display = 'none'
      window.document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } catch {
      setError('Die Dokumentdatei konnte nicht heruntergeladen werden.')
    }
  }

  const editable = canEdit('documents')
  const selectedEditDocument = editingDocument && editingDocument !== 'new' ? (editingDocument.document || editingDocument) : null
  const isReplacing = Boolean(editingDocument && editingDocument !== 'new' && editingDocument.replace)
  return <div className="documents-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.type === 'replace' ? 'PDF ersetzen?' : 'Dokument dauerhaft löschen?'} message={confirmation?.type === 'replace' ? 'Die bisherige PDF-Datei wird dauerhaft gelöscht und durch die neue ersetzt.' : 'Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.'} confirmLabel={confirmation?.type === 'replace' ? 'PDF ersetzen' : 'Endgültig löschen'} submittingLabel={confirmation?.type === 'replace' ? 'Wird ersetzt …' : 'Wird gelöscht …'} variant="danger" isSubmitting={isConfirming} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    <div className="list-toolbar documents-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Dokumente suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Dokumente suchen" /></label></div>{editable && <button className="button" type="button" onClick={() => setEditingDocument('new')}>Dokument hochladen</button>}</div>
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingDocument(undefined) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={isReplacing ? 'PDF ersetzen' : selectedEditDocument ? 'Dokument bearbeiten' : 'Dokument hochladen'}><DocumentForm key={selectedEditDocument?.id || 'new'} documentItem={selectedEditDocument} replacing={isReplacing} onCancel={() => setEditingDocument(undefined)} onSubmit={saveDocument} /></section></div>}
    {error && <p className="form-error">{error}</p>}
    <DocumentsGallery documents={visibleDocuments} loading={loading} onOpen={openDocument} onDownload={downloadDocument} onEdit={(documentItem) => setEditingDocument(documentItem)} onReplace={(documentItem) => setEditingDocument({ document: documentItem, replace: true })} onDelete={(documentItem) => setConfirmation({ type: 'delete', document: documentItem })} canEdit={editable} />
  </div>
}
