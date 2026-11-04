import { useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { liabilityCall } from '../../lib/liabilityWorkflow.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

export default function LiabilityOrderPicker({ onSelect, disabled, onBusyChange }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [number, setNumber] = useState('')
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  const valid = /^(0|[1-9]\d{0,9})$/.test(number.trim()) && Number(number.trim()) <= 2147483647

  async function search(event) {
    event.preventDefault()
    if (!valid) return
    setBusy(true); onBusyChange(true); setError(''); setOrders(null)
    try {
      const result = await liabilityCall('findLiabilityTransportOrders', { taNummer: number.trim() })
      setOrders(result.orders)
    } catch (failure) {
      setError(w('Die Auftragssuche ist fehlgeschlagen. Bitte erneut versuchen.', 'Order search failed. Please try again.'))
      void reportTechnicalFailure({ module: 'document-templates', stage: 'order-search', error: failure })
    } finally { setBusy(false); onBusyChange(false) }
  }

  async function fetchOrder() {
    setBusy(true); onBusyChange(true); setError('')
    const taNummer = number.trim()
    if (request.current?.taNummer !== taNummer) request.current = { taNummer, requestId: crypto.randomUUID() }
    try {
      const result = await liabilityCall('fetchLiabilityTransportOrder', request.current)
      setOrders([result.order]); onSelect(result.order)
      request.current = null
    } catch (failure) {
      setError(failure.code === 'functions/not-found'
        ? w('Diese TA wurde in DyCoS nicht gefunden. Bitte die Nummer prüfen.', 'This order was not found in DyCoS. Please check the number.')
        : w('Der Abruf konnte nicht bestätigt werden. Bitte denselben Abruf erneut versuchen.', 'The retrieval could not be confirmed. Please retry the same request.'))
      void reportTechnicalFailure({ module: 'document-templates', stage: 'order-fetch', error: failure })
    } finally { setBusy(false); onBusyChange(false) }
  }

  return <section className="template-form-section" aria-labelledby="liability-order-heading" aria-busy={busy}>
    <div className="template-section-heading"><div><h2 id="liability-order-heading">{w('Transportauftrag übernehmen', 'Use transport order')}</h2><p>{w('TA in Drehpunkt suchen oder aus DyCoS abrufen und in Drehpunkt speichern.', 'Find an order in Drehpunkt or retrieve it from DyCoS and save it in Drehpunkt.')}</p></div></div>
    <form className="liability-order-search" onSubmit={search}>
      <label className="form-field"><span>{w('TA-Nummer', 'Order number')}</span><input inputMode="numeric" value={number} maxLength={10} disabled={busy || disabled} onChange={event => { setNumber(event.target.value); setOrders(null); setError('') }} /></label>
      <button type="submit" className="button" disabled={!valid || busy || disabled}>{busy ? w('Bitte warten …', 'Please wait …') : w('In Drehpunkt suchen', 'Search Drehpunkt')}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {orders && <div className="liability-order-results" aria-live="polite">
      {orders.map(order => <button className="button button--secondary" key={order.id} type="button" disabled={busy || disabled} onClick={() => onSelect(order)}>{`TA ${order.externalNumber} · ${order.carrier.company || w('Unternehmer fehlt', 'Carrier missing')}`}</button>)}
      {!orders.length && <><p>{w('Kein Auftrag mit dieser TA-Nummer in Drehpunkt vorhanden.', 'No order with this number exists in Drehpunkt.')}</p><button type="button" className="button button--secondary" disabled={busy || disabled} onClick={fetchOrder}>{w('Aus DyCoS abrufen und speichern', 'Retrieve from DyCoS and save')}</button></>}
    </div>}
  </section>
}
