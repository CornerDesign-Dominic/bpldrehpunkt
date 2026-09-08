import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DamageCaseForm from '../components/damages/DamageCaseForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { DAMAGE_CASE_STATUSES, damageCaseStatusLabel, damageDuePresentation, getDamageCase, updateDamageCase } from '../lib/damages.js'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function Detail({ label, children, className = '' }) {
  return <div className={className}><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

export default function DamageDetailPage() {
  const { damageCaseId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('damages')
  const [damageCase, setDamageCase] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    const [entry, directory] = await Promise.all([getDamageCase(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
    setDamageCase(entry)
    setUsers(directory)
    setTitle(entry?.caseNumber || '')
  }

  useEffect(() => {
    let current = true
    Promise.all([getDamageCase(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
      .then(([entry, directory]) => { if (current) { setDamageCase(entry); setUsers(directory); setTitle(entry?.caseNumber || '') } })
      .catch((loadError) => { if (current) setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Fall.' : 'Der Fall konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [damageCaseId, editable, setTitle])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])
  const statusOptions = useMemo(() => new Map(DAMAGE_CASE_STATUSES.map((entry) => [entry.value, entry.label])), [])

  async function save(values) {
    try {
      await updateDamageCase(damageCase, values, { user, profile }, usersById)
      await load()
      setEditing(false)
      setToast('Fall aktualisiert.')
    } catch (saveError) {
      setError(saveError.message || 'Der Fall konnte nicht gespeichert werden.')
    }
  }

  if (loading) return <p className="page-state">Fall wird geladen …</p>
  if (error && !damageCase) return <section className="damage-detail-empty"><h2>Fall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/schaeden">Zur Übersicht</Link></section>
  if (!damageCase) return null

  const due = damageDuePresentation(damageCase)
  return <div className="damage-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="damage-detail-header"><div><Link className="damage-detail-header__back" to="/schaeden">← Zur Schäden-Übersicht</Link><div className="damage-detail-header__title"><h2>{damageCase.caseNumber}</h2><span className={`damage-status damage-status--${damageCase.status}`}>{statusOptions.get(damageCase.status) || damageCaseStatusLabel(damageCase.status)}</span></div></div>{editable && <button className="button" type="button" onClick={() => setEditing(true)}>Fall bearbeiten</button>}</div>
    {error && <p className="form-error">{error}</p>}
    {editing ? <section className="damage-detail-editor"><DamageCaseForm damageCase={damageCase} users={users} onCancel={() => setEditing(false)} onSubmit={save} /></section> : <section className="damage-detail-content"><dl className="damage-detail-list"><Detail label="Kurzbezeichnung / Beschreibung" className="damage-detail-list__title">{damageCase.title}</Detail><Detail label="Status">{damageCaseStatusLabel(damageCase.status)}</Detail><Detail label="Schadenart">{damageCase.damageType}</Detail><Detail label="Schadendatum">{formatDate(damageCase.damageDate)}</Detail><Detail label="Auftrag-/Tourreferenz">{damageCase.transportReference}</Detail><Detail label="Kunde / Anspruchsteller">{damageCase.claimant}</Detail><Detail label="Unternehmer">{damageCase.contractor}</Detail><Detail label="Verantwortliche Person">{damageCase.responsibleUserName}</Detail><Detail label="Nächste Frist"><span className={`damage-due damage-due--${due.kind}`}>{damageCase.dueDate ? `${due.label} · ${formatDate(damageCase.dueDate)}` : '—'}</span></Detail><Detail label="Schadenhöhe">{formatCurrency(damageCase.damageAmount)}</Detail><Detail label="Offenes BPL-Risiko">{formatCurrency(damageCase.openBplRisk)}</Detail></dl></section>}
  </div>
}
