import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BusinessPartnerForm from '../components/business-partners/BusinessPartnerForm.jsx'
import { createBusinessPartner, createEmptyBusinessPartner, getBusinessPartner, updateBusinessPartner } from '../lib/businessPartners.js'

export default function BusinessPartnerFormPage({ mode }) {
  const { partnerId } = useParams()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(mode === 'create' ? createEmptyBusinessPartner() : null)
  const [loading, setLoading] = useState(mode === 'edit')
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (mode !== 'edit') return
    getBusinessPartner(partnerId)
      .then((result) => { setPartner(result); if (!result) setError('Der Geschäftspartner wurde nicht gefunden.') })
      .catch(() => setError('Die Stammdaten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [mode, partnerId])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createBusinessPartner(values) : (await updateBusinessPartner(partnerId, values), partnerId)
      navigate(`/kunden-unternehmer/${savedId}`)
    } catch {
      setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="page-state">Stammdaten werden geladen …</p>
  if (error && !partner) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/kunden-unternehmer">Zur Übersicht</Link></section>

  return <div className="form-page"><p className="page-kicker">{mode === 'create' ? 'Neuer Stammdatensatz' : 'Stammdatensatz bearbeiten'}</p>{error && <p className="form-error">{error}</p>}<BusinessPartnerForm initialValue={partner} onSubmit={handleSubmit} isSubmitting={isSubmitting} submitLabel={mode === 'create' ? 'Geschäftspartner anlegen' : 'Änderungen speichern'} cancelTo={mode === 'create' ? '/kunden-unternehmer' : `/kunden-unternehmer/${partnerId}`} /></div>
}
