import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { fieldLabels, proofLabels, shipmentTrackingFormValues, shipmentTrackingStageConfigurations, timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'

const actualTimeFields = new Set(['actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'actualDepartureLoadingAt', 'actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt'])

function dateTimeValue(date) { return timestampToDateTimeInput(date) }

function TimeField({ field, label = fieldLabels[field], value, onChange, quickActions = true }) {
  const isActual = actualTimeFields.has(field)
  return <label className="form-field shipment-tracking-editor__time-field"><span>{label}</span><div><input type="datetime-local" value={value} onChange={(event) => onChange(field, event.target.value)} />{quickActions && isActual && <><button type="button" className="button button--secondary" onClick={() => onChange(field, dateTimeValue(new Date()))}>Jetzt</button><select aria-label={`${fieldLabels[field]} zeitlich übernehmen`} defaultValue="" onChange={(event) => { const minutes = Number(event.target.value); if (minutes) { const date = new Date(); date.setMinutes(date.getMinutes() - minutes); onChange(field, dateTimeValue(date)) }; event.target.value = '' }}><option value="">Zeit wählen …</option><option value="15">vor 15 Min.</option><option value="30">vor 30 Min.</option><option value="60">vor 1 Std.</option></select></>}</div></label>
}

function StageFields({ stage, values, onChange }) {
  if (stage.id === 'preparation') return <div className="shipment-tracking-editor__license-plates"><label className="form-field"><span>Zugmaschine</span><input value={values.tractorLicensePlate} maxLength="80" onChange={(event) => onChange('tractorLicensePlate', event.target.value)} /></label><label className="form-field"><span>Auflieger</span><input value={values.trailerLicensePlate} maxLength="80" onChange={(event) => onChange('trailerLicensePlate', event.target.value)} /></label><label className="form-field"><span>Name vom LKW-Fahrer</span><input value={values.driverName} maxLength="140" autoComplete="name" onChange={(event) => onChange('driverName', event.target.value)} /></label><label className="form-field"><span>Handynummer vom Fahrer</span><input type="tel" value={values.driverPhone} maxLength="60" autoComplete="tel" onChange={(event) => onChange('driverPhone', event.target.value)} /></label></div>
  if (stage.id === 'loading') return <div className="shipment-tracking-editor__loading-groups"><section className="shipment-tracking-editor__loading-group"><h3>Ankunft</h3><div className="shipment-tracking-editor__time-grid"><TimeField field="estimatedArrivalLoadingAt" label="Voraussichtlich" value={values.estimatedArrivalLoadingAt} onChange={onChange} quickActions={false} /><TimeField field="actualArrivalLoadingAt" label="Tatsächlich" value={values.actualArrivalLoadingAt} onChange={onChange} quickActions={false} /></div></section><section className="shipment-tracking-editor__loading-group"><h3>Beladung</h3><div className="shipment-tracking-editor__time-grid"><TimeField field="loadingStartedAt" label="Start" value={values.loadingStartedAt} onChange={onChange} quickActions={false} /><TimeField field="loadingCompletedAt" label="Ende" value={values.loadingCompletedAt} onChange={onChange} quickActions={false} /></div></section><section className="shipment-tracking-editor__loading-group"><h3>Abfahrt</h3><div className="shipment-tracking-editor__time-grid"><TimeField field="estimatedDepartureLoadingAt" label="Voraussichtlich" value={values.estimatedDepartureLoadingAt} onChange={onChange} quickActions={false} /><TimeField field="actualDepartureLoadingAt" label="Tatsächlich" value={values.actualDepartureLoadingAt} onChange={onChange} quickActions={false} /></div></section></div>
  if (stage.id === 'unloading') return <div className="shipment-tracking-editor__loading-groups"><section className="shipment-tracking-editor__loading-group"><h3>Ankunft</h3><div className="shipment-tracking-editor__time-grid"><TimeField field="estimatedArrivalUnloadingAt" label="Voraussichtlich" value={values.estimatedArrivalUnloadingAt} onChange={onChange} quickActions={false} /><TimeField field="actualArrivalUnloadingAt" label="Tatsächlich" value={values.actualArrivalUnloadingAt} onChange={onChange} quickActions={false} /></div></section><section className="shipment-tracking-editor__loading-group"><h3>Entladung</h3><div className="shipment-tracking-editor__time-grid"><TimeField field="unloadingStartedAt" label="Start" value={values.unloadingStartedAt} onChange={onChange} quickActions={false} /><TimeField field="unloadingCompletedAt" label="Ende" value={values.unloadingCompletedAt} onChange={onChange} quickActions={false} /></div></section></div>
  if (stage.id === 'afterTransport') return <label className="form-field"><span>Nachweise</span><select value={values.proofStatus} onChange={(event) => onChange('proofStatus', event.target.value)}>{Object.entries(proofLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  return <div className="shipment-tracking-editor__time-grid">{stage.fields.map((field) => <TimeField key={field} field={field} value={values[field]} onChange={onChange} />)}</div>
}

export default function ShipmentTrackingEditorModal({ tracking, stageId, saving, onClose, onSave }) {
  const stage = shipmentTrackingStageConfigurations[stageId] || shipmentTrackingStageConfigurations.preparation
  const [initialValues] = useState(() => shipmentTrackingFormValues(tracking))
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState('')

  function update(field, value) { setValues((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    const changes = Object.fromEntries(stage.fields.filter((field) => values[field] !== initialValues[field]).map((field) => [field, values[field]]))
    if (!Object.keys(changes).length) { setError('Bitte ändere mindestens eine Angabe, bevor du speicherst.'); return }
    setError('')
    await onSave({ changes })
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-editor--stage" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-editor-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-editor-title">{stage.title}</h2>{stageId !== 'preparation' && stageId !== 'loading' && stageId !== 'unloading' && <p>Die Angabe wird getrennt vom Import gespeichert und im Verlauf protokolliert.</p>}</div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="shipment-tracking-editor__groups">
          <section><StageFields stage={{ ...stage, id: stageId }} values={values} onChange={update} /></section>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Update wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>, document.body)
}
