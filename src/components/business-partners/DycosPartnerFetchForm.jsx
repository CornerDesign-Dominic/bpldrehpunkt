import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { fetchDycosMasterData, dycosMasterDataError } from '../../lib/dycosMasterData.js'
import { businessPartnerDetailPath } from '../../lib/businessPartnerLinks.js'

const messages = { new: 'Geschäftspartner wurde angelegt.', updated: 'Geschäftspartner wurde ergänzt.', unchanged: 'Keine Stammdatenänderung erforderlich.' }

export default function DycosPartnerFetchForm({ onImported }) {
  const { canEdit } = usePermissions()
  const [typ, setTyp] = useState('kunde')
  const [nummer, setNummer] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const attempt = useRef(null); const submitting = useRef(false)
  const allowed = canEdit('masterData')

  async function submit(event) {
    event.preventDefault()
    if (!allowed || submitting.current) return
    const number = nummer.trim()
    setError(''); setResult(null)
    if (!/^(0|[1-9]\d{0,9})$/.test(number) || Number(number) > 2147483647) { setError('Bitte gib eine gültige Debitoren- oder Kreditornummer ein.'); return }
    if (attempt.current?.typ !== typ || attempt.current?.nummer !== number) attempt.current = { typ, nummer: number, requestId: crypto.randomUUID() }
    submitting.current = true; setPending(true)
    try {
      const response = await fetchDycosMasterData(attempt.current)
      if (!Object.hasOwn(messages, response?.status) || !response.partnerId || response.typ !== typ || response.nummer !== number) throw new Error('Unexpected import response')
      setResult(response); attempt.current = null
      onImported?.(response)
    } catch (caught) { setError(dycosMasterDataError(caught)) }
    finally { submitting.current = false; setPending(false) }
  }

  if (!allowed) return null
  return <section className="import-preparation__section dycos-order-fetch" aria-labelledby="dycos-partner-heading">
    <div className="import-preparation__heading"><h2 id="dycos-partner-heading"><StaticText source="Kunden und Unternehmer aus DyCoS abrufen" /></h2>
    <p id="dycos-partner-help"><StaticText source="Vorhandene Partner werden ergänzt. Bestehende Werte bleiben erhalten; Abweichungen erscheinen im Stammdatenblatt. Es wird nur der angefragte Kunde oder Unternehmer abgerufen." /></p></div>
    <form className="dycos-order-fetch__form" onSubmit={event => void submit(event)} aria-busy={pending}>
      <label className="form-field"><span><StaticText source="Partnerart" /></span><select value={typ} disabled={pending} onChange={event => { setTyp(event.target.value); setResult(null); setError('') }}><option value="kunde"><StaticText source="Kunde" /></option><option value="utn"><StaticText source="Unternehmer" /></option></select></label>
      <label className="form-field"><span><StaticText source={typ === 'kunde' ? 'Debitorennummer' : 'Kreditorennummer'} /></span><input type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={nummer} disabled={pending} aria-describedby="dycos-partner-help" aria-invalid={Boolean(error)} onChange={event => { setNummer(event.target.value); setResult(null); setError('') }} /></label>
      <button className="button" type="submit" disabled={pending || !nummer.trim()}><StaticText source={pending ? 'Wird übernommen …' : 'Abrufen und übernehmen'} /></button>
    </form>
    {pending && <p role="status"><StaticText source="Stammdaten werden abgerufen, geprüft und gespeichert." /></p>}
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {result && <div role="status"><p><StaticText source={messages[result.status]} /></p><Link className="button button--secondary" to={businessPartnerDetailPath(result.partnerId)}><StaticText source="Stammdatenblatt öffnen" /></Link>
      {result.conflicts > 0 && <p><StaticText source="Abweichende Werte wurden beibehalten. Die Unterschiede sind im Stammdatenblatt sichtbar." /></p>}
      {result.warningCodes?.includes('PARTNER_COUNTERPART_NOT_MATCHED') && <p><StaticText source="Die Gegenreferenz aus DyCoS konnte keinem vorhandenen Partner zugeordnet werden. Es wurde kein Gegenpartner zusätzlich angelegt. Bitte prüfe bei Bedarf, ob bereits ein passendes Stammdatenblatt existiert." /></p>}
      {result.warningCodes?.some(code => code !== 'PARTNER_COUNTERPART_NOT_MATCHED') && <p><StaticText source="Einzelne Kontakt- oder Bankangaben konnten nicht vollständig übernommen werden. Bitte die Quelldaten prüfen." /></p>}
    </div>}
  </section>
}
