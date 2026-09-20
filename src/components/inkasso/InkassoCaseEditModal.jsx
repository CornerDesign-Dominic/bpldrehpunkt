import { useState } from 'react'

function Field({ label, children }) { return <label className="form-field"><span>{label}</span>{children}</label> }

export default function InkassoCaseEditModal({ inkassoCase, mode, onCancel, onSubmit }) {
  const [form, setForm] = useState({ ...inkassoCase })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { await onSubmit(form); onCancel() } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  const descriptionOnly = mode === 'description'
  const collectionDataOnly = mode === 'collection'
  const modalTitle = descriptionOnly ? 'Beschreibung bearbeiten' : collectionDataOnly ? 'Inkassodaten bearbeiten' : 'Fallinformationen bearbeiten'
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="todo-quick-edit-modal inkasso-case-edit-modal" role="dialog" aria-modal="true" aria-labelledby="inkasso-case-edit-title">
      <form className="todo-quick-editor" onSubmit={save} noValidate>
        <div className="todo-quick-editor__heading"><h2 id="inkasso-case-edit-title">{modalTitle}</h2></div>
        {descriptionOnly ? <div className="todo-quick-editor__grid"><Field label="Beschreibung / Sachverhalt"><textarea autoFocus rows="8" value={form.description || ''} maxLength="4000" onChange={(event) => update('description', event.target.value)} /></Field></div> : <div className="inkasso-case-edit-modal__sections"><section><h3>Inkassodaten</h3><div className="todo-quick-editor__grid"><Field label="Inkassounternehmen"><input autoFocus value={form.collectionAgency || ''} maxLength="240" onChange={(event) => update('collectionAgency', event.target.value)} /></Field><Field label="Aktenzeichen Inkassounternehmen"><input value={form.collectionReference || ''} maxLength="240" onChange={(event) => update('collectionReference', event.target.value)} /></Field></div></section></div>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>
}
