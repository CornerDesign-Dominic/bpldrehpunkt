import { useEffect, useState } from 'react'
import { updateKnowledgeGap } from '../../lib/knowledge.js'
import { knowledgeLabels } from '../../lib/knowledgePresentation.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'
const gapStatuses = { open: ['Offen', 'Open'], in_progress: ['In Bearbeitung', 'In progress'], resolved: ['Erledigt', 'Done'], ignored: ['Zurückgestellt', 'Deferred'] }

export default function KnowledgeGapEditor({ record, articles, canLinkArticles, language, onClose, onSaved }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [status, setStatus] = useState(record.status)
  const [articleId, setArticleId] = useState(record.articleId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = status !== record.status || articleId !== (record.articleId || '')
  const [discard, setDiscard] = useState(false)
  const [conflict, setConflict] = useState(false)
  useEffect(() => {
    if (!dirty) return undefined
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function close() { if (saving) return; if (dirty) setDiscard(true); else onClose({ reload: conflict }) }
  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try { await updateKnowledgeGap(record, status, articleId); onSaved() }
    catch (failure) { setConflict(failure.code === 'functions/aborted'); setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Nach dem Schließen wird neu geladen.', 'Changed by another user. Closing will reload the entry.') : text('Speichern fehlgeschlagen. Eingaben, Verbindung und Berechtigung prüfen.', 'Saving failed. Check input, connection and permissions.')) }
    finally { setSaving(false) }
  }
  return <KnowledgeDialog title={text('Status ändern', 'Change status')} compact onClose={close}>
    <p className="knowledge-status-subject">{record.title}</p>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={save}><fieldset className="quality-fields" disabled={saving}>
      <fieldset className="knowledge-status-options"><legend>Status</legend>{Object.keys(gapStatuses).map((value) => <label key={value} className={`knowledge-status-option${status === value ? ' is-selected' : ''}`}><input type="radio" name="gap-status" value={value} checked={status === value} onChange={() => setStatus(value)} /><span>{gapStatuses[value][en ? 1 : 0]}</span></label>)}</fieldset>
      {canLinkArticles && <details className="knowledge-status-link"><summary>{text('Handbuchartikel zuordnen', 'Link handbook article')}{articleId ? ` · ${articles.find((article) => article.id === articleId)?.title || text('Zugeordnet', 'Linked')}` : ''}</summary><label className="form-field"><span>{text('Handbuchartikel', 'Handbook article')}</span><select value={articleId} onChange={(event) => setArticleId(event.target.value)}><option value="">{text('Kein Artikel zugeordnet', 'No linked article')}</option>{articleId && !articles.some((item) => item.id === articleId) && <option value={articleId}>{text('Bisherige Zuordnung', 'Current link')}</option>}{articles.map((article) => <option key={article.id} value={article.id}>{article.title} · {knowledgeLabels[article.status][en ? 1 : 0]}</option>)}</select></label></details>}
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions knowledge-status-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" disabled={saving || !dirty}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></footer></form>
  </KnowledgeDialog>
}

