import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, getBusinessPartnerStatusLabel, getBusinessPartnerType, updateBusinessPartner } from '../lib/businessPartners.js'
import { getCurrentCrmRatingPresentation, listCurrentCrmRatings } from '../lib/crmRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { listPalletClosings, listPalletMovements, summarizePalletAccount } from '../lib/palletAccounts.js'
import { useAuth } from '../auth/useAuth.js'
import { formatPalletDate, formatPalletNumber } from '../components/pallets/palletFormatters.js'

function formatCreditLimit(value) {
  return value === null || value === undefined ? 'n/a' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function MasterdataInfoCard({ partner, ratings, partnerId }) {
  const ratingItems = getCurrentCrmRatingPresentation(partner, ratings)
  return <Link className="masterdata-info-card" to={`/crm/${partnerId}`} aria-label="CRM des Geschäftspartners öffnen"><span>{getBusinessPartnerType(partner)}</span><span>Status: <strong>{getBusinessPartnerStatusLabel(partner.status)}</strong></span><span>Kreditlimit: <strong>{formatCreditLimit(partner.creditLimit)}</strong></span>{ratingItems.map((rating) => <span className="masterdata-info-card__rating" key={rating.role}><i className={`crm-rating-indicator crm-rating-indicator--${rating.status}`} aria-hidden="true" />{rating.role === 'customer' ? 'Kunde' : 'UTN'}: <strong>{rating.value}</strong></span>)}<span className="masterdata-info-card__chevron" aria-hidden="true">→</span></Link>
}

function PalletAccountInfoCard({ account, movements, partnerId }) {
  if (!account) return <Link className="pallet-account-info-card" to={`/paletten/${partnerId}`} aria-label="Palettenkonto öffnen"><span>Palettenkonto: —</span><span className="pallet-account-info-card__chevron" aria-hidden="true">→</span></Link>
  if (!movements.length) return <Link className="pallet-account-info-card" to={`/paletten/${partnerId}`} aria-label="Palettenkonto öffnen"><span>Keine Palettenbewegungen vorhanden</span><span className="pallet-account-info-card__chevron" aria-hidden="true">→</span></Link>

  const latestMovement = account.entries.filter((entry) => entry.entryType === 'movement').at(-1)
  return <Link className="pallet-account-info-card" to={`/paletten/${partnerId}`} aria-label="Palettenkonto öffnen"><span className="pallet-account-info-card__balance">Palettensaldo: <strong>{formatPalletNumber(account.balance, true)}</strong></span><span>Letzte Bewegung: <strong>{latestMovement?.date ? formatPalletDate(latestMovement.date) : '—'}</strong></span><span>{movements.length} Bewegungen</span><span>Letzter Abschluss: <strong>{account.latestClosing?.date ? formatPalletDate(account.latestClosing.date) : '—'}</strong></span><span className="pallet-account-info-card__chevron" aria-hidden="true">→</span></Link>
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
  const [resetVersion, setResetVersion] = useState(0)
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [crmRatings, setCrmRatings] = useState({})
  const [palletMovements, setPalletMovements] = useState(null)
  const [palletClosings, setPalletClosings] = useState(null)

  useEffect(() => {
    if (mode !== 'existing') return
    getBusinessPartner(partnerId)
      .then((result) => { setPartner(result); setCurrentValues(result); if (!result) setError('Der Geschäftspartner wurde nicht gefunden.') })
      .catch(() => setError('Die Stammdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [mode, partnerId])

  useEffect(() => {
    if (mode !== 'existing') return
    let isCurrent = true
    Promise.all([listPalletMovements(partnerId), listPalletClosings(partnerId)])
      .then(([movements, closings]) => { if (isCurrent) { setPalletMovements(movements); setPalletClosings(closings) } })
      .catch(() => { if (isCurrent) { setPalletMovements([]); setPalletClosings([]) } })
    return () => { isCurrent = false }
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

  function discardChanges() {
    setError('')
    setCurrentValues(partner)
    setDirty(false)
    setResetVersion((current) => current + 1)
  }

  const palletAccount = useMemo(() => (palletMovements && palletClosings ? summarizePalletAccount(palletMovements, palletClosings, partnerId) : null), [palletClosings, palletMovements, partnerId])

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/kunden-unternehmer">Zur Übersicht</Link></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="masterdata-action-row"><div><Link className="button button--secondary" to="/kunden-unternehmer">Zurück</Link></div><div className="masterdata-record-actions"><div className="masterdata-record-actions__content">{isDirty && <span className="dirty-hint" role="status"><span className="dirty-hint__icon" aria-hidden="true">!</span>Ungespeicherte Änderungen</span>}<button className="button button--secondary masterdata-record-actions__discard" type="button" onClick={discardChanges} disabled={isSubmitting || !isDirty}>Verwerfen</button><button aria-busy={isSubmitting} className="button masterdata-record-actions__save" form="business-partner-form" type="submit" disabled={isSubmitting || (!isNew && !isDirty)}>{isSubmitting ? 'Wird gespeichert …' : isNew ? 'Anlegen' : 'Speichern'}</button></div></div></div>
      {!isNew && <MasterdataInfoCard partner={shownPartner} ratings={crmRatings} partnerId={partnerId} />}
      {!isNew && <PalletAccountInfoCard account={palletAccount} movements={palletMovements ?? []} partnerId={partnerId} />}
      {error && <p className="form-error">{error}</p>}
      <section className="masterdata-content-card"><BusinessPartnerForm key={resetVersion} formId="business-partner-form" initialValue={partner} onSubmit={handleSubmit} onDirtyChange={setDirty} onFormChange={setCurrentValues} /></section>
    </div>
  )
}
