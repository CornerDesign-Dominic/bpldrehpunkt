import { useState } from 'react'
import { INKASSO_CASE_STATUSES } from '../../lib/inkasso.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'

function Field({ label, children }) { return <label className="form-field"><span>{label}</span>{children}</label> }

export default function InkassoCaseEditModal({ inkassoCase, mode, users, onCancel, onSubmit }) {
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
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="todo-quick-edit-modal inkasso-case-edit-modal" role="dialog" aria-modal="true" aria-labelledby="inkasso-case-edit-title">
      <form className="todo-quick-editor" onSubmit={save} noValidate>
        <div className="todo-quick-editor__heading"><h2 id="inkasso-case-edit-title">{descriptionOnly ? 'Beschreibung bearbeiten' : 'Fallinformationen bearbeiten'}</h2></div>
        {descriptionOnly ? <div className="todo-quick-editor__grid"><Field label="Beschreibung / Sachverhalt"><textarea autoFocus rows="8" value={form.description || ''} maxLength="4000" onChange={(event) => update('description', event.target.value)} /></Field></div> : <div className="inkasso-case-edit-modal__sections">
          <section><h3>Allgemein</h3><div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Falltitel"><input autoFocus value={form.title || ''} maxLength="500" onChange={(event) => update('title', event.target.value)} /></Field><Field label="Status"><select value={form.status || 'open'} onChange={(event) => update('status', event.target.value)}>{INKASSO_CASE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Field><Field label="Zuständig"><select value={form.responsibleUserId || ''} onChange={(event) => update('responsibleUserId', event.target.value)}><option value="">Nicht zugeordnet</option>{users.map((entry) => <option key={entry.id} value={entry.id}>{getUserDisplayName(entry, entry)}</option>)}</select></Field></div></section>
          <section><h3>Schuldner</h3><div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Schuldner / Unternehmen"><input value={form.debtorName || ''} maxLength="240" onChange={(event) => update('debtorName', event.target.value)} /></Field><Field label="Debitorennummer"><input value={form.debtorNumber || ''} maxLength="120" onChange={(event) => update('debtorNumber', event.target.value)} /></Field><Field label="Ansprechpartner"><input value={form.debtorContactName || ''} maxLength="240" onChange={(event) => update('debtorContactName', event.target.value)} /></Field><Field label="Anschrift"><textarea rows="2" value={form.debtorAddress || ''} maxLength="1000" onChange={(event) => update('debtorAddress', event.target.value)} /></Field><Field label="E-Mail"><input type="email" value={form.debtorEmail || ''} maxLength="320" onChange={(event) => update('debtorEmail', event.target.value)} /></Field><Field label="Telefon"><input value={form.debtorPhone || ''} maxLength="80" onChange={(event) => update('debtorPhone', event.target.value)} /></Field></div></section>
          <section><h3>Forderung</h3><div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Rechnungsnummer(n)"><input value={form.invoiceNumbers || ''} maxLength="1000" onChange={(event) => update('invoiceNumbers', event.target.value)} /></Field><Field label="Rechnungsdatum"><input type="date" value={form.invoiceDate || ''} onChange={(event) => update('invoiceDate', event.target.value)} /></Field><Field label="Ursprüngliche Fälligkeit"><input type="date" value={form.originalDueDate || ''} onChange={(event) => update('originalDueDate', event.target.value)} /></Field><Field label="Datum letzte Mahnung"><input type="date" value={form.lastReminderDate || ''} onChange={(event) => update('lastReminderDate', event.target.value)} /></Field></div></section>
          <section><h3>Rechtsanwalt / externe Bearbeitung</h3><div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Kanzlei"><input value={form.lawFirm || ''} maxLength="240" onChange={(event) => update('lawFirm', event.target.value)} /></Field><Field label="Aktenzeichen Kanzlei"><input value={form.lawyerReference || ''} maxLength="240" onChange={(event) => update('lawyerReference', event.target.value)} /></Field><Field label="Ansprechpartner Kanzlei"><input value={form.lawFirmContactName || ''} maxLength="240" onChange={(event) => update('lawFirmContactName', event.target.value)} /></Field><Field label="E-Mail"><input type="email" value={form.lawFirmEmail || ''} maxLength="320" onChange={(event) => update('lawFirmEmail', event.target.value)} /></Field><Field label="Telefon"><input value={form.lawFirmPhone || ''} maxLength="80" onChange={(event) => update('lawFirmPhone', event.target.value)} /></Field><Field label="Übergabe an Rechtsanwalt"><input type="date" value={form.lawyerHandoverDate || ''} onChange={(event) => update('lawyerHandoverDate', event.target.value)} /></Field></div></section>
          <section><h3>Gerichtliche Informationen</h3><div className="todo-quick-editor__grid todo-quick-editor__grid--three"><Field label="Zuständiges Gericht"><input value={form.court || ''} maxLength="240" onChange={(event) => update('court', event.target.value)} /></Field><Field label="Gerichtliches Aktenzeichen"><input value={form.courtReference || ''} maxLength="240" onChange={(event) => update('courtReference', event.target.value)} /></Field><Field label="Mahnbescheid"><input type="date" value={form.paymentOrderDate || ''} onChange={(event) => update('paymentOrderDate', event.target.value)} /></Field><Field label="Vollstreckungsbescheid"><input type="date" value={form.enforcementOrderDate || ''} onChange={(event) => update('enforcementOrderDate', event.target.value)} /></Field><Field label="Titel vorhanden"><select value={form.titleAvailable ? 'yes' : 'no'} onChange={(event) => update('titleAvailable', event.target.value === 'yes')}><option value="no">Nein</option><option value="yes">Ja</option></select></Field></div></section>
        </div>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>
}
