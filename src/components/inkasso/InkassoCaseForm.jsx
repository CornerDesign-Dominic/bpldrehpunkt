import { useMemo, useState } from 'react'
import { createEmptyInkassoCase } from '../../lib/inkasso.js'

function emptyInvoice() { return { invoiceNumber: '', netAmount: '', vatAmount: '' } }

export default function InkassoCaseForm({ partners = [], onCancel, onSubmit }) {
  const [form, setForm] = useState(createEmptyInkassoCase)
  const [invoices, setInvoices] = useState([emptyInvoice])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()).sort((left, right) => (left.companyName || '').localeCompare(right.companyName || '', 'de')), [partners])
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateInvoice = (index, field, value) => setInvoices((current) => current.map((invoice, invoiceIndex) => invoiceIndex === index ? { ...invoice, [field]: value } : invoice))

  function selectCarrier(partnerId) {
    const partner = carriers.find((entry) => entry.id === partnerId)
    setForm((current) => ({ ...current, debtorPartnerId: partnerId, debtorName: partner?.companyName || '', debtorNumber: partner?.creditorNumber || '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Bitte eine Fallbezeichnung eingeben.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit({ ...form, invoices }) } catch (submitError) { setError(submitError.message || 'Der Inkassofall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>Inkasso hinzufügen</h2></div>
    <section className="damage-form__section"><h3>Grunddaten</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field damage-form__wide"><span>Fallbezeichnung *</span><textarea autoFocus rows="3" value={form.title} maxLength="500" onChange={(event) => update('title', event.target.value)} /></label>
      <label className="form-field"><span>Unternehmer</span><select value={form.debtorPartnerId} onChange={(event) => selectCarrier(event.target.value)}><option value="">Unternehmer auswählen</option>{carriers.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}{partner.creditorNumber ? ` · Kreditor ${partner.creditorNumber}` : ''}</option>)}</select></label>
    </div></section>
    <section className="damage-form__section"><div className="damage-form__heading"><h3>Rechnungen</h3><button className="button button--secondary" type="button" onClick={() => setInvoices((current) => [...current, emptyInvoice()])} disabled={submitting || invoices.length >= 50}>Rechnung hinzufügen</button></div><div className="damage-cases-table-frame"><table className="data-table"><thead><tr><th>Rechnungsnummer</th><th>Nettobetrag</th><th>USt.-Betrag</th><th aria-label="Aktion" /></tr></thead><tbody>{invoices.map((invoice, index) => <tr key={index}><td><input aria-label={`Rechnungsnummer ${index + 1}`} value={invoice.invoiceNumber} maxLength="240" onChange={(event) => updateInvoice(index, 'invoiceNumber', event.target.value)} /></td><td><input aria-label={`Nettobetrag ${index + 1}`} type="number" min="0" step="0.01" inputMode="decimal" value={invoice.netAmount} onChange={(event) => updateInvoice(index, 'netAmount', event.target.value)} /></td><td><input aria-label={`USt.-Betrag ${index + 1}`} type="number" min="0" step="0.01" inputMode="decimal" value={invoice.vatAmount} onChange={(event) => updateInvoice(index, 'vatAmount', event.target.value)} /></td><td><button className="button button--secondary" type="button" onClick={() => setInvoices((current) => current.length === 1 ? [emptyInvoice()] : current.filter((_, invoiceIndex) => invoiceIndex !== index))} disabled={submitting}>Entfernen</button></td></tr>)}</tbody></table></div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird angelegt …' : 'Inkassofall anlegen'}</button></div>
  </form>
}
