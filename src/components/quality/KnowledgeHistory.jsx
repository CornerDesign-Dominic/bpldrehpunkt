import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listKnowledgeHistory } from '../../lib/knowledge.js'
import { knowledgeLabels, knowledgeSections, knowledgeUrl } from '../../lib/knowledgePresentation.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'

export default function KnowledgeHistory({ kind, record, rules = [], language, onClose, requestedRevision }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const label = (key) => knowledgeLabels[key]?.[en ? 1 : 0] || key
  const [state, setState] = useState({ loading: true })
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState(null)
  const date = (value) => value?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) || '—'
  useEffect(() => {
    let active = true
    listKnowledgeHistory(kind, record.id).then((items) => { if (active) { setState({ loading: false, items, missingRevision: Boolean(requestedRevision && !items.some((item) => item.revision === requestedRevision)) }); if (requestedRevision) setSelected(items.find((item) => item.revision === requestedRevision) || null) } }).catch(() => { if (active) setState({ loading: false, error: true }) })
    return () => { active = false }
  }, [kind, record.id, retry, requestedRevision])
  return <KnowledgeDialog title={selected ? `${text('Revision', 'Revision')} ${selected.revision}` : text('Revisionshistorie', 'Revision history')} large onClose={onClose}>
    {state.missingRevision && !selected && <p role="alert" className="form-error">{text('Die angeforderte Revision ist nicht verfügbar.', 'The requested revision is unavailable.')}</p>}
    {selected ? <><button type="button" className="button button--secondary" onClick={() => setSelected(null)}>{text('Alle Revisionen', 'All revisions')}</button><article className="quality-revision-article"><p className="quality-eyebrow">{kind === 'article' ? [selected.process, selected.topic].filter(Boolean).join(' · ') : label(selected.audience)} · {label(selected.status)}</p><h2>{selected.title}</h2><p className="quality-revision-meta">{date(selected.updatedAt)} · {selected.updatedByName || selected.updatedBy || '—'}</p>{knowledgeSections(kind).map((section) => <section key={section}><h3>{label(section)}</h3><p className="quality-protocol">{selected[section] || '—'}</p></section>)}<dl className="quality-revision-details">{['owner', 'lastReviewedDate', 'nextReviewDate', ...(kind === 'article' ? ['tags'] : [])].map((key) => <div key={key}><dt>{label(key)}</dt><dd>{selected[key] || '—'}</dd></div>)}</dl>{kind === 'article' && <p className="quality-revision-meta">{text('Grundregeln: ', 'Ground rules: ')}{!selected.ruleIds?.length ? '—' : selected.ruleIds.map((id) => <Link key={id} to={knowledgeUrl('rule', id)} target="_blank" rel="noreferrer">{rules.find((rule) => rule.id === id)?.title || text('Grundregel öffnen', 'Open ground rule')}{' '}</Link>)}</p>}</article></> : state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div role="alert" className="form-error"><p>{text('Verlauf konnte nicht geladen werden.', 'History could not be loaded.')}</p><button className="button button--secondary" onClick={() => { setState({ loading: true }); setRetry((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button></div> : <div className="quality-revision-list"><table><thead><tr><th>{text('Revision', 'Revision')}</th><th>{text('Datum', 'Date')}</th><th>{text('Bearbeitet von', 'Edited by')}</th></tr></thead><tbody>{state.items.map((item) => <tr key={item.revision}><td><button className="quality-revision-open" onClick={() => setSelected(item)}>{item.revision}{item.revision === record.revision ? ` · ${text('aktuell', 'current')}` : ''}</button></td><td>{date(item.updatedAt)}</td><td>{item.updatedByName || item.updatedBy || '—'}</td></tr>)}</tbody></table></div>}
  </KnowledgeDialog>
}
