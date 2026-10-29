import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { listMasterDataHistoryPage } from '../../lib/partnerHistory.js'
import { businessPartnerHistoryActor, businessPartnerHistoryRows, businessPartnerHistoryValue, partnerHistoryTime } from '../../lib/businessPartnerHistoryPresentation.js'

export default function BusinessPartnerHistoryModal({ partner, partnerId, onClose }) {
  const dialog = useRef(null)
  const [page, setPage] = useState({ entries: [], cursor: null, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { language } = useLanguage()
  useEffect(() => {
    const element = dialog.current
    const previouslyFocusedElement = document.activeElement
    element.showModal()
    return () => { element.close(); previouslyFocusedElement?.focus() }
  }, [])
  useEffect(() => {
    let current = true
    listMasterDataHistoryPage(partnerId).then((result) => { if (current) setPage(result) })
      .catch(() => { if (current) setError('Die Stammdaten-Historie konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId])
  async function loadMore() {
    if (loading) return
    setLoading(true); setError('')
    try {
      const result = await listMasterDataHistoryPage(partnerId, page.cursor)
      setPage((previous) => ({ ...result, entries: [...previous.entries, ...result.entries].filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) === index) }))
    } catch { setError('Die Stammdaten-Historie konnte nicht geladen werden.') }
    finally { setLoading(false) }
  }
  const rows = businessPartnerHistoryRows(partner, page.entries)
  const date = (value) => partnerHistoryTime(value) ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(partnerHistoryTime(value))) : '—'
  return createPortal(<dialog className="partner-history-modal" ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} aria-labelledby="partner-history-title">
    <header><div><h2 id="partner-history-title"><StaticText source="Historie" /></h2><p>{partner?.companyName}</p></div><TranslatedProps sources={{ 'aria-label': 'Dialog schließen' }}><button type="button" className="button button--secondary" aria-label="Dialog schließen" onClick={onClose}>×</button></TranslatedProps></header>
    <div className="partner-history-modal__content" aria-busy={loading}>
      {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
      {loading && <p role="status"><StaticText source="Historie wird geladen …" /></p>}
      {!loading && !error && !rows.length && <p><StaticText source="Noch keine Änderungen protokolliert." /></p>}
      {!error && rows.length > 0 && <table className="data-table partner-history-table"><thead><tr>{['Datum / Uhrzeit / Person', 'Alte Daten', 'Neue Daten'].map((label) => <th key={label}><StaticText source={label} /></th>)}</tr></thead><tbody>{rows.map((entry) => <tr key={entry.id}>
        <td><time>{date(entry.createdAt)}</time><strong>{businessPartnerHistoryActor(entry) === 'Nicht protokolliert' ? <StaticText source="Nicht protokolliert" /> : businessPartnerHistoryActor(entry)}</strong>{entry.creation ? <span><StaticText source="Stammdatenblatt angelegt" /></span> : entry.legacy ? <span><StaticText source={entry.summary || 'Stammdaten geändert'} /></span> : null}</td>
        {['oldValue', 'newValue'].map((side) => <td key={side}>{entry.creation ? '—' : entry.legacy ? <StaticText source="Nicht protokolliert" /> : <dl>{entry.changes.map((change) => <div key={change.path}><dt>{change.label.split(' · ').map((part, index) => <span key={index}>{index > 0 ? ' · ' : ''}<StaticText source={part} /></span>)}</dt><dd>{typeof change[side] === 'boolean' || change[side] === 'Geschützt' ? <StaticText source={businessPartnerHistoryValue(change[side], language)} /> : businessPartnerHistoryValue(change[side], language)}</dd></div>)}</dl>}</td>)}
      </tr>)}</tbody></table>}
      {(page.hasMore || error) && <button className="button button--secondary" type="button" disabled={loading} onClick={() => void loadMore()}><StaticText source={error ? 'Erneut versuchen' : 'Weitere laden'} /></button>}
    </div>
    <footer><button className="button button--secondary" type="button" onClick={onClose}><StaticText source="Schließen" /></button></footer>
  </dialog>, document.body)
}
