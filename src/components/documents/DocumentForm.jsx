import { useRef, useState } from 'react'
import { createEmptyDocument, getDocumentErrorMessage, getPdfFileError } from '../../lib/documents.js'

export default function DocumentForm({ documentItem, onCancel, onSubmit }) {
  const [form, setForm] = useState(documentItem ? { title: documentItem.title || '', description: documentItem.description || '', expirationDate: documentItem.expirationDate || '' } : createEmptyDocument())
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeFile(nextFile) {
    const validationError = getPdfFileError(nextFile)
    setFile(validationError ? null : nextFile || null)
    setFileError(validationError)
    setError(validationError)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragActive(false)
    changeFile(event.dataTransfer.files?.[0])
  }

  async function submit(event) {
    event.preventDefault()
    if (fileError) { setError(fileError); return }
    if (!form.title.trim() || (!documentItem && !file)) {
      setError('Bitte Titel und eine PDF-Datei erfassen.')
      return
    }
    setSubmitting(true); setError('')
    try { await onSubmit(form, file) } catch (submitError) { setError(getDocumentErrorMessage(submitError)) } finally { setSubmitting(false) }
  }

  return <form className="document-form" onSubmit={submit} noValidate>
    <div className="document-form__heading"><h2>{documentItem ? 'Dokument bearbeiten' : 'Dokument hochladen'}</h2></div>
    <div className="document-form__grid">
      {!documentItem && <div className={fileError ? 'document-upload-dropzone document-upload-dropzone--error' : file ? 'document-upload-dropzone document-upload-dropzone--selected' : dragActive ? 'document-upload-dropzone document-upload-dropzone--active' : 'document-upload-dropzone'} role="button" tabIndex="0" aria-label="PDF-Datei auswählen oder hier ablegen" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click() } }} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }} onDrop={handleDrop}><span className="document-upload-dropzone__plus" aria-hidden="true">+</span><span className="document-upload-dropzone__content"><strong>{fileError ? 'Datei kann nicht verwendet werden' : file ? 'PDF ausgewählt' : 'PDF hier ablegen'}</strong><small>{fileError || file?.name || 'oder klicken, um eine Datei auszuwählen'}</small></span><input ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onClick={(event) => event.stopPropagation()} onChange={(event) => changeFile(event.target.files?.[0])} /></div>}
      <label className="form-field document-form__title"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Gültig bis <small>(optional)</small></span><input type="date" value={form.expirationDate} onChange={(event) => update('expirationDate', event.target.value)} /></label>
      <label className="form-field document-form__description"><span>Kurzbeschreibung <small>(optional)</small></span><textarea rows="2" value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </form>
}
