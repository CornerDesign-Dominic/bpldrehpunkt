import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import BusinessPartnerHeader from '../components/business-partners/BusinessPartnerHeader.jsx'
import Toast from '../components/ui/Toast.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, updateBusinessPartner } from '../lib/businessPartners.js'
import { listCurrentCrmRatings } from '../lib/crmRatings.js'
import { getHistoryActor } from '../lib/partnerHistory.js'
import { listPalletClosings, listPalletMovements, summarizePalletAccount } from '../lib/palletAccounts.js'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'

export default function BusinessPartnerFormPage({ mode }) {
  const authState = useAuth()
  const { canEdit, canView } = usePermissions()
  const { partnerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [currentValues, setCurrentValues] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [loading, setLoading] = useState(mode === 'existing')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
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

  const palletAccount = useMemo(() => (palletMovements && palletClosings ? summarizePalletAccount(palletMovements, palletClosings, partnerId) : null), [palletClosings, palletMovements, partnerId])

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{error}</p><BackLink to="/kunden-unternehmer" /></section>

  const shownPartner = currentValues ?? partner
  const isNew = mode === 'create'
  const editable = canEdit('masterData')

  return (
    <div className="masterdata-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <div className="masterdata-action-row"><div><BackLink to="/kunden-unternehmer" /></div>{isNew && editable && <button aria-busy={isSubmitting} className="button masterdata-record-actions__save" form="business-partner-form" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird angelegt …' : 'Anlegen'}</button>}</div>
      {!isNew && <BusinessPartnerHeader account={palletAccount} canViewCrm={canView('crm')} canViewPallets={canView('pallets')} partner={shownPartner} partnerId={partnerId} ratings={crmRatings} />}
      {error && <p className="form-error">{error}</p>}
      <BusinessPartnerForm formId="business-partner-form" initialValue={partner} isNew={isNew} onSubmit={handleSubmit} onFormChange={setCurrentValues} readOnly={!editable} saving={isSubmitting} />
    </div>
  )
}
