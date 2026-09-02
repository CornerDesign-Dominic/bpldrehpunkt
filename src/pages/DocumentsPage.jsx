import { useEffect, useMemo, useState } from 'react'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import DocumentsTable from '../components/documents/DocumentsTable.jsx'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import {
  archiveInternalDocument,
  createInternalDocument,
  getInternalDocumentUrl,
  listInternalDocuments,
  updateInternalDocument,
} from '../lib/documents.js'

export default function DocumentsPage() {
  const { canEdit } = usePermissions()
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [editingDocument, setEditingDocument] = useState(undefined)
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
    return documents.filter((documentItem) => (status === 'all' || documentItem.status === status) && (!term || [documentItem.title, documentItem.description, documentItem.fileName].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [documents, search, status])

  const selectedDocument = editingDocument && editingDocument !== 'new' ? editingDocument : null

  async function saveDocument(values, file) {
    try {
      if (selectedDocument) await updateInternalDocument(selectedDocument, values, file)
      else await createInternalDocument(values, file)
      await reloadDocuments()
      setEditingDocument(undefined)
      setToast(selectedDocument ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) {
      setError('Das Dokument konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function archiveDocument(documentItem) {
    try {
      await archiveInternalDocument(documentItem.id)
      await reloadDocuments()
      setToast('Dokument archiviert.')
    } catch {
      setError('Das Dokument konnte nicht archiviert werden.')
    }
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
  return <div className="documents-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="list-toolbar documents-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Dokumente suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Dokumente suchen" /></label><label className="filter-field"><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Aktiv</option><option value="archived">Archiviert</option><option value="all">Alle</option></select></label></div>{editable && <button className="button" type="button" onClick={() => setEditingDocument('new')}>Dokument hochladen</button>}</div>
    {editingDocument && <DocumentForm key={selectedDocument?.id || 'new'} documentItem={selectedDocument} onCancel={() => setEditingDocument(undefined)} onSubmit={saveDocument} />}
    {error && <p className="form-error">{error}</p>}
    <DocumentsTable documents={visibleDocuments} loading={loading} onOpen={openDocument} onDownload={downloadDocument} onEdit={setEditingDocument} onArchive={archiveDocument} canEdit={editable} />
  </div>
}
