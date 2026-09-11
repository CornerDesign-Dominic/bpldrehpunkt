import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import InsolvencyEditModal from '../components/insolvencies/InsolvencyEditModal.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getInsolvency, updateInsolvency } from '../lib/insolvencies.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function Detail({ label, children }) { return <div className="damage-inline-field"><dt>{label}</dt><dd>{children || '—'}</dd></div> }

export default function InsolvencyDetailPage() {
  const { partnerId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const editable = canEdit('insolvencies')
  const canViewMasterData = canView('masterData')
  const [insolvency, setInsolvency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState('')

  async function load() {
    const entry = await getInsolvency(partnerId)
    if (!entry) throw new Error('Der Insolvenzfall wurde nicht gefunden.')
    setInsolvency(entry)
  }

  useEffect(() => {
    let current = true
    getInsolvency(partnerId).then((entry) => {
      if (!entry) throw new Error('Der Insolvenzfall wurde nicht gefunden.')
      if (current) setInsolvency(entry)
    }).catch((loadError) => { if (current) setError(loadError.message || 'Der Insolvenzfall konnte nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId])

  async function save(values) {
    const changed = await updateInsolvency(insolvency, values, { user, profile })
    if (changed) { await load(); setToast('Änderung gespeichert.') }
    setEditing(false)
  }

  if (loading) return <p className="page-state">Insolvenzfall wird geladen …</p>
  if (error || !insolvency) return <section className="damage-detail-empty"><h2>Insolvenzfall nicht verfügbar</h2><p>{error || 'Der Insolvenzfall wurde nicht gefunden.'}</p><Link className="button button--secondary" to="/insolvenzen">Zurück</Link></section>

  return <div className="damage-detail-page insolvency-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {editing && <InsolvencyEditModal insolvency={insolvency} onCancel={() => setEditing(false)} onSubmit={save} />}
    <header className="todo-detail-header"><div><Link className="todo-detail-header__back" to="/insolvenzen">← Zurück zu Insolvenzen</Link><div className="todo-detail-header__title"><h2>{insolvency.partnerName}</h2></div></div>{editable && <button className="button button--secondary" type="button" onClick={() => setEditing(true)}>Bearbeiten</button>}</header>
    <section className="damage-detail-section"><h3>Insolvenz</h3><dl className="damage-inline-grid"><Detail label="Betroffenes Unternehmen">{canViewMasterData ? <Link to={`/kunden-unternehmer/${insolvency.partnerId}`}>{insolvency.partnerName}</Link> : insolvency.partnerName}</Detail><Detail label="Insolvenzdatum">{formatDate(insolvency.insolvencyDate)}</Detail><Detail label="Aktenzeichen">{insolvency.courtReference}</Detail><Detail label="Gerichtsstand">{insolvency.courtVenue}</Detail><Detail label="Angelegt am">{formatTimestamp(insolvency.createdAt)}</Detail><Detail label="Zuletzt geändert">{formatTimestamp(insolvency.updatedAt)}</Detail></dl></section>
  </div>
}
