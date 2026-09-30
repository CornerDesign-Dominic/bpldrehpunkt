import { useMemo, useState } from 'react'
import { createEmptyInkassoCase } from '../../lib/inkasso.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { businessPartnerRoleSelectionValue, parseBusinessPartnerRoleSelection } from '../../lib/caseTransportLinks.js'
import TodoTransportOrderPicker from '../todos/TodoTransportOrderPicker.jsx'

function emptyInvoice() { return { invoiceNumber: '', netAmount: '', vatAmount: '' } }

export default function InkassoCaseForm({ canViewTransportOrders = false, initialValues, partners = [], onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({ ...createEmptyInkassoCase(), ...(initialValues || {}) }))
  const [transportOrderLinks, setTransportOrderLinks] = useState(() => initialValues?.transportOrderLinks || [])
  const [debtorSelection, setDebtorSelection] = useState(() => businessPartnerRoleSelectionValue(initialValues?.debtorPartnerRole, initialValues?.debtorPartnerId))
  const [invoices, setInvoices] = useState([emptyInvoice])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const customers = useMemo(() => partners.filter((partner) => businessPartnerRoles(partner).customer).sort((left, right) => (left.companyName || '').localeCompare(right.companyName || '', 'de')), [partners])
  const carriers = useMemo(() => partners.filter((partner) => businessPartnerRoles(partner).carrier).sort((left, right) => (left.companyName || '').localeCompare(right.companyName || '', 'de')), [partners])
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateInvoice = (index, field, value) => setInvoices((current) => current.map((invoice, invoiceIndex) => invoiceIndex === index ? { ...invoice, [field]: value } : invoice))

  function selectDebtor(value) {
    const { role, partnerId } = parseBusinessPartnerRoleSelection(value)
    const partner = partners.find((entry) => entry.id === partnerId)
    setDebtorSelection(value)
    setForm((current) => ({ ...current, debtorPartnerId: partnerId || '', debtorPartnerRole: partner ? role : '', debtorName: partner?.companyName || '', debtorNumber: role === 'customer' ? partner?.debtorNumber || '' : partner?.creditorNumber || '' }))
  }
  function selectTransportOrder(order) { setTransportOrderLinks((current) => current.some((link) => link.id === order.id) ? current : [...current, order]) }
  function removeTransportOrder(transportOrderId) { setTransportOrderLinks((current) => current.filter((link) => link.id !== transportOrderId)) }

  async function submit(event) {
    event.preventDefault()
    if (!form.debtorPartnerId) {
      setError('Bitte ein Unternehmen auswählen.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit({ ...form, invoices, transportOrderLinks }) } catch (submitError) { setError(submitError.message || 'Der Inkassofall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2>Inkasso hinzufügen</h2></div>
    <section className="damage-form__section"><h3>Grunddaten</h3><div className="damage-form__grid damage-form__grid--context">
      <label className="form-field"><span>Schuldner *</span><select autoFocus value={debtorSelection} onChange={(event) => selectDebtor(event.target.value)}><option value="">Kunde oder Unternehmer auswählen</option>{debtorSelection && !partners.some((partner) => partner.id === form.debtorPartnerId) && <option value={debtorSelection}>{form.debtorName || 'Vorgefülltes Unternehmen'}</option>}{customers.length > 0 && <optgroup label="Kunden">{customers.map((partner) => <option key={`customer-${partner.id}`} value={businessPartnerRoleSelectionValue('customer', partner.id)}>{partner.companyName}{partner.debtorNumber ? ` · Debitor ${partner.debtorNumber}` : ''}</option>)}</optgroup>}{carriers.length > 0 && <optgroup label="Unternehmer">{carriers.map((partner) => <option key={`carrier-${partner.id}`} value={businessPartnerRoleSelectionValue('carrier', partner.id)}>{partner.companyName}{partner.creditorNumber ? ` · Kreditor ${partner.creditorNumber}` : ''}</option>)}</optgroup>}</select></label>
      <label className="form-field"><span>Inkassounternehmen</span><input value={form.collectionAgency || ''} maxLength="240" onChange={(event) => update('collectionAgency', event.target.value)} /></label>
      <label className="form-field"><span>Aktenzeichen Inkassounternehmen</span><input value={form.collectionReference || ''} maxLength="240" onChange={(event) => update('collectionReference', event.target.value)} /></label>
    </div></section>
    <section className="damage-form__section"><h3>Verknüpfungen</h3><div className="damage-form__grid damage-form__grid--context"><TodoTransportOrderPicker canViewTransportOrders={canViewTransportOrders} disabled={submitting} transportOrderLinks={transportOrderLinks} onRemove={removeTransportOrder} onSelect={selectTransportOrder} /></div></section>
    <section className="damage-form__section"><div className="damage-form__heading"><h3>Rechnungen</h3><button className="button button--secondary" type="button" onClick={() => setInvoices((current) => [...current, emptyInvoice()])} disabled={submitting || invoices.length >= 50}>Rechnung hinzufügen</button></div><div className="damage-cases-table-frame"><table className="data-table"><thead><tr><th>Rechnungsnummer</th><th>Nettobetrag</th><th>USt.-Betrag</th><th aria-label="Aktion" /></tr></thead><tbody>{invoices.map((invoice, index) => <tr key={index}><td><input aria-label={`Rechnungsnummer ${index + 1}`} value={invoice.invoiceNumber} maxLength="240" onChange={(event) => updateInvoice(index, 'invoiceNumber', event.target.value)} /></td><td><input aria-label={`Nettobetrag ${index + 1}`} type="number" min="0" step="0.01" inputMode="decimal" value={invoice.netAmount} onChange={(event) => updateInvoice(index, 'netAmount', event.target.value)} /></td><td><input aria-label={`USt.-Betrag ${index + 1}`} type="number" min="0" step="0.01" inputMode="decimal" value={invoice.vatAmount} onChange={(event) => updateInvoice(index, 'vatAmount', event.target.value)} /></td><td><button className="button button--secondary" type="button" onClick={() => setInvoices((current) => current.length === 1 ? [emptyInvoice()] : current.filter((_, invoiceIndex) => invoiceIndex !== index))} disabled={submitting}>Entfernen</button></td></tr>)}</tbody></table></div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird angelegt …' : 'Inkassofall anlegen'}</button></div>
  </form>
}
