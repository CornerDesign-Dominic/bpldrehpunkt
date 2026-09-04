import { useState } from 'react'
import { createEmptyInternalNewsItem, INTERNAL_NEWS_CATEGORIES, NEWS_PRIORITIES } from '../../lib/news.js'

export default function NewsForm({ item, onCancel, onSubmit }) {
  const [form, setForm] = useState(item || createEmptyInternalNewsItem())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.summary.trim() || !form.publishedAt) {
      setError('Bitte Titel, Datum und Kurztext erfassen.')
      return
    }
    setSubmitting(true); setError('')
    try {
      await onSubmit({ ...form, category: 'internal', sourceType: 'internal', status: 'active' })
    } catch {
      setError('Die Meldung konnte nicht gespeichert werden.')
    } finally { setSubmitting(false) }
  }

  return <form className="news-form" onSubmit={submit} noValidate>
    <div className="news-form__heading"><h2>{item ? 'Interne Meldung bearbeiten' : 'Interne Meldung hinzufügen'}</h2><button className="text-button" type="button" onClick={onCancel}>Abbrechen</button></div>
    <div className="news-form__grid">
      <label className="form-field news-form__title"><span>Titel *</span><input value={form.title} onChange={(event) => update('title', event.target.value)} autoFocus /></label>
      <label className="form-field"><span>Datum *</span><input type="date" value={form.publishedAt} onChange={(event) => update('publishedAt', event.target.value)} /></label>
      <label className="form-field"><span>Priorität</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}>{NEWS_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
      <label className="form-field"><span>Kategorie</span><select value={form.internalCategory || 'general'} onChange={(event) => update('internalCategory', event.target.value)}>{INTERNAL_NEWS_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
      <label className="form-field"><span>Gültig bis</span><input type="date" value={form.validUntil || ''} onChange={(event) => update('validUntil', event.target.value)} /></label>
      <label className="news-form__reactions"><input type="checkbox" checked={form.reactionsAllowed !== false} onChange={(event) => update('reactionsAllowed', event.target.checked)} />Reaktionen erlauben</label>
      <label className="form-field news-form__wide"><span>Kurztext *</span><textarea rows="2" value={form.summary} onChange={(event) => update('summary', event.target.value)} /></label>
      <label className="form-field news-form__wide"><span>Längerer Text (optional)</span><textarea rows="4" value={form.content} onChange={(event) => update('content', event.target.value)} /></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Meldung speichern'}</button></div>
  </form>
}
