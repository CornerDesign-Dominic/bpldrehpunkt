import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { createEmptyLegalDispute } from '../../lib/legalDisputes.js'
import { usePermissions } from '../../auth/usePermissions.js'
import LegalDisputeCounterpartyField from './LegalDisputeCounterpartyField.jsx'
import { legalDisputeCounterpartyValues } from '../../lib/caseTransportLinks.js'
import TodoTransportOrderPicker from '../todos/TodoTransportOrderPicker.jsx'

export default function LegalDisputeCaseForm({ canViewTransportOrders = false, initialValues, onCancel, onSubmit, partners = [] }) {
  const { canView } = usePermissions()
  const [form, setForm] = useState(() => ({ ...createEmptyLegalDispute(), ...(initialValues || {}), ...legalDisputeCounterpartyValues(initialValues) }))
  const [transportOrderLinks, setTransportOrderLinks] = useState(() => initialValues?.transportOrderLinks || [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
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
      <LegalDisputeCounterpartyField value={form} partners={partners} canViewMasterData={canView('masterData')} disabled={submitting} onChange={(changes) => setForm((current) => ({ ...current, ...changes }))} />
    </div></section>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <div className="form-actions"><button className="button button--secondary" type="button" disabled={submitting} onClick={onCancel}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={submitting}>{<StaticText source={submitting ? 'Wird angelegt …' : 'Fall anlegen'} />}</button></div>
  </form>
}
