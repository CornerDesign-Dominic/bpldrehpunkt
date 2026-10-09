import { useEffect, useRef, useState } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { shipmentTrackingFormValues, shipmentTrackingStageConfigurations } from '../../lib/shipmentTrackingPresentation.js'
import { ShipmentTrackingStageFields } from './ShipmentTrackingEditorModal.jsx'
import ShipmentTrackingTransitFields from './ShipmentTrackingTransitFields.jsx'
import { existingTransitEntries, normalizedTransitEntry } from './shipmentTrackingEditorUtils.js'

const stages = [
  { id: 'preparation', title: 'Vorbereitung' },
  { id: 'loading', title: 'Ladestelle' },
  { id: 'in_transit', title: 'Unterwegs' },
  { id: 'unloading', title: 'Entladestelle' },
]

export default function ShipmentTrackingMailEditor({ tracking, events, canEdit, saving, saved, onSave, onSaved, onEdit }) {
  const [initialValues, setInitialValues] = useState(() => shipmentTrackingFormValues(tracking))
  const [values, setValues] = useState(initialValues)
  const [initialExisting, setInitialExisting] = useState(() => existingTransitEntries(events))
  const [existingEntries, setExistingEntries] = useState(initialExisting)
  const [transitEntries, setTransitEntries] = useState([])
  const [transitDirty, setTransitDirty] = useState(false)
  const [error, setError] = useState('')
  const baselineValues = useRef(initialValues)
  const previousTracking = useRef(tracking)

  useEffect(() => {
    if (previousTracking.current === tracking) return
    previousTracking.current = tracking
    const fresh = shipmentTrackingFormValues(tracking)
    const previous = baselineValues.current
    setValues((current) => Object.fromEntries(Object.keys(fresh).map((field) => [field, current[field] === previous[field] ? fresh[field] : current[field]])))
    baselineValues.current = fresh
    setInitialValues(fresh)
  }, [tracking])

  const aiField = (field) => values[field] === initialValues[field] && (tracking?.fieldSources?.[field]?.source === 'ai_mail' || (field === 'licensePlate' && !tracking?.licensePlate && ['tractorLicensePlate', 'trailerLicensePlate'].some((plateField) => tracking?.fieldSources?.[plateField]?.source === 'ai_mail')))
  const currentInitialExisting = transitDirty ? initialExisting : existingTransitEntries(events)
  const currentExistingEntries = transitDirty ? existingEntries : currentInitialExisting
  const changes = Object.fromEntries(stages.flatMap(({ id }) => shipmentTrackingStageConfigurations[id].fields).filter((field) => values[field] !== initialValues[field]).map((field) => [field, values[field]]))
  const edited = currentExistingEntries.filter((entry) => {
    const initial = currentInitialExisting.find((candidate) => candidate.id === entry.id)
    return ['at', 'kilometersToDestination', 'location', 'durationMinutes'].some((field) => entry[field] !== initial?.[field])
  })
  const removals = currentInitialExisting.filter((entry) => !currentExistingEntries.some((current) => current.id === entry.id)).map((entry) => entry.id)
  const hasChanges = Object.keys(changes).length > 0 || transitEntries.length > 0 || edited.length > 0 || removals.length > 0

  async function submit(event) {
    event.preventDefault()
    if (!hasChanges || saving) return
    let entries, corrections
    try {
      entries = transitEntries.map(normalizedTransitEntry)
      corrections = edited.map((entry) => ({ id: entry.id, entry: normalizedTransitEntry(entry) }))
    } catch (caught) { setError(caught.message); return }
    setError('')
    const result = await onSave({ changes, transitEntries: entries, transitCorrections: corrections, transitRemovals: removals })
    if (result?.ok) {
      const savedValues = shipmentTrackingFormValues(result.tracking || tracking)
      const savedEntries = existingTransitEntries(result.events || events)
      baselineValues.current = savedValues
      setInitialValues(savedValues); setValues(savedValues)
      setInitialExisting(savedEntries); setExistingEntries(savedEntries); setTransitEntries([]); setTransitDirty(false)
      onSaved()
    } else {
      if (result?.partial && Object.keys(changes).length) {
        baselineValues.current = { ...baselineValues.current, ...changes }
        setInitialValues(baselineValues.current)
      }
      setError(result?.partial ? 'Ein Teil der Angaben wurde gespeichert. Bitte prüfe die übrigen Eingaben und versuche es erneut.' : result?.error || 'Die Eingaben konnten nicht gespeichert werden.')
    }
  }

  return <form className="transport-order-received-mail-modal__tracking" onSubmit={(event) => void submit(event)} noValidate>
    <div className="transport-order-received-mail-modal__tracking-heading"><h3><StaticText source="Sendungsverfolgung" /></h3><p><StaticText source="KI-Werte sind farbig umrandet." /></p></div>
    <fieldset className="transport-order-received-mail-modal__tracking-scroll" disabled={!canEdit || !tracking || saving}>
      {!tracking && <p className="transport-order-received-mail-modal__tracking-notice"><StaticText source="Die Sendungsverfolgung wurde noch nicht gestartet. Angaben können erst danach gespeichert werden." /></p>}
      {stages.map(({ id, title }, index) => <details className="transport-order-received-mail-modal__stage" key={id}>
        <summary><h4><span>{index + 1}</span><StaticText source={title} /></h4></summary>
        <div className="transport-order-received-mail-modal__stage-fields">
          {id === 'in_transit'
            ? <ShipmentTrackingTransitFields entries={transitEntries} onChange={(next) => { setInitialExisting(currentInitialExisting); setExistingEntries(currentExistingEntries); setTransitEntries(next); setTransitDirty(true); onEdit() }} existingEntries={currentExistingEntries} initialExisting={currentInitialExisting} onExistingChange={(next) => { setInitialExisting(currentInitialExisting); setExistingEntries(next); setTransitDirty(true); onEdit() }} />
            : <ShipmentTrackingStageFields stage={{ ...shipmentTrackingStageConfigurations[id], id }} values={values} onChange={(field, value) => { setValues((current) => ({ ...current, [field]: value })); onEdit() }} aiField={aiField} />}
        </div>
      </details>)}
    </fieldset>
    <div className="transport-order-received-mail-modal__tracking-footer">
      {saved && <p className="transport-order-received-mail-modal__saved" role="status"><StaticText source="Eingaben übernommen." /></p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={!canEdit || !tracking || !hasChanges || saving}><StaticText source={saving ? 'Wird gespeichert …' : 'Eingaben speichern'} /></button>
    </div>
  </form>
}
