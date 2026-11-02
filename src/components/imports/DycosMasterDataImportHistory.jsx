import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { listDycosMasterDataImports } from '../../lib/dycosMasterData.js'
import { businessPartnerDetailPath } from '../../lib/businessPartnerLinks.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import '../../styles/masterDataImportHistory.css'

const formatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const resultLabel = entry => entry.status === 'completed'
  ? ({ new: 'Neu angelegt', updated: 'Ergänzt', unchanged: 'Unverändert' })[entry.resultStatus] || 'Erfolgreich'
  : ({ running: 'Wird importiert …', failed: 'Fehlgeschlagen', interrupted: 'Unterbrochen' })[entry.status] || '—'

export default function DycosMasterDataImportHistory({ revision }) {
  const [entries, setEntries] = useState([]), [cursor, setCursor] = useState(null), [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const generation = useRef(0), paging = useRef(false)
  function report(error) {
    void reportTechnicalFailure({ module: 'website', stage: 'partners', error })
    return error?.code === 'functions/permission-denied' ? 'Keine Berechtigung für diesen Importverlauf.' : 'Der Importverlauf konnte nicht geladen werden. Bitte erneut versuchen.'
  }
  useEffect(() => {
    const current = ++generation.current, sequence = generation
    void Promise.resolve().then(() => {
      if (current === generation.current) { setLoading(true); setError(''); setEntries([]); setMore(false) }
      return listDycosMasterDataImports()
    }).then(result => {
      if (current === generation.current) { setEntries(result.entries); setCursor(result.cursor); setMore(result.hasMore) }
    }).catch(caught => { if (current === generation.current) setError(report(caught)) })
      .finally(() => { if (current === generation.current) setLoading(false) })
    return () => { sequence.current++ }
  }, [revision, refresh])
  async function loadMore() {
    if (loading || paging.current) return
    const current = generation.current
    paging.current = true; setLoading(true); setError('')
    try {
      const result = await listDycosMasterDataImports({ cursor })
      if (current === generation.current) { setEntries(previous => [...new Map([...previous, ...result.entries].map(entry => [entry.id, entry])).values()]); setCursor(result.cursor); setMore(result.hasMore) }
    } catch (caught) { if (current === generation.current) setError(report(caught)) }
    finally { paging.current = false; if (current === generation.current) setLoading(false) }
  }
  return <section className="import-preparation__section transport-order-import-history masterdata-import-history" aria-labelledby="masterdata-import-history-title">
    <div className="import-preparation__heading"><h2 id="masterdata-import-history-title"><StaticText source="Mein Importverlauf" /></h2><button className="button button--secondary" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}><StaticText source="Verlauf aktualisieren" /></button></div>
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {!loading && !error && !entries.length && <p><StaticText source="Noch keine Importvorgänge vorhanden." /></p>}
    {entries.length > 0 && <div className="transport-orders-table-frame"><table className="data-table"><thead><tr><th><StaticText source="Datum / Uhrzeit" /></th><th><StaticText source="Benutzer" /></th><th><StaticText source="Debitoren- / Kreditornummer" /></th><th><StaticText source="Ergebnis" /></th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}>
      <td>{entry.createdAt ? formatter.format(new Date(entry.createdAt)) : '—'}</td><td>{entry.createdByName}</td>
      <td><StaticText source={entry.typ === 'kunde' ? 'Debitor' : 'Kreditor'} /> {entry.nummer}</td>
      <td>{entry.partnerId ? <Link to={businessPartnerDetailPath(entry.partnerId)} target="_blank" rel="noopener"><StaticText source={resultLabel(entry)} /></Link> : <StaticText source={resultLabel(entry)} />}{entry.conflicts > 0 && <small className="import-table-note"><StaticText source="Abweichungen im Stammdatenblatt prüfen." /></small>}{entry.message && <small className="import-table-note"><StaticText source={entry.message} /></small>}</td>
    </tr>)}</tbody></table></div>}
    {loading && <p role="status"><StaticText source="Importverlauf wird geladen …" /></p>}
    {more && <button className="button button--secondary" type="button" disabled={loading} onClick={() => void loadMore()}><StaticText source="Mehr anzeigen" /></button>}
  </section>
}
