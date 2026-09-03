import { useEffect, useState } from 'react'
import { formatDocumentDate, formatFileSize, getInternalDocumentUrl } from '../../lib/documents.js'

function EyeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
}

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
    getInternalDocumentUrl(documentItem).then((nextUrl) => { if (current) setUrl(nextUrl) }).catch(() => { if (current) setUrl('') })
    return () => { current = false }
  }, [documentItem])

  return <button className="document-card__preview" type="button" onClick={() => onOpen(documentItem)} aria-label={`${documentItem.title} öffnen`} title="Im Browser öffnen">
    {url ? <object data={`${url}#page=1&view=FitH`} type="application/pdf" tabIndex="-1" aria-hidden="true"><span>PDF</span></object> : <span className="document-card__preview-fallback">PDF</span>}
    <span className="document-card__preview-overlay">Vorschau öffnen</span>
  </button>
}

export default function DocumentsGallery({ documents, loading, onOpen, onDownload, onEdit, onReplace, onDelete, canEdit }) {
  if (loading) return <p className="documents-gallery__state">Dokumente werden geladen …</p>
  if (!documents.length) return <p className="documents-gallery__state">Keine Dokumente gespeichert.</p>

  return <div className="documents-gallery">
    {documents.map((documentItem) => <article className="document-card" key={documentItem.id}>
      <DocumentPreview documentItem={documentItem} onOpen={onOpen} />
      <div className="document-card__content">
        <div className="document-card__heading"><div><h2 title={documentItem.title}>{documentItem.title}</h2><p>{documentItem.category || 'Allgemein'}</p></div>{canEdit && <details className="document-card__menu"><summary aria-label={`Aktionen für ${documentItem.title}`} title="Weitere Aktionen"><MoreIcon /></summary><div><button type="button" onClick={() => onEdit(documentItem)}>Angaben bearbeiten</button><button type="button" onClick={() => onReplace(documentItem)}>PDF ersetzen</button><button className="document-card__delete" type="button" onClick={() => onDelete(documentItem)}>Löschen</button></div></details>}</div>
        <p className="document-card__date">Hochgeladen am {formatDocumentDate(documentItem.createdAt)}</p>
        <p className="document-card__file" title={documentItem.fileName}>{documentItem.fileName} · {formatFileSize(documentItem.fileSize)}</p>
        <div className="document-card__actions"><button type="button" onClick={() => onOpen(documentItem)} aria-label={`${documentItem.title} öffnen`} title="Öffnen"><EyeIcon /></button><button type="button" onClick={() => onDownload(documentItem)} aria-label={`${documentItem.title} herunterladen`} title="Herunterladen"><DownloadIcon /></button></div>
      </div>
    </article>)}
  </div>
}
