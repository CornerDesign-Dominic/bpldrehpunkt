import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { fetchDycosTransportOrder } from '../../lib/transportOrders.js'
import { transportOrderPath } from '../../lib/transportOrderPresentation.js'

const resultMessages = {
  new: 'Transportauftrag wurde angelegt.',
  updated: 'Transportauftrag wurde aktualisiert.',
  unchanged: 'Transportauftrag ist bereits aktuell.',
}

const warningMessages = {
  SLOT_MIDNIGHT_UNCONFIRMED: 'Eine Bis-Uhrzeit von 00:00 wurde nicht als Zeitfenster übernommen. Bitte die Stationszeiten prüfen.',
  SLOT_OVERNIGHT_UNCONFIRMED: 'Eine Bis-Uhrzeit liegt vor der Von-Uhrzeit. Das Ende des Zeitfensters wurde nicht übernommen; bitte die Stationszeiten prüfen.',
  UNKNOWN_STOP_TYPE: 'Eine Station konnte nicht als Lade- oder Entladestelle eingeordnet werden. Bitte die Stationen prüfen.',
  TOUR_COSTS_NOT_ASSIGNED_TO_ORDER: 'Tourkosten ohne eindeutige Zuordnung zu diesem Auftrag wurden nicht in dessen Unternehmerpreis übernommen.',
}

function errorMessage(error) {
  switch (error?.code) {
    case 'functions/not-found': return error.details?.sourceCode === 'TA_NOT_FOUND' || error.details?.code === 'TA_NOT_FOUND'
      ? 'Unter dieser TA-Nummer wurde in DyCoS kein Auftrag gefunden. Bitte prüfe die Nummer.'
      : 'Der DyCoS-Abruf ist derzeit nicht verfügbar. Bitte wende dich an die Administration.'
    case 'functions/invalid-argument': return 'Bitte gib eine gültige TA-Nummer ein.'
    case 'functions/permission-denied': return 'Du hast keine Berechtigung für diesen Abruf.'
    case 'functions/unauthenticated': return 'Bitte melde dich erneut an und versuche es noch einmal.'
    case 'functions/deadline-exceeded':
    case 'functions/unavailable': return 'Der Abruf konnte nicht bestätigt werden. Bitte versuche dieselbe TA-Nummer erneut; eine bereits erfolgte Übernahme wird erkannt.'
    case 'functions/already-exists': return 'Diese Anfrage wird bereits verarbeitet. Bitte warte kurz und versuche dieselbe TA-Nummer erneut.'
    case 'functions/aborted': return 'Der Auftrag wird gerade bearbeitet. Bitte warte kurz und rufe dieselbe TA-Nummer erneut ab.'
    case 'functions/resource-exhausted': return 'Es wurden zu viele Abrufe gestartet. Bitte warte eine Minute und versuche es erneut.'
    case 'functions/failed-precondition': return 'Die Partnerzuordnung muss geprüft werden. Bitte prüfe die Stammdaten oder wende dich an die Administration.'
    default: return 'Der Auftrag konnte nicht übernommen werden. Bitte versuche es erneut oder wende dich an die Administration.'
  }
}

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
  const warnings = [...new Set((Array.isArray(result?.warningCodes) ? result.warningCodes : []).slice(0, 10).map((code) => typeof code === 'string' && Object.hasOwn(warningMessages, code) ? warningMessages[code] : 'Die Daten wurden mit Hinweisen übernommen. Bitte prüfe den Transportauftrag.'))]

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
    {warnings.length > 0 && <ul className="dycos-order-fetch__warnings" role="status">{warnings.map((message) => <li key={message}><StaticText source={message} /></li>)}</ul>}
  </section>
}
