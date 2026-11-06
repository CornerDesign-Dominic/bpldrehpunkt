import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { listContracts } from '../lib/contracts.js'
import { createReturnState } from '../lib/recordNavigation.js'
import ContractCreateModal from '../components/contracts/ContractCreateModal.jsx'
import '../styles/contracts.css'

export default function ContractManagementPage() {
  const { user } = useAuth()
  const { canEdit } = usePermissions()
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const navigate = useNavigate()
  const location = useLocation()
  const [entries, setEntries] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    let active = true
    listContracts().then((result) => { if (active) { setEntries(result.entries); setCursor(result.cursor); setError('') } })
      .catch(() => { if (active) setError('load') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  async function more() {
    setLoading(true)
    setError('')
    try {
      const result = await listContracts(cursor)
      setEntries((previous) => [...previous, ...result.entries.filter((entry) => !previous.some((item) => item.id === entry.id))])
      setCursor(result.cursor)
    } catch { setError('more') } finally { setLoading(false) }
  }

  return <div className="contracts-page">
      <div className="contracts-toolbar"><h2>{text('Verträge', 'Contracts')}</h2>{canEdit('contracts') && <button className="button" onClick={() => setShowForm(true)}>{text('Vertrag hinzufügen', 'Add contract')}</button>}</div>
      {error && <div className="form-error" role="alert"><p>{text('Verträge konnten nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'Contracts could not be loaded. Check your connection and permissions.')}</p><button className="button button--secondary" disabled={loading} onClick={() => { if (error === 'more') void more(); else { setLoading(true); setRetry((value) => value + 1) } }}>{text('Erneut versuchen', 'Retry')}</button></div>}
      <div className="contracts-table-frame"><table className="data-table"><thead><tr><th scope="col">{text('Vertragspartner', 'Contract partner')}</th><th scope="col">{text('Vertragsnummer', 'Contract number')}</th><th scope="col">{text('Kundennummer', 'Customer number')}</th><th scope="col">{text('Angelegt am', 'Created on')}</th><th scope="col">{text('Vertragsakte', 'Contract file')}</th></tr></thead><tbody>
        {entries.map((entry) => <tr key={entry.id}><td><Link to={`/vertragsmanagement/vertraege/${entry.id}`} state={createReturnState(location)}>{entry.partnerName}</Link></td><td>{entry.contractNumber || '—'}</td><td>{entry.customerNumber || '—'}</td><td>{entry.createdAt?.toDate().toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE') || '—'}</td><td><Link to={`/vertragsmanagement/vertraege/${entry.id}`} state={createReturnState(location)}>{text('Öffnen', 'Open')}</Link></td></tr>)}
        {!entries.length && <tr><td colSpan={5} className="table-state">{loading ? text('Verträge werden geladen …', 'Loading contracts …') : error ? text('Keine Daten verfügbar.', 'No data available.') : text('Noch keine Verträge vorhanden.', 'No contracts yet.')}</td></tr>}
      </tbody></table></div>
      {cursor && <button className="button button--secondary" disabled={loading} onClick={more}>{loading ? text('Wird geladen …', 'Loading …') : text('Weitere Verträge laden', 'Load more contracts')}</button>}
    {showForm && canEdit('contracts') && <ContractCreateModal userId={user.uid} onClose={() => setShowForm(false)} onCreated={(id) => navigate(`/vertragsmanagement/vertraege/${id}`, { state: createReturnState(location) })} />}
  </div>
}
