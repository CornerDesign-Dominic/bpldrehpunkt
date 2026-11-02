import { useEffect, useRef, useState } from 'react'
import { listQualityHistory } from '../../lib/quality.js'
import { HANDBOOK_SECTIONS } from '../../lib/qualityPresentation.js'
import { qualityLabels } from '../../lib/qualityLabels.js'

export default function QualityHandbookHistory({ record, language, onClose }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const dialog = useRef(null)
  const heading = useRef(null)
  const [state, setState] = useState({ loading: true })
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState(null)
  const selectedButton = useRef(null)
  const dateTime = (value) => value?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) || '—'
  const date = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE') : '—'

  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  useEffect(() => {
    let active = true
    listQualityHistory('handbook', record.id).then((items) => { if (active) setState({ items, loading: false }) })
      .catch(() => { if (active) setState({ loading: false, error: true }) })
    return () => { active = false }
  }, [record.id, retry])
  useEffect(() => {
    if (selected) heading.current?.focus()
    else if (selectedButton.current) dialog.current.querySelector(`[data-revision="${selectedButton.current}"]`)?.focus()
    dialog.current.scrollTop = 0
  }, [selected])

  return <dialog ref={dialog} className="quality-dialog quality-dialog--handbook quality-revisions-dialog" aria-labelledby="quality-revisions-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="quality-heading"><h2 id="quality-revisions-title" ref={heading} tabIndex={-1}>{selected ? `${text('Revision', 'Revision')} ${selected.revision}` : text('Revisionshistorie', 'Revision history')}</h2><button className="button button--secondary" onClick={onClose}>{text('Schließen', 'Close')}</button></header>
    {selected ? <>
      <button className="button button--secondary" onClick={() => setSelected(null)}>{text('Alle Revisionen', 'All revisions')}</button>
      <article className="quality-revision-article">
        <p className="quality-eyebrow">{selected.process}</p><h2>{selected.title}</h2>
        <p className="quality-revision-meta">{dateTime(selected.updatedAt)} · {selected.updatedByName || selected.updatedBy || '—'}</p>
        {HANDBOOK_SECTIONS.map((section) => <section key={section}><h3>{qualityLabels[section][en ? 1 : 0]}</h3><p className="quality-protocol">{selected[section] || '—'}</p></section>)}
        <dl className="quality-revision-details">{[
          [text('Zuständig', 'Responsible'), selected.owner || '—'],
          [text('Zuletzt kontrolliert', 'Last reviewed'), date(selected.lastReviewedDate)],
          [text('Nächste Kontrolle', 'Next review'), date(selected.nextReviewDate)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </article>
    </> : state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div role="alert" className="form-error"><p>{text('Die Revisionshistorie konnte nicht geladen werden.', 'Revision history could not be loaded.')}</p><button className="button button--secondary" onClick={() => { setState({ loading: true }); setRetry((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button></div> : !state.items.length ? <p>{text('Keine Revisionen vorhanden.', 'No revisions available.')}</p> : <div className="quality-revision-list"><table><thead><tr><th>{text('Revision', 'Revision')}</th><th>{text('Datum', 'Date')}</th><th>{text('Bearbeitet von', 'Edited by')}</th></tr></thead><tbody>{state.items.map((item) => <tr key={item.revision}><td><button className="quality-revision-open" data-revision={item.revision} onClick={() => { selectedButton.current = item.revision; setSelected(item) }}>{text('Revision', 'Revision')} {item.revision}{item.revision === record.revision ? ` · ${text('aktuell', 'current')}` : ''}</button></td><td>{dateTime(item.updatedAt)}</td><td>{item.updatedByName || item.updatedBy || '—'}</td></tr>)}</tbody></table></div>}
  </dialog>
}
