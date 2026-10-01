import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useMemo, useState } from 'react'
import { createEmptyLegalDispute } from '../../lib/legalDisputes.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { businessPartnerRoleSelectionValue, parseBusinessPartnerRoleSelection } from '../../lib/caseTransportLinks.js'
import TodoTransportOrderPicker from '../todos/TodoTransportOrderPicker.jsx'

export default function LegalDisputeCaseForm({ canViewTransportOrders = false, initialValues, onCancel, onSubmit, partners = [] }) {
  const [form, setForm] = useState(() => ({ ...createEmptyLegalDispute(), ...(initialValues || {}) }))
  const [transportOrderLinks, setTransportOrderLinks] = useState(() => initialValues?.transportOrderLinks || [])
  const [counterpartySelection, setCounterpartySelection] = useState(() => initialValues?.counterpartySelection || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const customers = useMemo(() => partners.filter((partner) => businessPartnerRoles(partner).customer), [partners])
  const carriers = useMemo(() => partners.filter((partner) => businessPartnerRoles(partner).carrier), [partners])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function selectCounterparty(value) {
    const { partnerId } = parseBusinessPartnerRoleSelection(value)
    const partner = partners.find((entry) => entry.id === partnerId)
    setCounterpartySelection(value)
    update('counterparty', partner?.companyName || '')
  }
  function selectTransportOrder(order) {
    setTransportOrderLinks((current) => current.some((link) => link.id === order.id) ? current : [...current, order])
    setForm((current) => ({ ...current, transportReference: current.transportReference || order.number }))
  }
  function removeTransportOrder(transportOrderId) {
    setTransportOrderLinks((current) => current.filter((link) => link.id !== transportOrderId))
  }

  async function submit(event) {
    event.preventDefault()
    if (!transportOrderLinks.length) {
      setError('Bitte mindestens einen Transportauftrag verknüpfen.')
      return
    }
    setSubmitting(true)
    setError('')
    try { await onSubmit({ ...form, transportReference: transportOrderLinks.map((link) => link.number || link.id).join(', '), transportOrderLinks }) } catch (submitError) { setError(submitError.message || 'Der Fall konnte nicht angelegt werden.') } finally { setSubmitting(false) }
  }

  return <form className="damage-form legal-dispute-case-form" onSubmit={submit} noValidate>
    <div className="damage-form__heading"><h2><StaticText source={"Neuen Fall anlegen"} /></h2></div>
    <section className="damage-form__section"><h3><StaticText source={"Grunddaten"} /></h3><div className="damage-form__grid damage-form__grid--context">
      <TodoTransportOrderPicker autoFocus canViewTransportOrders={canViewTransportOrders} disabled={submitting} transportOrderLinks={transportOrderLinks} onRemove={removeTransportOrder} onSelect={selectTransportOrder} />
      <label className="form-field"><span><StaticText source={"Art"} /></span><TranslatedProps sources={{"placeholder":"z. B. Klage, Mahnverfahren"}}><input value={form.caseType} maxLength="120" onChange={(event) => update('caseType', event.target.value)} placeholder="z. B. Klage, Mahnverfahren" /></TranslatedProps></label>
      <label className="form-field"><span><StaticText source={"Gegenseite"} /></span><select value={counterpartySelection} onChange={(event) => selectCounterparty(event.target.value)}><option value=""><StaticText source={"Keine Gegenseite ausgewählt"} /></option>{counterpartySelection && !partners.some((partner) => businessPartnerRoleSelectionValue('customer', partner.id) === counterpartySelection || businessPartnerRoleSelectionValue('carrier', partner.id) === counterpartySelection) && <option value={counterpartySelection}>{form.counterparty || <StaticText source={"Vorgefüllte Gegenseite"} />}</option>}{customers.length > 0 && <optgroup label="Kunden">{customers.map((partner) => <option key={`customer-${partner.id}`} value={businessPartnerRoleSelectionValue('customer', partner.id)}>{partner.companyName}</option>)}</optgroup>}{carriers.length > 0 && <TranslatedProps sources={{"label":"Unternehmer"}}><optgroup label="Unternehmer">{carriers.map((partner) => <option key={`carrier-${partner.id}`} value={businessPartnerRoleSelectionValue('carrier', partner.id)}>{partner.companyName}</option>)}</optgroup></TranslatedProps>}</select></label>
    </div></section>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={submitting}>{<StaticText source={submitting ? 'Wird angelegt …' : 'Fall anlegen'} />}</button></div>
  </form>
}
