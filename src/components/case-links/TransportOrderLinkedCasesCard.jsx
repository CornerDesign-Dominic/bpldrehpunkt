import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CASE_TRANSPORT_CASE_TYPES, listCaseLinksForTransportOrder, transportOrderCaseTypeOrder, visibleCaseTransportCaseTypes } from '../../lib/caseTransportLinks.js'

const ACTIONS = Object.freeze({
  damage: { open: 'Zum Schaden', create: 'Schadenfall eröffnen', add: '+ Weiteren Schadenfall hinzufügen' },
  pallet: { open: 'Zum Palettenfall', create: 'Palettenfall eröffnen', add: '+ Weiteren Palettenfall hinzufügen' },
  inkasso: { open: 'Zum Inkasso', create: 'Inkassofall eröffnen', add: '+ Weiteren Inkassofall hinzufügen' },
  legalDispute: { open: 'Zum Gericht-/Streitfall', create: 'Gericht-/Streitfall eröffnen', add: '+ Weiteren Gericht-/Streitfall hinzufügen' },
})

const STATUS_LABELS = Object.freeze({
  damage: { documents_missing: 'Unterlagen fehlen', in_progress: 'In Bearbeitung', rejected: 'Abgelehnt', settled: 'Reguliert', economically_closed: 'Wirtschaftlich geschlossen' },
  pallet: { open: 'Offen', in_progress: 'In Bearbeitung', resolved: 'Geklärt', closed: 'Geschlossen' },
  inkasso: { open: 'Offen', in_progress: 'In Bearbeitung', settled: 'Erledigt', closed: 'Geschlossen' },
  legalDispute: { open: 'Offen', in_progress: 'In Bearbeitung', closed: 'Geschlossen', settled: 'Erledigt' },
})

function caseDescription(caseType, caseItem = {}) {
  const values = caseType === 'damage'
    ? [caseItem.title, caseItem.claimant, caseItem.contractor]
    : caseType === 'pallet'
      ? [caseItem.title, caseItem.description]
    : caseType === 'inkasso'
      ? [caseItem.debtorName, caseItem.title]
      : [caseItem.title, caseItem.counterparty]
  return [...new Set(values.filter(Boolean))].join(' · ')
}

function statusLabel(caseType, caseItem) {
  const status = caseItem?.status
  if (!status) return ''
  return STATUS_LABELS[caseType]?.[status] || status
}

function loadErrorMessage(error) {
  if (error?.code === 'permission-denied') return 'Die Fallverknüpfungen können mit den aktuell veröffentlichten Berechtigungsregeln nicht geladen werden.'
  if (error?.code === 'failed-precondition') return 'Die Fallverknüpfungen können noch nicht geladen werden, weil ein benötigter Firestore-Index fehlt.'
  return 'Die verknüpften Vorgänge konnten nicht geladen werden.'
}

export default function TransportOrderLinkedCasesCard({ transportOrderId, canEditCase, canViewCase, onCreate }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedType, setSelectedType] = useState('')

  useEffect(() => {
    let current = true
    const permittedTypes = visibleCaseTransportCaseTypes(canViewCase)
    if (!permittedTypes.length) {
      Promise.resolve().then(() => { if (current) { setLinks([]); setLoading(false) } })
      return () => { current = false }
    }
    listCaseLinksForTransportOrder(transportOrderId, permittedTypes).then((entries) => { if (current) { setLinks(entries); setError('') } }).catch((caught) => {
      console.error('TA-Fallverknüpfungen konnten nicht geladen werden.', { transportOrderId, caseTypes: permittedTypes, code: caught?.code || 'unknown', message: caught?.message || String(caught) })
      if (current) setError(loadErrorMessage(caught))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canViewCase, transportOrderId])

  const groupedLinks = useMemo(() => transportOrderCaseTypeOrder(links).map((type) => ({ type, links: links.filter((link) => link.caseType === type) })), [links])
  const selectedGroup = groupedLinks.find((group) => group.type === selectedType)
  const selectedAction = selectedType ? ACTIONS[selectedType] : null

  function startCreate(caseType) {
    setSelectedType('')
    onCreate(caseType)
  }

  return <section className="transport-order-detail-section case-transport-actions"><h3>Fälle &amp; Vorgänge</h3>{error && <p className="form-error">{error}</p>}
    {loading ? <p>Fälle werden geladen …</p> : <div className="transport-order-detail-actions__buttons">{groupedLinks.map((group) => {
      const action = ACTIONS[group.type]
      const editable = canEditCase(CASE_TRANSPORT_CASE_TYPES[group.type].module)
      if (group.links.length) return <button className="button case-transport-actions__linked-button" type="button" key={group.type} onClick={() => setSelectedType(group.type)}>{action.open}{group.links.length > 1 ? ` · ${group.links.length}` : ''}</button>
      return <button className="button button--secondary" type="button" key={group.type} disabled={!editable} onClick={() => startCreate(group.type)}>{action.create}</button>
    })}</div>}
    {selectedGroup && selectedAction && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedType('') }}><section className="damage-form-modal transport-order-linked-cases-modal" role="dialog" aria-modal="true" aria-label={CASE_TRANSPORT_CASE_TYPES[selectedType].label}><div className="damage-form__heading"><h2>{CASE_TRANSPORT_CASE_TYPES[selectedType].label}</h2></div><ul className="transport-order-linked-cases-modal__list">{selectedGroup.links.map((link) => { const number = link.caseItem?.caseNumber || link.caseItem?.id || link.caseId; const description = caseDescription(selectedType, link.caseItem); const status = statusLabel(selectedType, link.caseItem); return <li key={link.id}><div><strong>{number}</strong>{description && description !== number && <span>{description}</span>}{status && <small>{status}</small>}</div><Link className="button button--secondary" to={link.href}>Fallakte öffnen</Link></li> })}</ul><div className="form-actions"><button className="button" type="button" disabled={!canEditCase(CASE_TRANSPORT_CASE_TYPES[selectedType].module)} onClick={() => startCreate(selectedType)}>{selectedAction.add}</button><button className="button button--secondary" type="button" onClick={() => setSelectedType('')}>Schließen</button></div></section></div>}
  </section>
}
