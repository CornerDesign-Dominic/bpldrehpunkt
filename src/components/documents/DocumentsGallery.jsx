import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getInternalDocumentBlob } from '../../lib/documents.js'

GlobalWorkerOptions.workerSrc = pdfWorker

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
}

function DocumentPreview({ documentItem, onOpen }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let current = true
    let objectUrl = ''
    let loadingTask
    async function renderPreview() {
      try {
        const blob = await getInternalDocumentBlob(documentItem)
        loadingTask = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        const baseViewport = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: 520 / baseViewport.width })
        const canvas = window.document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas-Kontext für die PDF-Vorschau ist nicht verfügbar.')
        await page.render({ canvasContext: context, viewport }).promise
        const previewBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!previewBlob) throw new Error('PDF-Vorschau konnte nicht erzeugt werden.')
        objectUrl = URL.createObjectURL(previewBlob)
        if (current) setUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
        await pdf.destroy()
      } catch (error) {
        console.error('Dokumente: PDF-Vorschau konnte nicht geladen werden.', error)
        if (current) setUrl('')
      }
    }
    renderPreview()
    return () => { current = false; loadingTask?.destroy(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [documentItem])

  return <button className="document-card__preview" type="button" onClick={() => onOpen(documentItem)} aria-label={`${documentItem.title} öffnen`} title="Im Browser öffnen">
    {url ? <img src={url} alt="" /> : <span className="document-card__preview-fallback">PDF</span>}
    <span className="document-card__preview-overlay">Vorschau öffnen</span>
  </button>
}

function DocumentActionsMenu({ documentItem, onDelete, onDetails, onEdit }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) { if (!menuRef.current?.contains(event.target)) setOpen(false) }
    function closeOnEscape(event) { if (event.key === 'Escape') setOpen(false) }
    window.document.addEventListener('pointerdown', closeOnOutsideClick)
    window.document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div ref={menuRef} className="document-card__menu" onMouseLeave={() => setOpen(false)}><button className="document-card__menu-trigger" type="button" aria-label={`Aktionen für ${documentItem.title}`} aria-expanded={open} title="Weitere Aktionen" onClick={() => setOpen((current) => !current)}><MoreIcon /></button>{open && <div role="menu"><button role="menuitem" type="button" onClick={() => { setOpen(false); onDetails(documentItem) }}>Details</button><button role="menuitem" type="button" onClick={() => { setOpen(false); onEdit(documentItem) }}>Bearbeiten</button><button className="document-card__delete" role="menuitem" type="button" onClick={() => { setOpen(false); onDelete(documentItem) }}>Löschen</button></div>}</div>
}

export default function DocumentsGallery({ documents, loading, onOpen, onDownload, onDetails, onEdit, onDelete, canEdit }) {
  if (loading) return <p className="documents-gallery__state">Dokumente werden geladen …</p>
  if (!documents.length) return <p className="documents-gallery__state">Keine Dokumente gespeichert.</p>

  return <div className="documents-gallery">
    {documents.map((documentItem) => <article className="document-card" key={documentItem.id}>
      <DocumentPreview documentItem={documentItem} onOpen={onOpen} />
      <div className="document-card__content">
        <div className="document-card__heading"><div><h2 title={documentItem.title}>{documentItem.title}</h2></div><div className="document-card__heading-actions">{canEdit && <DocumentActionsMenu documentItem={documentItem} onDetails={onDetails} onEdit={onEdit} onDelete={onDelete} />}<button className="document-card__download" type="button" onClick={() => onDownload(documentItem)} aria-label={`${documentItem.title} herunterladen`} title="Herunterladen"><DownloadIcon /></button></div></div>
      </div>
    </article>)}
  </div>
}
