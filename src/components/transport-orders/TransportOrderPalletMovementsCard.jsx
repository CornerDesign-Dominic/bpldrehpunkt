import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { getBusinessPartnerRoles, listBusinessPartners } from '../../lib/businessPartners.js'
import { palletAccountPath } from '../../lib/businessPartnerLinks.js'
import { calculatePalletMovement, createPalletMovement, deletePalletMovement, listTransportOrderPalletMovements, updatePalletMovement } from '../../lib/palletAccounts.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import PalletMovementForm from '../pallets/PalletMovementForm.jsx'
import { createPalletMovementForm, createPalletMovementFormFromEntry, isNonNegativePalletQuantity, isPalletQuantityInput, palletPartnerOption } from '../pallets/palletFormState.js'
import { formatPalletDate } from '../pallets/palletFormatters.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''

export default function TransportOrderPalletMovementsCard({ canEdit, transportOrder }) {
  const navigate = useNavigate()
  const transportNumber = text(transportOrder?.externalNumber)
  const [movements, setMovements] = useState([])
  const [partners, setPartners] = useState([])
  const partnerRequest = useRef(null)
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingMovement, setEditingMovement] = useState(null)
  const [movementForm, setMovementForm] = useState(() => createPalletMovementForm())
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let current = true
    Promise.resolve().then(() => {
      if (!current) return null
      setLoading(true)
      setError('')
      return listTransportOrderPalletMovements(transportOrder.id)
    }).then((loadedMovements) => {
      if (!current) return
      setMovements(loadedMovements)
      setError('')
    }).catch(() => { if (current) setError('Die verknüpften Palettenbewegungen konnten nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [transportOrder.id, transportNumber, reloadVersion])

  async function preparePartnerOptions() {
    setPartnersLoading(true)
    setError('')
    try {
      if (!partnerRequest.current) partnerRequest.current = listBusinessPartners().catch((error) => { partnerRequest.current = null; throw error })
      setPartners(await partnerRequest.current)
      return true
    } catch (error) {
      void reportTechnicalFailure({ module: 'pallets', stage: 'load', recordId: transportOrder.id, error })
      setError('Geschäftspartner für die Bewegungsauswahl konnten nicht geladen werden.')
      return false
    } finally { setPartnersLoading(false) }
  }

  const partnersById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners])
  const customers = useMemo(() => partners.filter((partner) => !partner.mergedIntoPartnerId && getBusinessPartnerRoles(partner).customer), [partners])
  const carriers = useMemo(() => partners.filter((partner) => !partner.mergedIntoPartnerId && getBusinessPartnerRoles(partner).carrier), [partners])
  const selectedCustomer = partnersById.get(movementForm.customerId)
  const selectedCarrier = partnersById.get(movementForm.carrierId)
  const historicalCustomer = useMemo(() => {
    const option = palletPartnerOption(partnersById, movementForm.customerId)
    return option?.isHistorical ? option : null
  }, [movementForm.customerId, partnersById])
  const historicalCarrier = useMemo(() => {
    const option = palletPartnerOption(partnersById, movementForm.carrierId)
    return option?.isHistorical ? option : null
  }, [movementForm.carrierId, partnersById])
  const movementCalculation = useMemo(() => calculatePalletMovement(movementForm), [movementForm])

  function closeEditor() {
    if (isSubmitting) return
    finishEditing()
  }

  function finishEditing() {
    setEditorOpen(false)
    setEditingMovement(null)
    setFormError('')
  }

  async function openNewMovement() {
    if (!await preparePartnerOptions()) return
    const emptyForm = createPalletMovementForm()
    setMovementForm({ ...emptyForm, tourNumber: transportNumber, customerId: transportOrder?.imported?.customer?.partnerId || '', carrierId: transportOrder?.imported?.carrier?.partnerId || '' })
    setEditingMovement(null)
    setFormError('')
    setEditorOpen(true)
  }

  async function openMovement(movement) {
    if (!await preparePartnerOptions()) return
    setPickerOpen(false)
    setEditingMovement(movement)
    setMovementForm(createPalletMovementFormFromEntry(movement))
    setFormError('')
    setEditorOpen(true)
  }

  function openMovementViewer() {
    if (movements.length === 1) openMovement(movements[0])
    else setPickerOpen(true)
  }

  function updateMovementField(field, value) {
    setMovementForm((current) => ({ ...current, [field]: value }))
  }

  function updateStation(point, field, value) {
    if (field !== 'note' && !isPalletQuantityInput(value)) return
    setMovementForm((current) => ({ ...current, [point]: { ...current[point], [field]: value } }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const quantities = [movementForm.loadingPoint.received, movementForm.loadingPoint.delivered, movementForm.unloadingPoint.received, movementForm.unloadingPoint.delivered]
    const hasMovement = quantities.some((value) => Number(value || 0) > 0)
    if (!movementForm.tourNumber.trim() || !movementForm.date) return setFormError('Transportnummer und Datum sind erforderlich.')
    if (!movementForm.customerId && !movementForm.carrierId) return setFormError('Wählen Sie mindestens einen Kunden oder Unternehmer aus.')
    if (!quantities.every(isNonNegativePalletQuantity)) return setFormError('Palettenmengen müssen nicht-negative ganze Zahlen sein.')
    if (!hasMovement) return setFormError('Erfassen Sie mindestens eine Palettenmenge ungleich 0.')

    setIsSubmitting(true)
    setFormError('')
    try {
      if (editingMovement) await updatePalletMovement(editingMovement.id, movementForm, editingMovement.revision || 0)
      else await createPalletMovement(movementForm)
      // The mutation has committed. Close this draft before refreshing; a read
      // failure must never invite a second create after an acknowledged save.
      finishEditing()
      setReloadVersion((version) => version + 1)
    } catch {
      setFormError(editingMovement ? 'Die Palettenbewegung konnte nicht aktualisiert werden.' : 'Die Palettenbewegung konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setIsSubmitting(true)
    try {
      await deletePalletMovement(deleteTarget.id, deleteTarget.revision || 0)
      setDeleteTarget(null)
      finishEditing()
      setReloadVersion((version) => version + 1)
    } catch {
      setFormError('Die Palettenbewegung konnte nicht gelöscht werden.')
      setDeleteTarget(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  function openPartnerAccount(partnerId) {
    if (!editingMovement || !partnerId) return
    navigate(palletAccountPath(partnerId), { state: { palletMovementId: editingMovement.id } })
  }

  const accountLinks = editingMovement ? [
    editingMovement.carrierId && { partnerId: editingMovement.carrierId, label: 'Zum Unternehmer-Palettenkonto', onClick: () => openPartnerAccount(editingMovement.carrierId) },
    editingMovement.customerId && { partnerId: editingMovement.customerId, label: 'Zum Kunden-Palettenkonto', onClick: () => openPartnerAccount(editingMovement.customerId) },
  ].filter(Boolean) : []
  return <section className="transport-order-detail-section transport-order-pallet-movements">
    <h3><StaticText source={"Palettenbewegungen"} /></h3>
    {error && <div><p className="form-error">{<StaticText source={error} />}</p><button type="button" className="button button--secondary" disabled={loading} onClick={() => setReloadVersion((version) => version + 1)}><StaticText source="Erneut versuchen" /></button></div>}
    {loading ? <p><StaticText source={"Palettenbewegungen werden geladen …"} /></p> : <div className="transport-order-detail-actions__buttons"><button className={movements.length ? 'button' : 'button button--secondary'} type="button" disabled={!canEdit || partnersLoading || Boolean(error)} title={!canEdit ? 'Sie haben keine Berechtigung, Palettenbewegungen zu bearbeiten.' : undefined} onClick={movements.length ? openMovementViewer : openNewMovement}>{<StaticText source={movements.length ? 'Zur Bewegung' : 'Bewegung hinzufügen'} />}</button></div>}
    {pickerOpen && createPortal(<div className="pallet-movement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false) }}><section className="pallet-movement-modal transport-order-pallet-movements__picker" role="dialog" aria-modal="true" aria-labelledby="pallet-movement-picker-title"><header className="transport-order-pallet-movements__picker-header"><div><h2 id="pallet-movement-picker-title"><StaticText source={"Palettenbewegung auswählen"} /></h2><p><StaticText source={"Wählen Sie die Bewegung aus, die Sie ansehen möchten."} /></p></div><TranslatedProps sources={{"aria-label":"Dialog schließen","title":"Schließen"}}><button className="pallet-movement-modal__close" type="button" onClick={() => setPickerOpen(false)} aria-label="Dialog schließen" title="Schließen">×</button></TranslatedProps></header><div className="transport-order-pallet-movements__picker-list">{movements.map((movement) => <button key={movement.id} type="button" className="transport-order-pallet-movements__picker-item" onClick={() => openMovement(movement)}><div><strong>{movement.palletReceiptNumber || 'Palettenbewegung'}</strong><span>{formatPalletDate(movement.date)}</span></div></button>)}</div></section></div>, document.body)}
    {editorOpen && createPortal(<div className="pallet-movement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor() }}><section className="pallet-movement-modal" role="dialog" aria-modal="true" aria-labelledby="pallet-movement-modal-title"><PalletMovementForm accountLinks={accountLinks} modal carriers={carriers} customers={customers} editingMovement={editingMovement} formError={formError} historicalCarrier={historicalCarrier} historicalCustomer={historicalCustomer} isSubmitting={isSubmitting} movementCalculation={movementCalculation} movementForm={movementForm} onCancel={closeEditor} onChange={updateMovementField} onDelete={() => setDeleteTarget(editingMovement)} onStationChange={updateStation} onSubmit={handleSubmit} selectedCarrier={selectedCarrier} selectedCustomer={selectedCustomer} /></section></div>, document.body)}
    <TranslatedProps sources={{"title":"Palettenbewegung löschen?","confirmLabel":"Löschen"}}><ConfirmDialog open={Boolean(deleteTarget)} title="Palettenbewegung löschen?" message="Diese Palettenbewegung wird unwiderruflich gelöscht." confirmLabel="Löschen" submittingLabel="Wird gelöscht …" isSubmitting={isSubmitting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} /></TranslatedProps>
  </section>
}
