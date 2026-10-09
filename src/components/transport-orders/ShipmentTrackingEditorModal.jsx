import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { fieldLabels, proofLabels, shipmentTrackingFormValues, shipmentTrackingStageConfigurations, timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'
import ShipmentTrackingTransitFields from './ShipmentTrackingTransitFields.jsx'
import { existingTransitEntries, normalizedTransitEntry } from './shipmentTrackingEditorUtils.js'

const actualTimeFields = new Set(['actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'actualDepartureLoadingAt', 'actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt'])

function dateTimeValue(date) { return timestampToDateTimeInput(date) }

function TimeField({ field, label = fieldLabels[field], value, onChange, quickActions = true, ai = false }) {
  const isActual = actualTimeFields.has(field)
  return <label className="form-field shipment-tracking-editor__time-field"><span>{label}</span><div><input type="datetime-local" value={value} onChange={(event) => onChange(field, event.target.value)} className={ai ? 'shipment-tracking-editor__input--ai' : undefined} title={ai ? 'Von KI aus einer Status-Mail übernommen' : undefined} />{quickActions && isActual && <><button type="button" className="button button--secondary" onClick={() => onChange(field, dateTimeValue(new Date()))}><StaticText source={"Jetzt"} /></button><select aria-label={`${fieldLabels[field]} zeitlich übernehmen`} defaultValue="" onChange={(event) => { const minutes = Number(event.target.value); if (minutes) { const date = new Date(); date.setMinutes(date.getMinutes() - minutes); onChange(field, dateTimeValue(date)) }; event.target.value = '' }}><option value=""><StaticText source={"Zeit wählen …"} /></option><option value="15"><StaticText source={"vor 15 Min."} /></option><option value="30"><StaticText source={"vor 30 Min."} /></option><option value="60"><StaticText source={"vor 1 Std."} /></option></select></>}</div></label>
}

export function ShipmentTrackingStageFields({ stage, values, onChange, aiField }) {
  const timeField = (field, label, quickActions = false) => <TimeField field={field} label={label} value={values[field]} onChange={onChange} quickActions={quickActions} ai={aiField(field)} />
  if (stage.id === 'preparation') return <div className="shipment-tracking-editor__license-plates"><label className="form-field shipment-tracking-editor__license-plate"><span><StaticText source={"Kennzeichen"} /></span><input value={values.licensePlate} maxLength="180" onChange={(event) => onChange('licensePlate', event.target.value)} className={aiField('licensePlate') ? 'shipment-tracking-editor__input--ai' : undefined} title={aiField('licensePlate') ? 'Von KI aus einer Status-Mail übernommen' : undefined} /></label><label className="form-field"><span><StaticText source={"Name vom LKW-Fahrer"} /></span><input value={values.driverName} maxLength="140" autoComplete="name" onChange={(event) => onChange('driverName', event.target.value)} className={aiField('driverName') ? 'shipment-tracking-editor__input--ai' : undefined} title={aiField('driverName') ? 'Von KI aus einer Status-Mail übernommen' : undefined} /></label><label className="form-field"><span><StaticText source={"Handynummer vom Fahrer"} /></span><input type="tel" value={values.driverPhone} maxLength="60" autoComplete="tel" onChange={(event) => onChange('driverPhone', event.target.value)} className={aiField('driverPhone') ? 'shipment-tracking-editor__input--ai' : undefined} title={aiField('driverPhone') ? 'Von KI aus einer Status-Mail übernommen' : undefined} /></label><label className="form-field"><span><StaticText source={"Fahreranzahl"} /></span><select value={values.driverCount} onChange={(event) => onChange('driverCount', Number(event.target.value))} className={aiField('driverCount') ? 'shipment-tracking-editor__input--ai' : undefined} title={aiField('driverCount') ? 'Von KI aus einer Status-Mail übernommen' : undefined}><option value={1}>1 Fahrer</option><option value={2}>2 Fahrer</option></select></label></div>
  if (stage.id === 'loading') return <div className="shipment-tracking-editor__loading-groups"><section className="shipment-tracking-editor__loading-group"><h3><StaticText source={"Ankunft"} /></h3><div className="shipment-tracking-editor__time-grid">{timeField('estimatedArrivalLoadingAt', 'Voraussichtlich')}{timeField('actualArrivalLoadingAt', 'Tatsächlich')}</div></section><section className="shipment-tracking-editor__loading-group"><h3><StaticText source={"Beladung"} /></h3><div className="shipment-tracking-editor__time-grid">{timeField('loadingStartedAt', 'Start')}{timeField('loadingCompletedAt', 'Ende')}</div></section><section className="shipment-tracking-editor__loading-group"><h3><StaticText source={"Abfahrt"} /></h3><div className="shipment-tracking-editor__time-grid">{timeField('estimatedDepartureLoadingAt', 'Voraussichtlich')}{timeField('actualDepartureLoadingAt', 'Tatsächlich')}</div></section></div>
  if (stage.id === 'unloading') return <div className="shipment-tracking-editor__loading-groups"><section className="shipment-tracking-editor__loading-group"><h3><StaticText source={"Ankunft"} /></h3><div className="shipment-tracking-editor__time-grid">{timeField('estimatedArrivalUnloadingAt', 'Voraussichtlich')}{timeField('actualArrivalUnloadingAt', 'Tatsächlich')}</div></section><section className="shipment-tracking-editor__loading-group"><h3><StaticText source={"Entladung"} /></h3><div className="shipment-tracking-editor__time-grid">{timeField('unloadingStartedAt', 'Start')}{timeField('unloadingCompletedAt', 'Ende')}</div></section></div>
  if (stage.id === 'afterTransport') return <label className="form-field"><span><StaticText source={"Nachweise"} /></span><select value={values.proofStatus} onChange={(event) => onChange('proofStatus', event.target.value)}>{Object.entries(proofLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  return <div className="shipment-tracking-editor__time-grid">{stage.fields.map((field) => <TimeField key={field} field={field} value={values[field]} onChange={onChange} ai={aiField(field)} />)}</div>
}

export default function ShipmentTrackingEditorModal({ tracking, events, stageId, saving, onClose, onSave }) {
  const stage = shipmentTrackingStageConfigurations[stageId] || shipmentTrackingStageConfigurations.preparation
  const [initialValues] = useState(() => shipmentTrackingFormValues(tracking))
  const [values, setValues] = useState(initialValues)
  const [transitEntries, setTransitEntries] = useState([])
  const [initialExisting] = useState(() => existingTransitEntries(events))
  const [existingEntries, setExistingEntries] = useState(initialExisting)
  const [error, setError] = useState('')
  const aiField = (field) => values[field] === initialValues[field] && (tracking?.fieldSources?.[field]?.source === 'ai_mail' || (field === 'licensePlate' && !tracking?.licensePlate && ['tractorLicensePlate', 'trailerLicensePlate'].some((plateField) => tracking?.fieldSources?.[plateField]?.source === 'ai_mail')))

  function update(field, value) { setValues((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    if (stageId === 'in_transit') {
      const edited = existingEntries.filter((entry) => {
        const initial = initialExisting.find((candidate) => candidate.id === entry.id)
        return ['at', 'kilometersToDestination', 'location', 'durationMinutes'].some((field) => entry[field] !== initial?.[field])
      })
      const removals = initialExisting.filter((entry) => !existingEntries.some((current) => current.id === entry.id)).map((entry) => entry.id)
      if (!transitEntries.length && !edited.length && !removals.length) { setError('Bitte füge eine Meldung hinzu, ändere sie oder entferne sie.'); return }
      let entries, corrections
      try {
        entries = transitEntries.map(normalizedTransitEntry)
        corrections = edited.map((entry) => ({ id: entry.id, entry: normalizedTransitEntry(entry) }))
      } catch (caught) { setError(caught.message); return }
      setError('')
      const saved = await onSave({ transitEntries: entries, transitCorrections: corrections, transitRemovals: removals })
      if (saved === false) setError('Die Fahrtmeldungen konnten nicht gespeichert werden. Bitte versuche es erneut.')
      return
    }
    const changes = Object.fromEntries(stage.fields.filter((field) => values[field] !== initialValues[field]).map((field) => [field, values[field]]))
    if (!Object.keys(changes).length) { setError('Bitte ändere mindestens eine Angabe, bevor du speicherst.'); return }
    setError('')
    await onSave({ changes })
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-editor--stage" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-editor-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-editor-title">{stage.title}</h2></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></TranslatedProps></div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        {stageId === 'in_transit'
          ? <ShipmentTrackingTransitFields entries={transitEntries} onChange={setTransitEntries} existingEntries={existingEntries} initialExisting={initialExisting} onExistingChange={setExistingEntries} />
          : <div className="shipment-tracking-editor__groups"><section><ShipmentTrackingStageFields stage={{ ...stage, id: stageId }} values={values} onChange={update} aiField={aiField} /></section></div>}
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Update wird gespeichert …' : 'Speichern'} />}</button></div>
      </form>
    </section>
  </div>, document.body)
}
