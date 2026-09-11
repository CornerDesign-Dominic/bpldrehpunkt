import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InsolvencyCaseForm from '../components/insolvencies/InsolvencyCaseForm.jsx'
import InsolvenciesTable from '../components/insolvencies/InsolvenciesTable.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { createInsolvency, listInsolvencies, listInsolvencyPartners } from '../lib/insolvencies.js'

export default function InsolvenciesPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const navigate = useNavigate()
  const editable = canEdit('insolvencies')
  const [insolvencies, setInsolvencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [partners, setPartners] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [partnerError, setPartnerError] = useState('')

  useEffect(() => {
    let current = true
    listInsolvencies().then((entries) => { if (current) setInsolvencies(entries) }).catch(() => { if (current) setError('Die Insolvenzfälle konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  async function openForm() {
    setShowForm(true)
    setLoadingPartners(true)
    setPartnerError('')
    try { setPartners(await listInsolvencyPartners()) } catch { setPartnerError('Die Unternehmensauswahl konnte nicht geladen werden.') } finally { setLoadingPartners(false) }
  }

  async function save(values, partner) {
    const id = await createInsolvency(values, partner, { user, profile })
    setShowForm(false)
    navigate(`/insolvenzen/${id}`)
  }

  return <div className="damages-page insolvencies-page">
    {editable && <div className="damage-actions"><button className="button" type="button" onClick={() => { void openForm() }}>Insolvenz hinzufügen</button></div>}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Insolvenzfälle werden geladen …</p> : <section className="todo-section" aria-labelledby="insolvencies-heading"><div className="todo-section__heading"><h2 id="insolvencies-heading">Insolvenzfälle</h2><span>{insolvencies.length}</span></div><InsolvenciesTable insolvencies={insolvencies} onOpen={(insolvency) => navigate(`/insolvenzen/${insolvency.id}`)} /></section>}
    {showForm && <div className="damage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="damage-form-modal" role="dialog" aria-modal="true" aria-label="Insolvenz hinzufügen"><InsolvencyCaseForm onCancel={() => setShowForm(false)} onSubmit={save} partners={partners} loadingPartners={loadingPartners} partnerError={partnerError} /></section></div>}
  </div>
}
