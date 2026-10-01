import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
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

  return <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="document-details-modal" role="dialog" aria-modal="true" aria-labelledby="document-details-title"><div className="document-details-modal__heading"><h2 id="document-details-title"><StaticText source={"Dokumentdetails"} /></h2><TranslatedProps sources={{"aria-label":"Details schließen","title":"Schließen"}}><button className="document-details-modal__close" type="button" onClick={onClose} aria-label="Details schließen" title="Schließen">×</button></TranslatedProps></div><dl className="document-details"><TranslatedProps sources={{"label":"Titel"}}><Detail label="Titel">{documentItem.title}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Kurzbeschreibung"}}><Detail label="Kurzbeschreibung">{documentItem.description}</Detail></TranslatedProps><TranslatedProps sources={{"label":"Gültig bis"}}><Detail label="Gültig bis">{formatDocumentDate(documentItem.expirationDate)}</Detail></TranslatedProps><Detail label="Dateigröße">{formatFileSize(documentItem.fileSize)}</Detail><Detail label="Seiten">{documentItem.pageCount ? `${documentItem.pageCount}` : '—'}</Detail><Detail label="Hochgeladen am">{formatDocumentDate(documentItem.createdAt)}</Detail><Detail label="Hochgeladen von">{documentItem.uploadedByName}</Detail><Detail label="Zuletzt geändert">{formatDocumentDate(documentItem.updatedAt)}</Detail><div className="document-details__file-name"><dt><StaticText source={"Dateiname"} /></dt><dd>{documentItem.fileName || '—'}</dd></div></dl></section></div>
}
