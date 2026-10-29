import { useEffect, useRef, useState } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { fetchDycosTransportOrder } from '../../lib/transportOrders.js'
import { dycosImportWarnings, errorMessage, resultMessages } from '../../lib/dycosOrderFetchFeedback.js'

export default function TransportOrderRefreshButton({ order, allowed, onUpdated }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const submitting = useRef(false)
  const attempt = useRef(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function refresh() {
    if (!allowed || submitting.current) return
    submitting.current = true
    setPending(true); setError(''); setResult(null)
    // Reuse an interrupted request; a completed click starts a fresh source read.
    if (!attempt.current) attempt.current = { taNummer: order.externalNumber, requestId: crypto.randomUUID() }
    try {
      const imported = await fetchDycosTransportOrder(attempt.current)
      if (!Object.hasOwn(resultMessages, imported?.status) || imported.orderId !== order.id || imported.externalNumber !== order.externalNumber) throw new Error('Unexpected import result')
      attempt.current = null
      if (!mounted.current) return
      setResult(imported)
      try { await onUpdated() } catch {
        if (mounted.current) setError('Die Daten wurden gespeichert, aber die Ansicht konnte nicht aktualisiert werden. Bitte lade die Seite neu.')
      }
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught))
    } finally {
      submitting.current = false
      if (mounted.current) setPending(false)
    }
  }

  if (!allowed) return null
  const warnings = dycosImportWarnings(result)
  return <div className="transport-order-refresh" aria-busy={pending}>
    <button className="button" type="button" disabled={pending} onClick={() => void refresh()}><StaticText source={pending ? 'Auftrag wird aktualisiert …' : 'Auftrag aktualisieren'} /></button>
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {result && <div role="status"><p><StaticText source={resultMessages[result.status]} /></p>{result.partnerUpdates?.enriched > 0 && <p><StaticText source="Geschäftspartner mit ergänzten Stammdaten:" /> {result.partnerUpdates.enriched}</p>}</div>}
    {warnings.length > 0 && <ul role="status">{warnings.map((message) => <li key={message}><StaticText source={message} /></li>)}</ul>}
  </div>
}
