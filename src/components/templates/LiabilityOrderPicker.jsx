import { useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { liabilityCall } from '../../lib/liabilityWorkflow.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

export default function LiabilityOrderPicker({ onSelect, onImported, onActivityChange }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [number, setNumber] = useState('')
  const [orders, setOrders] = useState(null)
  const [phase, setPhase] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef(null)
  const busyRef = useRef(false)
  const busy = Boolean(phase)
  const valid = /^(0|[1-9]\d{0,9})$/.test(number.trim()) && Number(number.trim()) <= 2147483647

  function activity(value) {
    busyRef.current = Boolean(value)
    setPhase(value)
    onActivityChange(value ? { phase: value, number: number.trim() } : null)
  }
  async function search(event) {
    event.preventDefault()
    if (!valid || busyRef.current) return
    activity('search'); setError(''); setNotice(''); setOrders(null)
    try {
      const result = await liabilityCall('findLiabilityTransportOrders', { taNummer: number.trim() })
      setOrders(result.orders)
    } catch (failure) {
      setError(w('Die Auftragssuche ist fehlgeschlagen. Bitte erneut versuchen.', 'Order search failed. Please try again.'))
      void reportTechnicalFailure({ module: 'document-templates', stage: 'order-search', error: failure })
    } finally { activity(null) }
  }
  async function fetchOrder() {
    if (busyRef.current || !valid) return
    activity('import'); setError(''); setNotice('')
    const taNummer = number.trim()
    if (request.current?.taNummer !== taNummer) request.current = { taNummer, requestId: crypto.randomUUID() }
    try {
      const result = await liabilityCall('fetchLiabilityTransportOrder', request.current)
      setOrders([result.order])
      onImported(result.order)
      setNotice(w('Die TA wurde importiert und die Daten wurden in die Haftbarhaltung übernommen.', 'The order was imported and its details have been added to the liability letter.'))
      request.current = null
    } catch (failure) {
      setError(failure.code === 'functions/not-found'
        ? w('Diese TA wurde in DyCoS nicht gefunden. Bitte die Nummer prüfen.', 'This order was not found in DyCoS. Please check the number.')
        : w('Der Abruf konnte nicht bestätigt werden. Bitte denselben Abruf erneut versuchen. Falls die TA bereits gespeichert wurde, findest du sie über die Suche in Drehpunkt.', 'The retrieval could not be confirmed. Please retry the same request. If the order was already saved, you can find it by searching Drehpunkt.'))
      void reportTechnicalFailure({ module: 'document-templates', stage: 'order-fetch', error: failure })
    } finally { activity(null) }
  }
  return <section className="template-form-section" aria-labelledby="liability-order-heading" aria-busy={busy}>
    <div className="template-section-heading"><div><h2 id="liability-order-heading">{w('Auftragsdaten abholen', 'Retrieve order details')}</h2><p>{w('TA-Nummer in Drehpunkt suchen oder fehlende Aufträge über die DyCoS-Schnittstelle importieren.', 'Search Drehpunkt by order number or import missing orders through the DyCoS interface.')}</p></div></div>
    <form className="liability-order-search" onSubmit={search}>
      <label className="form-field"><span>{w('TA-Nummer', 'Order number')}</span><input inputMode="numeric" value={number} maxLength={10} disabled={busy} onChange={event => { setNumber(event.target.value); setOrders(null); setError(''); setNotice('') }} /></label>
      <button type="submit" className="button" disabled={!valid || busy}>{phase === 'search' ? w('Suche läuft …', 'Searching …') : w('In Drehpunkt suchen', 'Search Drehpunkt')}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {phase === 'import' && <p role="status">{w('Import läuft … Die Auftragsdaten werden anschließend automatisch übernommen.', 'Import in progress … The order details will be filled in automatically.')}</p>}
    {orders && !busy && <div className="liability-order-results" aria-live="polite">
      {orders.length > 0 && !notice && orders.map(order => <button className="button button--secondary" key={order.id} type="button" onClick={() => onSelect(order)}>{`TA ${order.externalNumber} · ${order.carrier.company || w('Unternehmer fehlt', 'Carrier missing')}`}</button>)}
      {!orders.length && <><p>{w('Diese TA ist nicht in Drehpunkt enthalten. Aus DyCoS importieren?', 'This order is not in Drehpunkt. Import it from DyCoS?')}</p><button type="button" className="button" onClick={fetchOrder}>{w('Ja, aus DyCoS importieren', 'Yes, import from DyCoS')}</button><button type="button" className="button button--secondary" onClick={() => setOrders(null)}>{w('Abbrechen', 'Cancel')}</button></>}
    </div>}
  </section>
}
