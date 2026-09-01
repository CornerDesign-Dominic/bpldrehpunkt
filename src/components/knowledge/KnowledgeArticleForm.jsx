import { useState } from 'react'
import { KNOWLEDGE_CATEGORIES } from '../../lib/knowledge.js'

export default function KnowledgeArticleForm({ formId, initialValue, onSubmit, onDirtyChange }) {
  const [form, setForm] = useState(initialValue)
  const [savedForm, setSavedForm] = useState(initialValue)
  const [errors, setErrors] = useState({})

  function change(event) {
    const { name, value } = event.target
    const next = { ...form, [name]: value }
    setForm(next)
    setErrors((current) => ({ ...current, [name]: undefined }))
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(savedForm))
  }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Der Titel ist erforderlich.'
    if (!form.content.trim()) nextErrors.content = 'Der Artikelinhalt ist erforderlich.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const saved = await onSubmit(form)
    if (saved) {
      setSavedForm(form)
      onDirtyChange?.(false)
    }
  }

  return <form id={formId} className="knowledge-article-form" onSubmit={submit} noValidate>
    <section className="form-section knowledge-article-form__section"><h3>Artikel</h3><div className="form-grid knowledge-article-form__grid">
      <label className="form-field form-grid__wide"><span>Titel *</span><input name="title" value={form.title ?? ''} onChange={change} aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title}</small>}</label>
      <label className="form-field"><span>Kategorie</span><select name="category" value={form.category} onChange={change}>{KNOWLEDGE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
      <label className="form-field knowledge-article-form__summary"><span>Kurzbeschreibung</span><input name="summary" value={form.summary ?? ''} onChange={change} /></label>
      <label className="form-field form-grid__wide"><span>Artikelinhalt *</span><textarea name="content" value={form.content ?? ''} onChange={change} rows="14" aria-invalid={Boolean(errors.content)} />{errors.content && <small className="field-error">{errors.content}</small>}</label>
    </div></section>
  </form>
}
