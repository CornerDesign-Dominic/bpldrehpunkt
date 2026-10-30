import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { recordHistoryActor, recordHistoryValue, recordHistoryTime } from '../../lib/recordHistoryPresentation.js'

export default function RecordHistoryModal({ record, recordId, loadHistoryPage, historyRows, creationLabel, errorMessage, formatValue = recordHistoryValue, onClose }) {
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
    loadHistoryPage(recordId).then((result) => { if (current) setPage(result) })
      .catch(() => { if (current) setError(errorMessage) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [recordId, loadHistoryPage, errorMessage])
  async function loadMore() {
    if (loading) return
    setLoading(true); setError('')
    try {
      const result = await loadHistoryPage(recordId, page.cursor)
      setPage((previous) => ({ ...result, entries: [...previous.entries, ...result.entries].filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) === index) }))
    } catch { setError(errorMessage) }
    finally { setLoading(false) }
  }
  const rows = historyRows(record, page.entries)
  const date = (value) => recordHistoryTime(value) ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(recordHistoryTime(value))) : '—'
  return createPortal(<dialog className="record-history-modal" ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} aria-labelledby="record-history-title">
    <header><div><h2 id="record-history-title"><StaticText source="Historie" /></h2><p>{record?.companyName || (record?.externalNumber ? `TA ${record.externalNumber}` : '')}</p></div><TranslatedProps sources={{ 'aria-label': 'Dialog schließen' }}><button type="button" className="button button--secondary" aria-label="Dialog schließen" onClick={onClose}>×</button></TranslatedProps></header>
    <div className="record-history-modal__content" aria-busy={loading}>
      {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
      {loading && <p role="status"><StaticText source="Historie wird geladen …" /></p>}
      {!loading && !error && !rows.length && <p><StaticText source="Noch keine Änderungen protokolliert." /></p>}
      {!error && rows.length > 0 && <table className="data-table record-history-table"><thead><tr>{['Datum / Uhrzeit / Person', 'Alte Daten', 'Neue Daten'].map((label) => <th key={label} scope="col"><StaticText source={label} /></th>)}</tr></thead>{rows.map((entry) => {
        const changes = entry.creation || entry.legacy || !entry.changes.length ? [null] : entry.changes
        return <tbody key={entry.id}>{changes.map((change, index) => <tr key={change?.path || 'summary'}>
          {index === 0 && <td className="record-history-table__metadata" rowSpan={changes.length}><time>{date(entry.createdAt)}</time><strong>{recordHistoryActor(entry) === 'Nicht protokolliert' ? <StaticText source="Nicht protokolliert" /> : recordHistoryActor(entry)}</strong>{entry.creation ? <span><StaticText source={creationLabel} /></span> : entry.legacy ? <span><StaticText source={entry.summary || 'Daten geändert'} /></span> : null}</td>}
          {['oldValue', 'newValue'].map((side) => <td key={side}>{entry.creation ? '—' : entry.legacy ? <StaticText source="Nicht protokolliert" /> : change ? <dl><dt>{change.label.split(' · ').map((part, partIndex) => <span key={partIndex}>{partIndex > 0 ? ' · ' : ''}<StaticText source={part} /></span>)}</dt><dd>{typeof change[side] === 'boolean' || change[side] === 'Geschützt' ? <StaticText source={formatValue(change[side], language, change)} /> : formatValue(change[side], language, change)}</dd></dl> : '—'}</td>)}
        </tr>)}</tbody>
      })}</table>}
      {(page.hasMore || error) && <button className="button button--secondary" type="button" disabled={loading} onClick={() => void loadMore()}><StaticText source={error ? 'Erneut versuchen' : 'Weitere laden'} /></button>}
    </div>
    <footer><button className="button button--secondary" type="button" onClick={onClose}><StaticText source="Schließen" /></button></footer>
  </dialog>, document.body)
}
