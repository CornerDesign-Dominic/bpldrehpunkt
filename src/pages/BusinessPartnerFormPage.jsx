import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, getBusinessPartnerType, updateBusinessPartner } from '../lib/businessPartners.js'
import { getCurrentCrmRatingPresentation, listCurrentCrmRatings } from '../lib/crmRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { useAuth } from '../auth/useAuth.js'

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function CrmShortStatus({ partner, ratings }) {
  const ratingItems = getCurrentCrmRatingPresentation(partner, ratings)
  return <aside className="crm-short-status" aria-label="CRM-Kurzstatus"><span className="crm-short-status__title">CRM</span><div className="crm-short-status__values"><div className="crm-short-status__rating"><span>Bewertung</span>{ratingItems.map((rating) => <span className="crm-short-status__rating-value" key={rating.role}><i className={`crm-rating-indicator crm-rating-indicator--${rating.status}`} aria-hidden="true" />{ratingItems.length > 1 && `${rating.label}: `}{rating.value}</span>)}</div><div className="crm-short-status__credit"><span>Kreditlimit</span><strong>{formatCreditLimit(partner.creditLimit)}</strong></div></div></aside>
}

export default function BusinessPartnerFormPage({ mode }) {
  const authState = useAuth()
  const { partnerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [currentValues, setCurrentValues] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [loading, setLoading] = useState(mode === 'existing')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [isDirty, setDirty] = useState(false)
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [crmRatings, setCrmRatings] = useState({})

  useEffect(() => {
    if (mode !== 'existing') return
    getBusinessPartner(partnerId)
      .then((result) => { setPartner(result); setCurrentValues(result); if (!result) setError('Der Geschäftspartner wurde nicht gefunden.') })
      .catch(() => setError('Die Stammdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [mode, partnerId])

  useEffect(() => {
    if (mode !== 'existing') return
    listCurrentCrmRatings([partnerId])
      .then((ratings) => setCrmRatings(ratings[partnerId] ?? {}))
      .catch(() => setCrmRatings({}))
  }, [mode, partnerId])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createBusinessPartner(values) : (await updateBusinessPartner(partnerId, values, getHistoryActor(authState)), partnerId)
      if (mode === 'create') {
        navigate(`/kunden-unternehmer/${savedId}`, { state: { toast: 'Geschäftspartner erfolgreich angelegt.' } })
      } else {
        setPartner(values)
        setCurrentValues(values)
        setToast('Änderungen gespeichert.')
      }
      return true
    } catch {
      setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/kunden-unternehmer">Zur Übersicht</Link></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <header className="masterdata-header">
        <div className="masterdata-header__identity"><h2>{shownPartner.companyName || 'Neuer Geschäftspartner'}</h2>{!isNew && <div className="masterdata-header__meta-row"><div className="detail-header__meta"><span>{getBusinessPartnerType(shownPartner)}</span><span className={`status-badge status-badge--${shownPartner.status}`}>{shownPartner.status === 'active' ? 'Aktiv' : 'Inaktiv'}</span></div><CrmShortStatus partner={partner} ratings={crmRatings} /></div>}</div>
        <div className="masterdata-header__actions"><Link className="button button--secondary" to="/kunden-unternehmer">Zur Übersicht</Link>{!isNew && <Link className="button button--secondary" to={`/crm/${partnerId}`}>Zum CRM</Link>}{!isNew && <Link className="button button--secondary" to={`/paletten/${partnerId}`}>Zum Palettenkonto</Link>}{isDirty && <span className="dirty-hint">Ungespeicherte Änderungen</span>}<button className="button" form="business-partner-form" type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>{isSubmitting ? 'Wird gespeichert …' : isNew ? 'Anlegen' : 'Speichern'}</button></div>
      </header>
      {error && <p className="form-error">{error}</p>}
      <BusinessPartnerForm formId="business-partner-form" initialValue={partner} onSubmit={handleSubmit} onDirtyChange={setDirty} onFormChange={setCurrentValues} />
    </div>
  )
}
