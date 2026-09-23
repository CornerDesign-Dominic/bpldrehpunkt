import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon } from '../icons.jsx'
import { customerImportHistoryDate, customerImportHistoryGroups, customerImportHistoryRowView } from '../../lib/customerImportPresentation.js'

export default function CustomerImportHistory({ rows, runs = {}, identityLabel = 'Debitor' }) {
  const [expanded, setExpanded] = useState({})
  if (!rows.length) return <div className="import-empty-state">Noch keine übernommenen Zeilen vorhanden.</div>

  const groups = customerImportHistoryGroups(rows, runs)
  return <div className="customer-import-history">{groups.map((group, index) => {
    const isOpen = expanded[group.key] ?? index === 0
    const date = group.runId ? customerImportHistoryDate(group.timestamp) : ''
    return <details className="customer-import-history__group" key={group.key} open={isOpen}>
      <summary onClick={(event) => { event.preventDefault(); setExpanded((current) => ({ ...current, [group.key]: !(current[group.key] ?? index === 0) })) }}>
        <span className="customer-import-history__heading"><strong>{group.fileName}</strong>{date && <span>· {date}</span>}{group.importedByName && <span>· {group.importedByName}</span>}</span>
        <span className="customer-import-history__counts">{group.automatic} automatisch · {group.reviewed} geprüft</span>
      </summary>
      <div className="customer-import-history__rows">{group.rows.map((row) => {
        const view = customerImportHistoryRowView(row)
        return <article className="customer-import-history__row" key={row.id}>
          <span className={`customer-import-history__icon customer-import-history__icon--${view.tone}`} aria-hidden="true">{view.tone === 'merge' ? '↗' : <CheckIcon size={17} />}</span>
          <div className="customer-import-history__description">
            <strong>{view.title}</strong>
            <span>{identityLabel} {identityLabel === 'Kreditor' ? row.creditorNumber || '—' : view.debtor} · {view.partnerName}</span>
            <small>Zuordnung: {view.match}</small>
          </div>
          <div className="customer-import-history__actions">
            <span className={`customer-import-history__badge customer-import-history__badge--${view.approval}`}>{view.approval}</span>
            {view.partnerPath && <Link to={view.partnerPath}>Stammdatenblatt öffnen →</Link>}
          </div>
        </article>
      })}</div>
    </details>
  })}</div>
}
