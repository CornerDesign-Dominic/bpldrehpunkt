import { useEffect, useRef, useState } from 'react'
import { getPdfFileError } from '../../lib/documents.js'

export default function LiabilityAiInputModal({ isAnalyzing, onAnalyze, onClose }) {
  const dialogRef = useRef(null)
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [incidentSummary, setIncidentSummary] = useState('')

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => fileInputRef.current?.focus())
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isAnalyzing) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocusedElement?.focus?.()
    }
  }, [isAnalyzing, onClose])

  function changeFile(nextFile) {
    const validationError = getPdfFileError(nextFile)
    setFile(validationError ? null : nextFile || null)
    setFileError(validationError)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragActive(false)
    changeFile(event.dataTransfer.files?.[0])
  }

  function submit(event) {
    event.preventDefault()
    if (!file) {
      setFileError('Bitte fügen Sie einen Transportauftrag als PDF hinzu.')
      return
    }
    onAnalyze({ file, incidentSummary })
  }

  const dropzoneClassName = fileError
    ? 'document-upload-dropzone document-upload-dropzone--error'
    : file
      ? 'document-upload-dropzone document-upload-dropzone--selected'
      : dragActive
        ? 'document-upload-dropzone document-upload-dropzone--active'
        : 'document-upload-dropzone'

  return <div className="liability-ai-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isAnalyzing) onClose() }}>
    <section ref={dialogRef} className="liability-ai-modal" role="dialog" aria-modal="true" aria-labelledby="liability-ai-input-title" tabIndex="-1">
      <div className="liability-ai-modal__heading"><div><h2 id="liability-ai-input-title">Mit KI vorausfüllen</h2><p>Transportauftrag und kurze Schilderung prüfen lassen.</p></div><button className="liability-ai-modal__close" type="button" onClick={onClose} disabled={isAnalyzing} aria-label="Dialog schließen">×</button></div>
      <form onSubmit={submit} noValidate>
        <div className="liability-ai-modal__fields">
          <div>
            <span className="liability-ai-modal__label">Transportauftrag</span>
            <div className={dropzoneClassName} role="button" tabIndex="0" aria-label="Transportauftrag als PDF auswählen oder hier ablegen" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click() } }} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }} onDrop={handleDrop}><span className="document-upload-dropzone__plus" aria-hidden="true">+</span><span className="document-upload-dropzone__content"><strong>{fileError ? 'Datei kann nicht verwendet werden' : file ? 'PDF ausgewählt' : 'PDF hier ablegen'}</strong><small>{fileError || file?.name || 'oder klicken, um eine Datei auszuwählen'}</small></span><input ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onClick={(event) => event.stopPropagation()} onChange={(event) => changeFile(event.target.files?.[0])} /></div>
          </div>
          <label className="form-field"><span>Sachverhalt kurz beschreiben</span><textarea rows="5" value={incidentSummary} onChange={(event) => setIncidentSummary(event.target.value)} placeholder="LKW kam 3 Stunden zu spät, dadurch Produktionsstillstand beim Kunden." /></label>
        </div>
        <div className="liability-ai-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={isAnalyzing}>Abbrechen</button><button className="button" type="submit" disabled={isAnalyzing}>{isAnalyzing ? 'Wird ausgewertet …' : 'Mit KI auswerten'}</button></div>
      </form>
    </section>
  </div>
}
