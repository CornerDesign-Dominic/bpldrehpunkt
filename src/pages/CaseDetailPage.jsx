import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import CaseForm from '../components/cases/CaseForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { CASE_MODULES, createCase, createEmptyCase, getCase, updateCase } from '../lib/cases.js'
import { listBusinessPartners } from '../lib/businessPartners.js'

export default function CaseDetailPage({ moduleKey, mode }) {
  const { caseId } = useParams()
  const module = CASE_MODULES[moduleKey]
  const navigate = useNavigate()
  const location = useLocation()
  const [caseData, setCaseData] = useState(mode === 'create' ? createEmptyCase(moduleKey) : null)
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(mode === 'existing')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState(location.state?.toast ?? '')

  useEffect(() => {
    Promise.all([mode === 'existing' ? getCase(moduleKey, caseId) : Promise.resolve(null), listBusinessPartners()]).then(([item, businessPartners]) => { setPartners(businessPartners); if (mode === 'existing') { setCaseData(item); if (!item) setError('Der Fall wurde nicht gefunden.') } }).catch(() => setError('Die Fallakte konnte nicht geladen werden.')).finally(() => setLoading(false))
  }, [caseId, mode, moduleKey])

  async function handleSubmit(values) {
    setSubmitting(true); setError('')
    try {
      const savedId = mode === 'create' ? await createCase(moduleKey, values) : (await updateCase(moduleKey, caseId, values), caseId)
      if (mode === 'create') navigate(`${module.route}/${savedId}`, { state: { toast: `${module.singular} erfolgreich angelegt.` } })
      else { setCaseData(values); setToast('Änderungen gespeichert.') }
      return true
    } catch { setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.'); return false } finally { setSubmitting(false) }
  }

  if (loading) return <p className="page-state">Fallakte wird geladen …</p>
  if (error && !caseData) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to={module.route}>Zur Übersicht</Link></section>
  const title = caseData.title || `Neuer ${module.singular}`
  return <div className="case-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <header className="masterdata-header"><div className="masterdata-header__identity"><p className="page-kicker">{mode === 'create' ? `Neuer ${module.singular}` : module.title}</p><h2>{title}</h2>{mode === 'existing' && <div className="detail-header__meta"><span>{caseData.internalReference}</span><span className="case-status">{caseData.status}</span></div>}</div><div className="masterdata-header__actions"><Link className="button button--secondary" to={module.route}>Zur Übersicht</Link>{dirty && <span className="dirty-hint">Ungespeicherte Änderungen</span>}<button className="button" type="submit" form="case-form" disabled={submitting || (mode === 'existing' && !dirty)}>{submitting ? 'Wird gespeichert …' : mode === 'create' ? 'Anlegen' : 'Speichern'}</button></div></header>
    {error && <p className="form-error">{error}</p>}
    <CaseForm key={`${moduleKey}-${caseId ?? 'new'}`} formId="case-form" moduleKey={moduleKey} initialValue={caseData} partners={partners} onSubmit={handleSubmit} onDirtyChange={setDirty} />
  </div>
}
