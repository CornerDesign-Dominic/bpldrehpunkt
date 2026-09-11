import { useEffect, useRef, useState } from 'react'
import { ChevronIcon } from '../icons.jsx'
import { DocumentActionsMenu, DocumentPreview, DownloadIcon } from '../documents/DocumentsGallery.jsx'
import { formatDocumentDate, getDocumentErrorMessage } from '../../lib/documents.js'
import { getDamageCaseDocumentBlob } from '../../lib/damageDocuments.js'

function visibleCountForWidth(width) {
  if (width < 400) return 1
  if (width < 600) return 2
  return 3
}

export default function DamageDocumentsCard({ canEdit, documents, getDocumentBlob = getDamageCaseDocumentBlob, heading = 'Dokumente', loading, onDelete, onDetails, onEdit, onUpload }) {
  const viewportRef = useRef(null)
  const [startIndex, setStartIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(3)
  const [error, setError] = useState('')

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    const resizeObserver = new ResizeObserver(([entry]) => setVisibleCount(visibleCountForWidth(entry.contentRect.width)))
    resizeObserver.observe(viewport)
    return () => resizeObserver.disconnect()
  }, [])

  const maximumStart = Math.max(0, documents.length - visibleCount)
  const visibleDocuments = documents.slice(Math.min(startIndex, maximumStart), Math.min(startIndex, maximumStart) + visibleCount)
  const canNavigate = documents.length > visibleCount

  async function openDocument(documentItem) {
    const openedWindow = window.open('about:blank', '_blank')
    if (openedWindow) openedWindow.opener = null
    try {
      const blob = await getDocumentBlob(documentItem)
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
      const blob = await getDocumentBlob(documentItem)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = documentItem.fileName
      anchor.style.display = 'none'
      window.document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (downloadError) { setError(getDocumentErrorMessage(downloadError)) }
  }

  return <section className="todo-detail-content damage-documents-card" aria-label={heading}>
    <div className="todo-detail-section-heading damage-documents-card__heading"><h3>{heading}</h3><div className="damage-documents-card__actions"><div className="damage-documents-card__navigation-group">{canNavigate && <><button className="damage-documents-card__navigation damage-documents-card__navigation--previous" type="button" aria-label="Vorherige Dokumente anzeigen" disabled={startIndex === 0} onClick={() => setStartIndex((index) => Math.max(0, index - visibleCount))}><ChevronIcon size={17} /></button><button className="damage-documents-card__navigation" type="button" aria-label="Nächste Dokumente anzeigen" disabled={startIndex >= maximumStart} onClick={() => setStartIndex((index) => Math.min(maximumStart, index + visibleCount))}><ChevronIcon size={17} /></button></>}</div>{canEdit && <button className="button damage-documents-card__add" type="button" onClick={onUpload}>Dokument hinzufügen</button>}</div></div>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="documents-gallery__state">Dokumente werden geladen …</p> : !documents.length ? <p className="documents-gallery__state">Noch keine Dokumente hinterlegt.</p> : <div className="damage-documents-card__carousel"><div ref={viewportRef} className="damage-documents-card__viewport"><div className="damage-documents-card__items" style={{ gridTemplateColumns: `repeat(${visibleDocuments.length}, 190px)` }}>{visibleDocuments.map((documentItem) => <article className="damage-documents-card__item" key={documentItem.id}><DocumentPreview className="damage-documents-card__preview" documentItem={documentItem} getDocumentBlob={getDocumentBlob} onOpen={openDocument} /><div className="damage-documents-card__item-content"><div><strong title={documentItem.title}>{documentItem.title}</strong><span>{formatDocumentDate(documentItem.updatedAt || documentItem.createdAt)}</span></div><div className="damage-documents-card__item-actions">{canEdit && <DocumentActionsMenu documentItem={documentItem} onDelete={onDelete} onDetails={onDetails} onEdit={onEdit} />}<button className="document-card__download" type="button" onClick={() => downloadDocument(documentItem)} aria-label={`${documentItem.title} herunterladen`} title="Herunterladen"><DownloadIcon /></button></div></div></article>)}</div></div></div>}
  </section>
}
