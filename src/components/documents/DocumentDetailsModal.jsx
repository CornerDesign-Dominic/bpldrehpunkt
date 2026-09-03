import { useEffect } from 'react'
import { formatDocumentDate, formatFileSize } from '../../lib/documents.js'

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

export default function DocumentDetailsModal({ documentItem, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose() }
    window.document.addEventListener('keydown', closeOnEscape)
    return () => window.document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="document-details-modal" role="dialog" aria-modal="true" aria-labelledby="document-details-title"><div className="document-details-modal__heading"><h2 id="document-details-title">Dokumentdetails</h2><button className="text-button" type="button" onClick={onClose}>Schließen</button></div><dl className="document-details"><Detail label="Titel">{documentItem.title}</Detail><Detail label="Kurzbeschreibung">{documentItem.description}</Detail><Detail label="Gültig bis">{formatDocumentDate(documentItem.expirationDate)}</Detail><Detail label="Datei">{documentItem.fileName}</Detail><Detail label="Dateigröße">{formatFileSize(documentItem.fileSize)}</Detail><Detail label="Seiten">{documentItem.pageCount ? `${documentItem.pageCount}` : '—'}</Detail><Detail label="Hochgeladen am">{formatDocumentDate(documentItem.createdAt)}</Detail><Detail label="Hochgeladen von">{documentItem.uploadedByName}</Detail><Detail label="Zuletzt geändert">{formatDocumentDate(documentItem.updatedAt)}</Detail></dl></section></div>
}
