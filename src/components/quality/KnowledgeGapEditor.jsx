import { useEffect, useState } from 'react'
import { updateKnowledgeGap } from '../../lib/knowledge.js'
import { knowledgeLabels } from '../../lib/knowledgePresentation.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'

export default function KnowledgeGapEditor({ record, articles, canLinkArticles, language, onClose, onSaved }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [articleId, setArticleId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = Boolean(articleId)
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
    try { await updateKnowledgeGap(record, { articleId, ...(record.id !== 'unassigned' ? { hidden: true } : {}) }); onSaved() }
    catch (failure) { setConflict(failure.code === 'functions/aborted'); setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Nach dem Schließen wird neu geladen.', 'Changed by another user. Closing will reload the entry.') : failure.code === 'functions/resource-exhausted' ? text('Zu viele Fälle für eine gemeinsame Zuordnung. Bitte Fälle einzeln zuordnen.', 'Too many cases for a group assignment. Assign cases individually.') : text('Speichern fehlgeschlagen. Eingaben, Verbindung und Berechtigung prüfen.', 'Saving failed. Check input, connection and permissions.')) }
    finally { setSaving(false) }
  }
  return <KnowledgeDialog title={text('Fälle zuordnen', 'Assign cases')} compact onClose={close}>
    <p className="knowledge-status-subject">{record.title}</p>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={save}><fieldset className="quality-fields" disabled={saving}>
      {canLinkArticles && <label className="form-field"><span>{text('Handbuchartikel', 'Handbook article')}</span><select required value={articleId} onChange={(event) => setArticleId(event.target.value)}><option value="">{text('Artikel wählen', 'Choose article')}</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title} · {knowledgeLabels[article.status][en ? 1 : 0]}</option>)}</select></label>}
      <p className="knowledge-assignment-count">{record.caseCount} {text('Fälle werden diesem Artikel zugeordnet.', 'cases will be assigned to this article.')}</p>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions knowledge-status-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" disabled={saving || !dirty}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Zuordnen', 'Assign')}</button></footer></form>
  </KnowledgeDialog>
}

