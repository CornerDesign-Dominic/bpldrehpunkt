import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Toast from '../ui/Toast.jsx'
import { getBusinessPartner, listBusinessPartners } from '../../lib/businessPartners.js'
import { calculatePalletMovement, createPalletClosing, createPalletMovement, listPalletClosings, listPalletMovements, summarizePalletAccount, updatePalletMovement } from '../../lib/palletAccounts.js'
import PalletAccountOverviewCard from './PalletAccountOverviewCard.jsx'
import PalletAccountPartnerCard from './PalletAccountPartnerCard.jsx'
import PalletClosingForm from './PalletClosingForm.jsx'
import PalletJournal from './PalletJournal.jsx'
import PalletMovementForm from './PalletMovementForm.jsx'
import { createPalletClosingForm, createPalletMovementForm, createPalletMovementFormFromEntry, isNonNegativePalletQuantity, isPalletQuantityInput } from './palletFormState.js'

function fetchAccountData(partnerId) {
  return Promise.all([listPalletMovements(partnerId), listPalletClosings(partnerId)])
}

export default function PalletAccountDetail({ partnerId }) {
  const [partnerResult, setPartnerResult] = useState(null)
  const [partners, setPartners] = useState([])
  const [movements, setMovements] = useState([])
  const [closings, setClosings] = useState([])
  const [accountError, setAccountError] = useState('')
  const [activeForm, setActiveForm] = useState('')
  const [editingMovement, setEditingMovement] = useState(null)
  const [movementForm, setMovementForm] = useState(() => createPalletMovementForm())
  const [closingForm, setClosingForm] = useState(() => createPalletClosingForm(0))
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    let isCurrent = true
    getBusinessPartner(partnerId)
      .then((partner) => { if (isCurrent) setPartnerResult({ partner, error: partner ? '' : 'Geschäftspartner nicht gefunden.' }) })
      .catch(() => { if (isCurrent) setPartnerResult({ partner: null, error: 'Geschäftspartner nicht gefunden.' }) })
    listBusinessPartners().then((loadedPartners) => { if (isCurrent) setPartners(loadedPartners) }).catch(() => { if (isCurrent) setAccountError('Geschäftspartner für die Bewegungsauswahl konnten nicht geladen werden.') })
    fetchAccountData(partnerId)
      .then(([loadedMovements, loadedClosings]) => { if (isCurrent) { setMovements(loadedMovements); setClosings(loadedClosings) } })
      .catch(() => { if (isCurrent) setAccountError('Palettenbuchungen konnten nicht geladen werden.') })
    return () => { isCurrent = false }
  }, [partnerId])

  const account = useMemo(() => summarizePalletAccount(movements, closings, partnerId), [closings, movements, partnerId])
  const movementCalculation = useMemo(() => calculatePalletMovement(movementForm), [movementForm])
  const newClosingBalance = account.balance + (Number(closingForm.adjustment) || 0)
  const partnersById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners])
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])
  const selectedCustomer = partnersById.get(movementForm.customerId)
  const selectedCarrier = partnersById.get(movementForm.carrierId)

  async function reloadAccount() {
    const [loadedMovements, loadedClosings] = await fetchAccountData(partnerId)
    setMovements(loadedMovements)
    setClosings(loadedClosings)
  }

  function closeActiveForm() {
    setActiveForm('')
    setEditingMovement(null)
    setFormError('')
  }

  function openMovementForm(partner) {
    setFormError('')
    setEditingMovement(null)
    setMovementForm(createPalletMovementForm(partner))
    setActiveForm('movement')
  }

  function openClosingForm() {
    setFormError('')
    setEditingMovement(null)
    setClosingForm(createPalletClosingForm(account.balance))
    setActiveForm('closing')
  }

  function openMovementEdit(movement) {
    setFormError('')
    setEditingMovement(movement)
    setMovementForm(createPalletMovementFormFromEntry(movement))
    setActiveForm('movement')
  }

  function updateMovementField(field, value) {
    setMovementForm({ ...movementForm, [field]: value })
  }

  function updateStation(point, field, value) {
    if (field !== 'note' && !isPalletQuantityInput(value)) return
    setMovementForm({ ...movementForm, [point]: { ...movementForm[point], [field]: value } })
  }

  function updateClosingField(field, value) {
    setClosingForm({ ...closingForm, [field]: value })
  }

  async function handleMovementSubmit(event) {
    event.preventDefault()
    const quantities = [movementForm.loadingPoint.received, movementForm.loadingPoint.delivered, movementForm.unloadingPoint.received, movementForm.unloadingPoint.delivered]
    const hasMovement = quantities.some((value) => Number(value || 0) > 0)

    if (!movementForm.tourNumber.trim() || !movementForm.date) return setFormError('Tournummer und Datum sind erforderlich.')
    if (!movementForm.customerId && !movementForm.carrierId) return setFormError('Wählen Sie mindestens einen Kunden oder Unternehmer aus.')
    if (!quantities.every(isNonNegativePalletQuantity)) return setFormError('Palettenmengen müssen nicht-negative ganze Zahlen sein.')
    if (!hasMovement) return setFormError('Erfassen Sie mindestens eine Palettenmenge ungleich 0.')

    setIsSubmitting(true)
    setFormError('')
    try {
      if (editingMovement) await updatePalletMovement(editingMovement.id, movementForm)
      else await createPalletMovement(movementForm)
      await reloadAccount()
      closeActiveForm()
      setToast(editingMovement ? 'Palettenbewegung aktualisiert.' : 'Palettenbewegung gespeichert.')
    } catch {
      setFormError(editingMovement ? 'Die Palettenbewegung konnte nicht aktualisiert werden.' : 'Die Palettenbewegung konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleClosingSubmit(event) {
    event.preventDefault()
    const adjustment = Number(closingForm.adjustment)
    if (!closingForm.date || !Number.isFinite(adjustment) || adjustment === 0) return setFormError('Datum und eine Saldoänderung ungleich 0 sind erforderlich.')

    setIsSubmitting(true)
    setFormError('')
    try {
      await createPalletClosing(partnerId, { ...closingForm, previousBalance: account.balance, newBalance: newClosingBalance })
      await reloadAccount()
      closeActiveForm()
      setToast('Kontoabschluss gespeichert.')
    } catch {
      setFormError('Der Kontoabschluss konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!partnerResult) return <p className="page-state">Geschäftspartner wird geladen …</p>
  if (partnerResult.error) return <section className="pallets-empty-state pallets-empty-state--error"><h3>{partnerResult.error}</h3><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link></section>

  const { partner } = partnerResult

  return <div className="pallet-account-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="pallet-account-navigation"><Link className="button button--secondary" to="/paletten">Zurück</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Stammdaten</Link></div>
    <PalletAccountPartnerCard partner={partner} />
    <PalletAccountOverviewCard account={account} accountError={accountError} partner={partner} partnerId={partnerId} onSaved={(palletNote) => { setPartnerResult((current) => ({ ...current, partner: { ...current.partner, palletNote } })); setToast('Palettenbemerkung gespeichert.') }} />
    <section className="pallet-account-workspace">
      {accountError && <p className="form-error">{accountError}</p>}
      {activeForm === 'movement' && <PalletMovementForm carriers={carriers} customers={customers} editingMovement={editingMovement} formError={formError} isSubmitting={isSubmitting} movementCalculation={movementCalculation} movementForm={movementForm} onCancel={closeActiveForm} onChange={updateMovementField} onStationChange={updateStation} onSubmit={handleMovementSubmit} selectedCarrier={selectedCarrier} selectedCustomer={selectedCustomer} />}
      {activeForm === 'closing' && <PalletClosingForm accountBalance={account.balance} closingForm={closingForm} formError={formError} isSubmitting={isSubmitting} newClosingBalance={newClosingBalance} onCancel={closeActiveForm} onChange={updateClosingField} onSubmit={handleClosingSubmit} />}
      <PalletJournal account={account} accountError={accountError} onAddClosing={openClosingForm} onAddMovement={() => openMovementForm(partner)} onEditMovement={openMovementEdit} partnersById={partnersById} />
    </section>
  </div>
}
