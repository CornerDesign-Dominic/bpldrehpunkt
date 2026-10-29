import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { fetchDycosTransportOrder } from '../../lib/transportOrders.js'
import { resultMessages, errorMessage, dycosImportWarnings } from '../../lib/dycosOrderFetchFeedback.js'
import { transportOrderPath } from '../../lib/transportOrderPresentation.js'

export default function DycosOrderFetchForm({ disabled = false, onImported, onPendingChange }) {
  const { canEdit, canView } = usePermissions()
  const [taNumber, setTaNumber] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const submitting = useRef(false)
  const attempt = useRef(null)
  const allowed = canEdit('dataImports')
  const busy = pending || disabled
  const warnings = dycosImportWarnings(result)

  async function submit(event) {
    event.preventDefault()
    if (!allowed || busy || submitting.current) return
    const taNummer = taNumber.trim()
    setError(''); setResult(null)
    if (!/^(0|[1-9]\d{0,9})$/.test(taNummer) || Number(taNummer) > 2147483647) { setError('Bitte gib eine gültige TA-Nummer ein.'); return }
    // Preserve the identity when retrying an interrupted response for the same TA.
    if (attempt.current?.taNummer !== taNummer) attempt.current = { taNummer, requestId: crypto.randomUUID() }
    submitting.current = true
    setPending(true)
    onPendingChange?.(true)
    try {
      const imported = await fetchDycosTransportOrder(attempt.current)
      if (!Object.hasOwn(resultMessages, imported?.status) || !imported.orderId || imported.externalNumber !== taNummer) throw new Error('Unexpected import result')
      setResult(imported)
      attempt.current = null
      onImported?.()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      submitting.current = false
      setPending(false)
      onPendingChange?.(false)
    }
  }

  if (!allowed) return null
  return <section className="import-preparation__section dycos-order-fetch" aria-labelledby="dycos-order-fetch-heading">
    <div className="import-preparation__heading"><h2 id="dycos-order-fetch-heading"><StaticText source="Transportauftrag aus DyCoS abrufen" /></h2><p id="dycos-order-fetch-help"><StaticText source="TA-Nummer eingeben und den Auftrag abrufen. Vorhandene Aufträge werden aktualisiert; manuelle Angaben bleiben erhalten." /></p></div>
    <form className="dycos-order-fetch__form" onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <label className="form-field" htmlFor="dycos-order-fetch-number"><span><StaticText source="TA-Nummer" /></span><input id="dycos-order-fetch-number" name="taNummer" type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={taNumber} disabled={busy} aria-describedby="dycos-order-fetch-help" aria-invalid={Boolean(error)} onChange={(event) => { setTaNumber(event.target.value); setError(''); setResult(null) }} /></label>
      <button className="button" type="submit" disabled={busy || !taNumber.trim()}><StaticText source={pending ? 'Auftrag wird abgerufen …' : 'Abrufen und übernehmen'} /></button>
    </form>
    {pending && <p className="dycos-order-fetch__message" role="status"><StaticText source="Daten werden abgerufen, geprüft und gespeichert. Dies kann einen Moment dauern." /></p>}
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {result && <div className="dycos-order-fetch__result" role="status"><p><strong><StaticText source="TA" /> {result.externalNumber}</strong> · <StaticText source={resultMessages[result.status]} /></p>{canView('transportOrders') && <Link className="button button--secondary" to={transportOrderPath(result.orderId)}><StaticText source="Transportauftrag öffnen" /></Link>}</div>}
    {result?.partnerUpdates?.enriched > 0 && <p role="status"><StaticText source="Geschäftspartner mit ergänzten Stammdaten:" /> {result.partnerUpdates.enriched}</p>}
    {warnings.length > 0 && <ul className="dycos-order-fetch__warnings" role="status">{warnings.map((message) => <li key={message}><StaticText source={message} /></li>)}</ul>}
  </section>
}
