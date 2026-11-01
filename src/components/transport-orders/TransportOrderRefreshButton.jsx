import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { fetchDycosTransportOrder } from '../../lib/transportOrders.js'
import { dycosImportWarnings, errorMessage, resultMessages } from '../../lib/dycosOrderFetchFeedback.js'
import { recordHistoryTime } from '../../lib/recordHistoryPresentation.js'

export default function TransportOrderRefreshButton({ order, allowed, onUpdated, controlsTarget, active = true }) {
  const { language } = useLanguage()
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
      const imported = await fetchDycosTransportOrder({ ...attempt.current, mode: 'refresh' })
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

  if (!allowed && !controlsTarget) return null
  const warnings = dycosImportWarnings(result)
  const feedback = <>
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {result && <div role="status"><p><StaticText source={resultMessages[result.status]} /></p>{result.partnerUpdates?.enriched > 0 && <p><StaticText source="Geschäftspartner mit ergänzten Stammdaten:" /> {result.partnerUpdates.enriched}</p>}</div>}
    {warnings.length > 0 && <ul role="status">{warnings.map((message) => <li key={message}><StaticText source={message} /></li>)}</ul>}
  </>
  if (controlsTarget) {
    const importedAt = recordHistoryTime(order.importMeta?.lastImportedAt)
    const date = importedAt ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(importedAt)) : '—'
    return <>
      {active && createPortal(<div className="order-workspace__refresh" aria-busy={pending}><span className="order-workspace__update" aria-live="polite"><StaticText source="Letzte Aktualisierung" />: {date}</span>{allowed && <button type="button" disabled={pending} onClick={() => void refresh()}><StaticText source={pending ? 'Wird aktualisiert …' : 'Aktualisieren'} /></button>}</div>, controlsTarget)}
      {(error || result || warnings.length > 0) && <div className="transport-order-refresh">{feedback}</div>}
    </>
  }
  return <div className="transport-order-refresh" aria-busy={pending}>
    <button className="button" type="button" disabled={pending} onClick={() => void refresh()}><StaticText source={pending ? 'Auftrag wird aktualisiert …' : 'Auftrag aktualisieren'} /></button>
    {feedback}
  </div>
}
