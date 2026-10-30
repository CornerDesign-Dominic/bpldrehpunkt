import MailActionButton from './MailActionButton.jsx'
import { useMailboxAction } from '../../mailboxes/useMailboxAction.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { mailboxCall } from '../../lib/mailboxes.js'
import { fieldLabels, shipmentTrackingFormValues, shipmentTrackingStageConfigurations, timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'
import { ShipmentTrackingStageFields } from '../transport-orders/ShipmentTrackingEditorModal.jsx'
import ShipmentTrackingTransitFields from '../transport-orders/ShipmentTrackingTransitFields.jsx'
import { normalizedTransitEntry } from '../transport-orders/shipmentTrackingEditorUtils.js'
import Toast from '../ui/Toast.jsx'
import MailWorkDialog from './MailWorkDialog.jsx'

const stages = [{ id: 'preparation', de: 'Vorbereitung', en: 'Preparation' }, { id: 'loading', de: 'Ladestelle', en: 'Loading' }, { id: 'in_transit', de: 'Unterwegs', en: 'In transit' }, { id: 'unloading', de: 'Entladestelle', en: 'Unloading' }]
const inputValue = (field, value) => field.endsWith('At') ? timestampToDateTimeInput(value) : value ?? ''
function initialValues(tracking) { return { ...shipmentTrackingFormValues(tracking), tractorLicensePlate: tracking.tractorLicensePlate || '', trailerLicensePlate: tracking.trailerLicensePlate || '' } }
function errorText(error, w) {
  if (error?.code === 'functions/aborted') return w('Auftrag oder Sendungsverfolgung wurden inzwischen geändert. Bitte erneut auswerten. Deine Eingaben bleiben bis dahin erhalten.', 'The order or tracking changed. Analyse again. Your input is preserved until then.')
  if (error?.code === 'functions/permission-denied') return w('Für diese Aktion fehlt eine Berechtigung oder die Postfachverbindung wurde getrennt.', 'Permission is missing or the mailbox was disconnected.')
  if (error?.code === 'functions/resource-exhausted') return w('Zu viele Auswertungen. Bitte später erneut versuchen.', 'Too many analyses. Please try again later.')
  if (error?.code === 'functions/failed-precondition') return w('Die Auswertung ist abgelaufen oder die Sendungsverfolgung ist abgeschlossen. Bitte den Auftrag prüfen oder erneut auswerten.', 'The preview expired or tracking is complete. Check the order or analyse again.')
  return w('Die Aktion konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.', 'Could not complete this action. Your input is preserved. Please try again.')
}

function AssignmentDialog({ open, busy, candidates, error, onAssign, onClose, w }) {
  const ref = useRef(null)
  const [number, setNumber] = useState('')
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [open])
  return <dialog ref={ref} className="mail-tracking-assignment" aria-labelledby="mail-tracking-assignment-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() }}>
    <h2 id="mail-tracking-assignment-title">{w('Transportauftrag zuordnen', 'Assign transport order')}</h2><p>{w('Bitte ordne diese Mail einem eindeutigen Auftrag zu. Es wird noch nichts gespeichert.', 'Choose one order for this message. Nothing is saved yet.')}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {candidates?.length > 0 && <div className="mail-tracking-candidates">{candidates.map(candidate => <button className="button button--secondary" type="button" disabled={busy} key={candidate.id} onClick={() => onAssign(candidate.number)}>TA {candidate.number}</button>)}</div>}
    <form onSubmit={event => { event.preventDefault(); void onAssign(number.trim()) }}><label className="form-field"><span>{w('TA-Nummer', 'TA number')}</span><input autoFocus inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required value={number} disabled={busy} onChange={event => setNumber(event.target.value)} /></label><div className="mailbox-reply-buttons"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>{w('Zurück', 'Back')}</button><button className="button" type="submit" disabled={busy}>{busy ? w('Wird geprüft …', 'Checking …') : w('Zuordnen und auswerten', 'Assign and analyse')}</button></div></form>
  </dialog>
}

export default function MailTrackingAction({ identity, mailContent }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const action = useMailboxAction(identity, 'tracking')
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [values, setValues] = useState({})
  const [base, setBase] = useState({})
  const [entries, setEntries] = useState([])
  const [originalEntries, setOriginalEntries] = useState([])
  const [openStages, setOpenStages] = useState([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assignment, setAssignment] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [toast, setToast] = useState('')
  const generation = useRef(0)
  const adoptedResult = useRef(null)
  useEffect(() => { const version = generation; return () => { ++version.current } }, [])

  useEffect(() => {
    const result = action.result
    const resultKey = `${action.jobId}:${result?.previewId || 'result'}:${action.state === 'completed' ? 'completed' : 'preview'}`
    if (!result || adoptedResult.current === resultKey) return
    let active = true
    Promise.resolve().then(() => {
      if (!active) return
      adoptedResult.current = resultKey
      if (result.alreadyApplied || result.needsAssignment) {
        setPreview(result); setValues({}); setBase({}); setOpenStages([]); setEntries([]); setOriginalEntries([])
        return
      }
      const baseline = initialValues(result.tracking)
      const filled = { ...baseline }
      for (const [field, value] of Object.entries(result.proposals)) if (!result.conflicts.includes(field)) filled[field] = inputValue(field, value)
      if (action.state === 'completed') for (const [field, value] of Object.entries(result.appliedChanges || {})) filled[field] = inputValue(field, value)
      const nextEntries = (action.state === 'completed' && Array.isArray(result.appliedTransitEntries) ? result.appliedTransitEntries : result.transitProposals).map((entry, index) => ({ ...entry, id: `proposal-${index}`, at: timestampToDateTimeInput(entry.at), source: 'ai_mail', ...(entry.kind === 'pause' ? { durationChoice: 'custom' } : {}) }))
      setPreview(result); setBase(baseline); setValues(filled); setEntries(nextEntries); setOriginalEntries(nextEntries)
      setOpenStages(action.state === 'completed' ? stages.map(stage => stage.id) : stages.filter(stage => stage.id === 'in_transit' ? nextEntries.length : [...shipmentTrackingStageConfigurations[stage.id].fields, ...(stage.id === 'preparation' ? ['tractorLicensePlate', 'trailerLicensePlate'] : [])].some(field => Object.hasOwn(result.proposals, field))).map(stage => stage.id))
    })
    return () => { active = false }
  }, [action.result, action.jobId, action.state])
  async function analyse(number) {
    if (busy || saving || action.busy || action.state === 'completed') return
    setBusy(true); setError(''); setAssignmentError(''); setAssignment(false); setOpen(false)
    try {
      await action.start({ ...(number ? { orderNumber: number } : {}), ...(action.state === 'review' ? { restart: true } : {}) })
    } catch (caught) { setError(errorText(caught, w)); setAssignmentError(errorText(caught, w)) }
    finally { setBusy(false) }
  }
  async function discard() {
    if (busy || saving || action.busy) return
    setBusy(true); setError('')
    try {
      await action.discard()
      setPreview(null); setValues({}); setBase({}); setEntries([]); setOriginalEntries([]); setOpenStages([]); setAssignment(false); setOpen(false); adoptedResult.current = null
    } catch (caught) { setError(errorText(caught, w)) }
    finally { setBusy(false) }
  }
  function activate() {
    if (busy || saving || action.busy) return
    if (action.state === 'review' || action.state === 'completed' || action.state === 'failed') {
      setOpen(true)
      if (action.result?.needsAssignment && action.state === 'review') setAssignment(true)
      if (action.state === 'completed') setOpenStages(stages.map(stage => stage.id))
      return
    }
    void analyse()
  }
  function close() { if (saving) return; ++generation.current; setBusy(false); setAssignment(false); setOpen(false) }
  const changed = Object.keys(values).filter(field => values[field] !== base[field])
  async function apply(event) {
    event.preventDefault()
    if (saving || busy || action.busy || action.state !== 'review' || !preview?.previewId) return
    let changes, transitEntries
    try {
      changes = Object.fromEntries(changed.map(field => [field, field.endsWith('At') ? values[field] ? new Date(values[field]).toISOString() : null : field === 'driverCount' ? Number(values[field]) : values[field] || null]))
      transitEntries = entries.map(entry => { const normalized = normalizedTransitEntry(entry); return { ...normalized, at: new Date(normalized.at).toISOString(), ...(entry.id.startsWith('proposal-') ? { proposalIndex: Number(entry.id.slice(9)) } : {}) } })
    } catch (caught) { setError(caught.message); return }
    setSaving(true); setError('')
    try {
      const result = await mailboxCall('applyMailboxTracking', { connectionId: identity.connectionId, previewId: preview.previewId, changes, transitEntries })
      await action.complete({ previewId: preview.previewId })
      setOpen(false)
      setToast(result.alreadyApplied ? w('Diese Mail wurde bereits übernommen.', 'This message was already applied.') : w('Sendungsstatus aktualisiert.', 'Shipment status updated.'))
    } catch (caught) { setError(errorText(caught, w)) }
    finally { setSaving(false) }
  }
  return <><MailActionButton kind="tracking" state={action.state} expanded={open} disabled={busy || saving || action.busy} onClick={activate}>{action.state === 'running' || busy ? w('Status wird ausgelesen …', 'Reading status …') : action.state === 'review' ? w('Statusangaben prüfen', 'Review status information') : action.state === 'completed' ? w('Status übernommen', 'Status applied') : action.state === 'failed' ? w('Statusauswertung prüfen', 'Review status analysis') : w('Sendungsstatus aktualisieren', 'Update shipment status')}</MailActionButton>
    <MailWorkDialog open={open} title={w('Sendungsstatus aktualisieren', 'Update shipment status')} subtitle={preview?.order ? `TA ${preview.order.number} · ${preview.order.loading} → ${preview.order.unloading}` : undefined} left={mailContent} onClose={close} busy={saving} rightLoading={busy || saving || action.busy} loadingLabel={saving ? w('Angaben werden übernommen …', 'Applying information …') : w('Auftrag wird gesucht – KI wertet die Mail aus …', 'Finding order – AI is analysing the message …')}>
      <div className="mail-tracking-assignment-bar"><strong>{preview?.order ? `TA ${preview.order.number}` : w('Noch kein Auftrag zugeordnet', 'No order assigned')}</strong><button className="button button--secondary" type="button" disabled={busy || saving || action.busy || action.state === 'completed'} onClick={() => setAssignment(true)}>{w('Auftrag wählen', 'Choose order')}</button></div>
      {!busy && preview?.previewId && !Object.keys(preview.proposals).length && !preview.transitProposals.length && <p role="status">{w('Keine eindeutigen neuen Statusangaben erkannt. Du kannst die Angaben manuell ergänzen.', 'No clear new status information found. You can enter details manually.')}</p>}
      {(error || action.error) && <p className="form-error" role="alert">{error || errorText(action.error, w)}</p>}
      {action.state === 'completed' && <p role="status">{w('Die Angaben dieser Mail wurden bereits übernommen.', 'The information from this message has already been applied.')}</p>}
      {action.state !== 'completed' && <p className="mailbox-hint">{w('KI-Vorschläge prüfen. Erst „Angaben übernehmen“ speichert und startet bei Bedarf die Sendungsverfolgung.', 'Review AI suggestions. Apply information saves changes and starts tracking if necessary.')}</p>}
      {preview?.reviewRequired && <p className="mail-tracking-warning">{w('Die KI konnte nicht alle Angaben eindeutig interpretieren. Bitte besonders sorgfältig prüfen.', 'Some details are ambiguous. Please review carefully.')}</p>}
      <form onSubmit={apply}><fieldset disabled={busy || saving || action.busy || action.state === 'completed' || !preview?.previewId} className="mail-tracking-stations">
        {stages.map(stage => <section className="mail-tracking-station" key={stage.id}><button type="button" className="mail-tracking-station-toggle" aria-expanded={openStages.includes(stage.id)} onClick={() => setOpenStages(current => current.includes(stage.id) ? current.filter(id => id !== stage.id) : [...current, stage.id])}>{w(stage.de, stage.en)} <span aria-hidden="true">{openStages.includes(stage.id) ? '−' : '+'}</span></button>
          {preview?.previewId && openStages.includes(stage.id) && <div className="mail-tracking-fields">{stage.id === 'in_transit' ? <ShipmentTrackingTransitFields entries={entries} initialNewEntries={originalEntries} onChange={setEntries} /> : <>
            <ShipmentTrackingStageFields stage={{ ...shipmentTrackingStageConfigurations[stage.id], id: stage.id }} values={values} onChange={(field, value) => setValues(current => ({ ...current, [field]: value }))} aiField={field => Object.hasOwn(preview.proposals, field) && values[field] === inputValue(field, preview.proposals[field])} />
            {stage.id === 'preparation' && ['tractorLicensePlate', 'trailerLicensePlate'].map(field => <label className="form-field" key={field}><span><StaticText source={fieldLabels[field]} /></span><input value={values[field] || ''} maxLength={80} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} className={Object.hasOwn(preview.proposals, field) && values[field] === preview.proposals[field] ? 'shipment-tracking-editor__input--ai' : undefined} /></label>)}
            {preview.conflicts.filter(field => shipmentTrackingStageConfigurations[stage.id].fields.includes(field) || stage.id === 'preparation' && ['tractorLicensePlate', 'trailerLicensePlate'].includes(field)).map(field => <div className="mail-tracking-warning" key={field}><strong><StaticText source={fieldLabels[field]} /></strong><p>{values[field] === inputValue(field, preview.proposals[field]) ? w('KI-Vorschlag ausgewählt.', 'AI suggestion selected.') : w('Vorhandener Wert bleibt erhalten.', 'The existing value is preserved.')} {w('KI-Vorschlag:', 'AI suggestion:')} {inputValue(field, preview.proposals[field])}</p><button type="button" className="button button--secondary" onClick={() => setValues(current => ({ ...current, [field]: inputValue(field, preview.proposals[field]) }))}>{w('KI-Vorschlag verwenden', 'Use AI suggestion')}</button></div>)}
          </>}</div>}
        </section>)}
      </fieldset>{action.state !== 'completed' && <div className="mail-tracking-footer"><button className="button button--secondary" type="button" disabled={busy || saving} onClick={() => void analyse(preview?.order?.number)}>{w('Erneut auswerten', 'Analyse again')}</button>{action.state === 'review' && <button className="button button--secondary" type="button" disabled={busy || saving || action.busy} onClick={() => void discard()}>{w('Ergebnis verwerfen', 'Discard result')}</button>}<button className="button" type="submit" disabled={busy || saving || action.busy || !preview?.previewId || !changed.length && !entries.length}>{saving ? w('Wird übernommen …', 'Applying …') : w('Angaben übernehmen', 'Apply information')}</button></div>}</form>
    </MailWorkDialog>
    <AssignmentDialog open={open && assignment} busy={busy} candidates={preview?.candidates} error={assignmentError} onAssign={analyse} onClose={() => setAssignment(false)} w={w} />
    {toast && createPortal(<Toast message={toast} onDismiss={() => setToast('')} />, document.body)}
  </>
}




