import { useState } from 'react'
import { manageEmptyKnowledgeGroup } from '../../lib/knowledge.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'

export default function EmptyKnowledgeGroupEditor({ record, action, language, onClose, onSaved }) {
  const en = language === 'en'
  const w = (de, english) => en ? english : de
  const [title, setTitle] = useState(record.title || '')
  const [process, setProcess] = useState(record.process || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const creating = action === 'createArticle'
  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { onSaved(await manageEmptyKnowledgeGroup(record, action, creating ? { title, process } : undefined)) }
    catch (failure) { setError(failure.code === 'functions/aborted' || failure.code === 'functions/failed-precondition' ? w('Der Vorschlag wurde inzwischen geändert oder enthält Fälle. Bitte schließen und neu laden.', 'The suggestion changed or now contains cases. Close and reload.') : w('Speichern fehlgeschlagen. Verbindung und Berechtigung prüfen.', 'Saving failed. Check the connection and permissions.')) }
    finally { setBusy(false) }
  }
  return <KnowledgeDialog compact title={creating ? w('Artikel aus Vorschlag erstellen', 'Create article from suggestion') : w('Leeren Vorschlag entfernen', 'Remove empty suggestion')} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={save}><fieldset disabled={busy} className="quality-fields">
      {creating ? <><p>{w('Der Artikel wird als Entwurf angelegt und kann anschließend ausgearbeitet werden.', 'The article is created as a draft and can then be completed.')}</p><label className="form-field"><span>{w('Titel', 'Title')}</span><input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label><label className="form-field"><span>{w('Prozess', 'Process')}</span><input required maxLength={500} value={process} onChange={event => setProcess(event.target.value)} /></label></> : <p>{w('Diesen leeren Artikelvorschlag entfernen? Handbuchartikel und Originalmails bleiben erhalten.', 'Remove this empty article suggestion? Handbook articles and original emails are kept.')}</p>}
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions"><button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>{w('Abbrechen', 'Cancel')}</button><button type="submit" className={`button${creating ? '' : ' button--danger'}`} disabled={busy}>{busy ? w('Wird gespeichert …', 'Saving …') : creating ? w('Entwurf erstellen und öffnen', 'Create and open draft') : w('Vorschlag entfernen', 'Remove suggestion')}</button></footer></form>
  </KnowledgeDialog>
}
