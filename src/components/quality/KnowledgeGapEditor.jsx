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
  return <KnowledgeDialog title={record.title} onClose={close}>
    <p className="quality-protocol">{record.missing}</p>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={save}><fieldset className="quality-fields" disabled={saving}>
      <label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{Object.keys(gapStatuses).map((value) => <option key={value} value={value}>{gapStatuses[value][en ? 1 : 0]}</option>)}</select></label>
      {canLinkArticles && <label className="form-field"><span>{text('Artikel (optional)', 'Article (optional)')}</span><select value={articleId} onChange={(event) => setArticleId(event.target.value)}><option value="">—</option>{articleId && !articles.some((item) => item.id === articleId) && <option value={articleId}>{text('Bisherige Zuordnung', 'Current link')}</option>}{articles.map((article) => <option key={article.id} value={article.id}>{article.title} · {knowledgeLabels[article.status][en ? 1 : 0]}</option>)}</select></label>}
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions"><button className="button" disabled={saving || !dirty}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></footer></form>
  </KnowledgeDialog>
}

