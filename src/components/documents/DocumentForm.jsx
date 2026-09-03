import { useState } from 'react'
import { createEmptyDocument, getDocumentErrorMessage, isPdfFile } from '../../lib/documents.js'

export default function DocumentForm({ documentItem, onCancel, onSubmit }) {
  const [form, setForm] = useState(documentItem ? { title: documentItem.title || '', description: documentItem.description || '', expirationDate: documentItem.expirationDate || '' } : createEmptyDocument())
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeFile(nextFile) {
    setFile(nextFile || null)
    setError('')
    if (nextFile && !isPdfFile(nextFile)) setError('Bitte ausschließlich eine PDF-Datei auswählen.')
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || (!documentItem && !file)) {
      setError('Bitte Titel und eine PDF-Datei erfassen.')
      return
    }
    if (file && !isPdfFile(file)) { setError('Bitte ausschließlich eine PDF-Datei auswählen.'); return }
    setSubmitting(true); setError('')
    try { await onSubmit(form, file) } catch (submitError) { setError(getDocumentErrorMessage(submitError)) } finally { setSubmitting(false) }
  }

  return <form className="document-form" onSubmit={submit} noValidate>
    <div className="document-form__heading"><h2>{documentItem ? 'Dokument bearbeiten' : 'Dokument hochladen'}</h2><button className="text-button" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="document-form__grid">
      <label className="form-field document-form__title"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Ablaufdatum <small>(optional)</small></span><input type="date" value={form.expirationDate} onChange={(event) => update('expirationDate', event.target.value)} /></label>
      {!documentItem && <label className="form-field document-form__file"><span>PDF-Datei *</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => changeFile(event.target.files?.[0])} /></label>}
      <label className="form-field document-form__description"><span>Kurzbeschreibung</span><textarea rows="2" value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : documentItem ? 'Änderungen speichern' : 'Dokument speichern'}</button></div>
  </form>
}
