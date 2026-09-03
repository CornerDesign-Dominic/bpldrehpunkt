import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { usePermissions } from '../../auth/usePermissions.js'
import Toast from '../ui/Toast.jsx'
import { getBusinessPartner, listBusinessPartners } from '../../lib/businessPartners.js'
import { calculatePalletMovement, createPalletClosing, createPalletMovement, deletePalletClosing, deletePalletMovement, listPalletClosings, listPalletMovements, summarizePalletAccount, updatePalletClosing, updatePalletMovement } from '../../lib/palletAccounts.js'
import PalletAccountOverviewCard from './PalletAccountOverviewCard.jsx'
import PalletAccountPartnerCard from './PalletAccountPartnerCard.jsx'
import PalletClosingForm from './PalletClosingForm.jsx'
import PalletJournal from './PalletJournal.jsx'
import PalletMovementForm from './PalletMovementForm.jsx'
import { createPalletClosingForm, createPalletClosingFormFromEntry, createPalletMovementForm, createPalletMovementFormFromEntry, isNonNegativePalletQuantity, isPalletQuantityInput } from './palletFormState.js'

function fetchAccountData(partnerId) {
  return Promise.all([listPalletMovements(partnerId), listPalletClosings(partnerId)])
}

export default function PalletAccountDetail({ partnerId }) {
  const { canEdit } = usePermissions()
  const [partnerResult, setPartnerResult] = useState(null)
  const [partners, setPartners] = useState([])
  const [movements, setMovements] = useState([])
  const [closings, setClosings] = useState([])
  const [accountError, setAccountError] = useState('')
  const [activeForm, setActiveForm] = useState('')
  const [editingMovement, setEditingMovement] = useState(null)
  const [editingClosing, setEditingClosing] = useState(null)
  const [movementForm, setMovementForm] = useState(() => createPalletMovementForm())
  const [closingForm, setClosingForm] = useState(() => createPalletClosingForm(0))
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

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
  const closingQuantity = Number(closingForm.quantity) || 0
  const closingAdjustment = closingForm.direction === 'add' ? closingQuantity : closingForm.direction === 'subtract' ? closingQuantity * -1 : 0
  const closingBaseBalance = editingClosing ? account.balance - (Number(editingClosing.adjustment) || 0) : account.balance
  const newClosingBalance = closingBaseBalance + closingAdjustment
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
    setEditingClosing(null)
    setDeleteTarget(null)
    setFormError('')
  }

  function openMovementForm(partner) {
    setFormError('')
    setEditingMovement(null)
    setEditingClosing(null)
    setMovementForm(createPalletMovementForm(partner))
    setActiveForm('movement')
  }

  function openClosingForm() {
    setFormError('')
    setEditingMovement(null)
    setEditingClosing(null)
    setClosingForm(createPalletClosingForm(account.balance))
    setActiveForm('closing')
  }

  function openMovementEdit(movement) {
    setFormError('')
    setEditingMovement(movement)
    setEditingClosing(null)
    setMovementForm(createPalletMovementFormFromEntry(movement))
    setActiveForm('movement')
  }

  function openClosingEdit(closing) {
    setFormError('')
    setEditingMovement(null)
    setEditingClosing(closing)
    setClosingForm(createPalletClosingFormFromEntry(closing))
    setActiveForm('closing')
  }

  function updateMovementField(field, value) {
    setMovementForm({ ...movementForm, [field]: value })
  }

  function updateStation(point, field, value) {
    if (field !== 'note' && !isPalletQuantityInput(value)) return
    setMovementForm({ ...movementForm, [point]: { ...movementForm[point], [field]: value } })
  }

  function updateClosingField(field, value) {
    if (field === 'quantity' && !isPalletQuantityInput(value)) return
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

  function requestMovementDelete() {
    if (editingMovement) setDeleteTarget({ type: 'movement', id: editingMovement.id })
  }

  async function handleClosingSubmit(event) {
    event.preventDefault()
    if (!closingForm.date) return setFormError('Bitte wählen Sie ein Datum.')
    if (!closingForm.direction) return setFormError('Wählen Sie Hinzufügen oder Abziehen.')
    if (!closingForm.quantity || !isNonNegativePalletQuantity(closingForm.quantity) || closingQuantity === 0) return setFormError('Geben Sie eine positive ganze Anzahl Paletten ein.')

    setIsSubmitting(true)
    setFormError('')
    try {
      const values = { ...closingForm, adjustment: closingAdjustment, previousBalance: closingBaseBalance, newBalance: newClosingBalance }
      if (editingClosing) await updatePalletClosing(editingClosing.id, values)
      else await createPalletClosing(partnerId, values)
      await reloadAccount()
      closeActiveForm()
      setToast(editingClosing ? 'Kontoabschluss aktualisiert.' : 'Kontoabschluss gespeichert.')
    } catch {
      setFormError(editingClosing ? 'Der Kontoabschluss konnte nicht aktualisiert werden.' : 'Der Kontoabschluss konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function requestClosingDelete() {
    if (editingClosing) setDeleteTarget({ type: 'closing', id: editingClosing.id })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setIsSubmitting(true)
    setFormError('')
    try {
      if (deleteTarget.type === 'movement') await deletePalletMovement(deleteTarget.id)
      else await deletePalletClosing(deleteTarget.id)
      await reloadAccount()
      closeActiveForm()
      setToast(deleteTarget.type === 'movement' ? 'Palettenbewegung gelöscht.' : 'Kontoabschluss gelöscht.')
    } catch {
      setFormError(deleteTarget.type === 'movement' ? 'Die Palettenbewegung konnte nicht gelöscht werden.' : 'Der Kontoabschluss konnte nicht gelöscht werden.')
    } finally {
      setIsSubmitting(false)
      setDeleteTarget(null)
    }
  }

  if (!partnerResult) return <p className="page-state">Geschäftspartner wird geladen …</p>
  if (partnerResult.error) return <section className="pallets-empty-state pallets-empty-state--error"><h3>{partnerResult.error}</h3><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link></section>

  const { partner } = partnerResult

  return <div className="pallet-account-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.type === 'movement' ? 'Palettenbewegung löschen?' : 'Kontoabschluss löschen?'} message={deleteTarget?.type === 'movement' ? 'Diese Palettenbewegung wird dauerhaft gelöscht.' : 'Dieser Kontoabschluss wird dauerhaft gelöscht.'} confirmLabel="Löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={isSubmitting} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    <div className="pallet-account-navigation"><Link className="button button--secondary" to="/paletten">Zurück</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Stammdaten</Link></div>
    <PalletAccountPartnerCard partner={partner} />
    <PalletAccountOverviewCard account={account} accountError={accountError} partner={partner} partnerId={partnerId} canEdit={canEdit('pallets')} onSaved={(palletNote) => { setPartnerResult((current) => ({ ...current, partner: { ...current.partner, palletNote } })); setToast('Palettenbemerkung gespeichert.') }} />
    <section className="pallet-account-workspace">
      {accountError && <p className="form-error">{accountError}</p>}
      {canEdit('pallets') && activeForm === 'movement' && <PalletMovementForm carriers={carriers} customers={customers} editingMovement={editingMovement} formError={formError} isSubmitting={isSubmitting} movementCalculation={movementCalculation} movementForm={movementForm} onCancel={closeActiveForm} onChange={updateMovementField} onDelete={requestMovementDelete} onStationChange={updateStation} onSubmit={handleMovementSubmit} selectedCarrier={selectedCarrier} selectedCustomer={selectedCustomer} />}
      {canEdit('pallets') && activeForm === 'closing' && <PalletClosingForm accountBalance={closingBaseBalance} closingForm={closingForm} editingClosing={editingClosing} formError={formError} isSubmitting={isSubmitting} newClosingBalance={newClosingBalance} onCancel={closeActiveForm} onChange={updateClosingField} onDelete={requestClosingDelete} onSubmit={handleClosingSubmit} />}
      <PalletJournal account={account} accountError={accountError} isEntryFormActive={Boolean(activeForm)} onAddClosing={openClosingForm} onAddMovement={() => openMovementForm(partner)} onEditClosing={openClosingEdit} onEditMovement={openMovementEdit} canEdit={canEdit('pallets')} />
    </section>
  </div>
}
