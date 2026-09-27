import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { fieldLabels, proofLabels, shipmentTrackingFormValues, shipmentTrackingStageConfigurations, sourceLabels, timestampToDateTimeInput } from '../../lib/shipmentTrackingPresentation.js'

const actualTimeFields = new Set(['actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'actualDepartureLoadingAt', 'actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt'])

function dateTimeValue(date) { return timestampToDateTimeInput(date) }

function TimeField({ field, value, onChange }) {
  const isActual = actualTimeFields.has(field)
  return <label className="form-field shipment-tracking-editor__time-field"><span>{fieldLabels[field]}</span><div><input type="datetime-local" value={value} onChange={(event) => onChange(field, event.target.value)} />{isActual && <><button type="button" className="button button--secondary" onClick={() => onChange(field, dateTimeValue(new Date()))}>Jetzt</button><select aria-label={`${fieldLabels[field]} zeitlich übernehmen`} defaultValue="" onChange={(event) => { const minutes = Number(event.target.value); if (minutes) { const date = new Date(); date.setMinutes(date.getMinutes() - minutes); onChange(field, dateTimeValue(date)) }; event.target.value = '' }}><option value="">Zeit wählen …</option><option value="15">vor 15 Min.</option><option value="30">vor 30 Min.</option><option value="60">vor 1 Std.</option></select></>}</div></label>
}

function StageFields({ stage, values, onChange }) {
  if (stage.id === 'preparation') return <label className="form-field"><span>Kennzeichen</span><input value={values.licensePlate} maxLength="80" onChange={(event) => onChange('licensePlate', event.target.value)} /></label>
  if (stage.id === 'afterTransport') return <label className="form-field"><span>Nachweise</span><select value={values.proofStatus} onChange={(event) => onChange('proofStatus', event.target.value)}>{Object.entries(proofLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  return <div className="shipment-tracking-editor__time-grid">{stage.fields.map((field) => <TimeField key={field} field={field} value={values[field]} onChange={onChange} />)}</div>
}

export default function ShipmentTrackingEditorModal({ tracking, stageId, saving, onClose, onSave }) {
  const stage = shipmentTrackingStageConfigurations[stageId] || shipmentTrackingStageConfigurations.preparation
  const [initialValues] = useState(() => shipmentTrackingFormValues(tracking))
  const [values, setValues] = useState(initialValues)
  const [source, setSource] = useState('manual')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function update(field, value) { setValues((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    const changes = Object.fromEntries(stage.fields.filter((field) => values[field] !== initialValues[field]).map((field) => [field, values[field]]))
    if (!Object.keys(changes).length) { setError('Bitte ändere mindestens eine Angabe, bevor du speicherst.'); return }
    setError('')
    await onSave({ changes, source, note })
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-editor--stage" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-editor-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-editor-title">{stage.title}</h2><p>Die Angabe wird getrennt vom Import gespeichert und im Verlauf protokolliert.</p></div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="shipment-tracking-editor__groups">
          <section><StageFields stage={{ ...stage, id: stageId }} values={values} onChange={update} /></section>
          <section><h3>Quelle und Bemerkung</h3><div className="shipment-tracking-editor__source"><label className="form-field"><span>Quelle der Information</span><select value={source} onChange={(event) => setSource(event.target.value)}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Bemerkung</span><textarea rows="3" maxLength="2000" value={note} onChange={(event) => setNote(event.target.value)} /></label></div></section>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Update wird gespeichert …' : 'Speichern'}</button></div>
      </form>
    </section>
  </div>, document.body)
}
